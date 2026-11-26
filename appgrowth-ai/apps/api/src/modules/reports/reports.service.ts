import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import { cpiMinor, fromMinor } from '../../common/money';
import { paged, skipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { QUEUES, queue } from '../../queues/queues';
import { Orchestrator } from '../ai/orchestrator.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';

export type ReportKind = 'daily' | 'weekly' | 'monthly' | 'budget' | 'campaign' | 'installs' | 'recommendations';
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const csvCell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; }; // CSV-injection safe

export function periodFor(kind: ReportKind, now = new Date()): { start: Date; end: Date } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (kind === 'daily') return { start: new Date(today.getTime() - DAY), end: new Date(today.getTime() - DAY) };
  if (kind === 'weekly') return { start: new Date(today.getTime() - 7 * DAY), end: new Date(today.getTime() - DAY) };
  if (kind === 'monthly') { const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)); return { start: s, end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)) }; }
  return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end: today };
}

/** Reporting engine: computes metrics from rollups (authoritative), adds an AI narrative when available, renders PDF+CSV. */
@Injectable()
export class ReportsService {
  private log = new Logger('Reports');
  constructor(private prisma: PrismaService, private storage: StorageService, private orch: Orchestrator, private notify: NotificationsService, private audit: AuditService) {}

  async request(orgId: string, userId: string | null, kind: ReportKind, opts: { from?: string; to?: string; applicationId?: string } = {}) {
    const p = opts.from && opts.to ? { start: new Date(`${opts.from}T00:00:00Z`), end: new Date(`${opts.to}T00:00:00Z`) } : periodFor(kind);
    if (p.end < p.start || p.end.getTime() - p.start.getTime() > 366 * DAY) throw new AppError('Invalid period (max one year)', 400, 'invalid_period');
    if (opts.applicationId && !(await this.prisma.application.count({ where: { id: opts.applicationId, organizationId: orgId } }))) throw notFound('Application');
    const title = `${kind[0].toUpperCase()}${kind.slice(1)} report · ${iso(p.start)}${iso(p.start) === iso(p.end) ? '' : ` to ${iso(p.end)}`}`;
    const r = await this.prisma.report.create({ data: { organizationId: orgId, kind, title, periodStart: p.start, periodEnd: p.end, applicationId: opts.applicationId, requestedById: userId } });
    await queue(QUEUES.reports).add(kind, { organizationId: orgId, reportId: r.id }, { jobId: r.id });
    return r;
  }

  async compute(orgId: string, start: Date, end: Date, applicationId?: string | null) {
    const endEx = new Date(end.getTime() + DAY);
    const appWhere = { organizationId: orgId, ...(applicationId ? { applicationId } : {}), date: { gte: start, lt: endEx } };
    const [org, totals, byDay, campaigns, metrics, budget, spentMonth, countries, decisions] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
      this.prisma.analyticsDaily.aggregate({ where: appWhere, _sum: { firstInstalls: true, reinstalls: true, organicInstalls: true, paidInstalls: true, unattributedInstalls: true, aggregateAttributedInstalls: true, registrations: true, spendMinor: true } }),
      this.prisma.analyticsDaily.groupBy({ by: ['date'], where: appWhere, _sum: { firstInstalls: true, paidInstalls: true, organicInstalls: true, aggregateAttributedInstalls: true, registrations: true, spendMinor: true }, orderBy: { date: 'asc' } }),
      this.prisma.campaign.findMany({ where: { organizationId: orgId, deletedAt: null, ...(applicationId ? { applicationId } : {}) }, select: { id: true, name: true, provider: true, platform: true, status: true, targetCpiMinor: true, dailyBudgetMinor: true } }),
      this.prisma.campaignMetric.groupBy({ by: ['campaignId'], where: { organizationId: orgId, date: { gte: start, lt: endEx } }, _sum: { impressions: true, clicks: true, installs: true, spendMinor: true } }),
      this.prisma.organizationBudget.findUnique({ where: { organizationId_month: { organizationId: orgId, month: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)) } } }),
      this.prisma.advertisingSpend.aggregate({ where: { organizationId: orgId, date: { gte: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)), lt: endEx } }, _sum: { amountMinor: true } }),
      this.prisma.countryMetric.groupBy({ by: ['country'], where: appWhere, _sum: { installs: true, paidInstalls: true, spendMinor: true }, orderBy: { _sum: { installs: 'desc' } }, take: 15 }),
      this.prisma.optimizationDecision.findMany({ where: { organizationId: orgId, createdAt: { gte: start, lt: endEx } }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    const mm = new Map(metrics.map((m) => [m.campaignId, m._sum]));
    const s = totals._sum; const paid = (s.paidInstalls ?? 0) + (s.aggregateAttributedInstalls ?? 0); const spend = s.spendMinor ?? 0n;
    return {
      organization: org.name, currency: org.currency, period: { from: iso(start), to: iso(end) },
      totals: { installs: (s.firstInstalls ?? 0) + (s.aggregateAttributedInstalls ?? 0), firstInstalls: s.firstInstalls ?? 0, reinstalls: s.reinstalls ?? 0, paidInstalls: paid, organicInstalls: s.organicInstalls ?? 0, unattributedInstalls: s.unattributedInstalls ?? 0, iosAggregateInstalls: s.aggregateAttributedInstalls ?? 0, registrations: s.registrations ?? 0, spend: fromMinor(spend), cpi: fromMinor(cpiMinor(spend, paid)) },
      daily: byDay.map((d) => ({ date: iso(d.date), installs: (d._sum.firstInstalls ?? 0) + (d._sum.aggregateAttributedInstalls ?? 0), paid: (d._sum.paidInstalls ?? 0) + (d._sum.aggregateAttributedInstalls ?? 0), organic: d._sum.organicInstalls ?? 0, registrations: d._sum.registrations ?? 0, spend: fromMinor(d._sum.spendMinor ?? 0n) })),
      campaigns: campaigns.map((c) => { const m = mm.get(c.id); const sp = m?.spendMinor ?? 0n; const inst = m?.installs ?? 0; return { name: c.name, channel: c.provider, platform: c.platform, status: c.status, impressions: Number(m?.impressions ?? 0), clicks: Number(m?.clicks ?? 0), installs: inst, spend: fromMinor(sp), cpi: fromMinor(cpiMinor(sp, inst)), targetCpi: fromMinor(c.targetCpiMinor), dailyBudget: fromMinor(c.dailyBudgetMinor) }; }).filter((c) => c.installs || Number(c.spend) || c.status === 'ACTIVE'),
      budget: budget ? { month: iso(budget.month).slice(0, 7), limit: fromMinor(budget.monthlyLimitMinor), spent: fromMinor(spentMonth._sum.amountMinor ?? 0n), remaining: fromMinor(budget.monthlyLimitMinor - (spentMonth._sum.amountMinor ?? 0n)) } : null,
      countries: countries.map((c) => ({ country: c.country, installs: c._sum.installs ?? 0, paidInstalls: c._sum.paidInstalls ?? 0, spend: fromMinor(c._sum.spendMinor ?? 0n) })),
      decisions: decisions.map((d) => ({ kind: d.kind, outcome: d.outcome, rationale: d.rationale.slice(0, 300), date: iso(d.createdAt) })),
    };
  }

  /** Worker: build the report files. */
  async build(reportId: string) {
    const r = await this.prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    if (r.status === 'ready') return;
    try {
      const data = await this.compute(r.organizationId, r.periodStart, r.periodEnd, r.applicationId);
      let narrative: Record<string, unknown> | null = null; let narrativeNote = '';
      try {
        const run = await this.orch.runNow(r.organizationId, 'reporting', { applicationId: r.applicationId ?? undefined, params: { report_kind: r.kind, metrics: data } }, { trigger: 'workflow' });
        narrative = (run.output as Record<string, unknown>) ?? null;
      } catch (e) { narrativeNote = `AI summary unavailable: ${(e as Error).message.slice(0, 120)}`; }
      const pdf = await this.pdf(r.title, data, narrative, narrativeNote);
      const csv = this.csv(data);
      const [pdfKey, csvKey] = await Promise.all([
        this.storage.putGenerated(r.organizationId, 'reports', pdf, 'application/pdf', 'pdf'),
        this.storage.putGenerated(r.organizationId, 'reports', Buffer.from(csv, 'utf8'), 'text/csv', 'csv'),
      ]);
      await this.prisma.report.update({ where: { id: r.id }, data: { status: 'ready', data: { ...data, narrative, narrativeNote } as unknown as Prisma.InputJsonValue, pdfKey, csvKey, readyAt: new Date(), error: null } });
      return { pdf, csv, data };
    } catch (e) {
      await this.prisma.report.update({ where: { id: r.id }, data: { status: 'failed', error: (e as Error).message.slice(0, 1000) } });
      throw e;
    }
  }

  private csv(d: Awaited<ReturnType<ReportsService['compute']>>) {
    const lines = [['section', 'date/name', 'installs', 'paid', 'organic', 'registrations', 'spend', 'cpi'].join(',')];
    for (const x of d.daily) lines.push(['daily', x.date, x.installs, x.paid, x.organic, x.registrations, x.spend, ''].map(csvCell).join(','));
    for (const c of d.campaigns) lines.push(['campaign', `${c.name} (${c.channel})`, c.installs, c.installs, '', '', c.spend, c.cpi ?? ''].map(csvCell).join(','));
    for (const c of d.countries) lines.push(['country', c.country, c.installs, c.paidInstalls, '', '', c.spend, ''].map(csvCell).join(','));
    lines.push(['total', `${d.period.from}..${d.period.to}`, d.totals.installs, d.totals.paidInstalls, d.totals.organicInstalls, d.totals.registrations, d.totals.spend, d.totals.cpi ?? ''].map(csvCell).join(','));
    return lines.join('\n') + '\n';
  }

  private pdf(title: string, d: Awaited<ReturnType<ReportsService['compute']>>, n: Record<string, unknown> | null, note: string): Promise<Buffer> {
    return new Promise((ok, fail) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: title, Author: 'AppGrowth AI — Nous Healthcare Solutions' } });
      const chunks: Buffer[] = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => ok(Buffer.concat(chunks))); doc.on('error', fail);
      const cur = d.currency; const money = (v: string | null) => (v === null ? '—' : `${cur} ${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
      doc.fillColor('#4f46e5').fontSize(10).text('AppGrowth AI', { continued: true }).fillColor('#666').text(`  ·  ${d.organization}`);
      doc.moveDown(0.5).fillColor('#111').fontSize(18).text(title);
      doc.fontSize(9).fillColor('#666').text(`Period ${d.period.from} to ${d.period.to} (UTC). Figures from platform-reported spend and de-duplicated attribution.`).moveDown();
      if (n) {
        doc.fillColor('#111').fontSize(13).text(String(n.headline ?? '')).moveDown(0.3).fontSize(10).fillColor('#333').text(String(n.summary ?? '')).moveDown(0.5);
        for (const [label, key] of [['Highlights', 'highlights'], ['Concerns', 'concerns'], ['Next steps', 'next_steps']] as const) {
          const items = Array.isArray(n[key]) ? (n[key] as string[]) : [];
          if (items.length) { doc.fontSize(11).fillColor('#111').text(label); doc.fontSize(10).fillColor('#333').list(items, { bulletRadius: 1.5 }); doc.moveDown(0.4); }
        }
      } else if (note) doc.fontSize(9).fillColor('#a16207').text(note).moveDown();
      const t = d.totals;
      doc.moveDown(0.3).fontSize(12).fillColor('#111').text('Totals');
      const kv: [string, string][] = [['Installs', String(t.installs)], ['Paid installs', String(t.paidInstalls)], ['Organic installs', String(t.organicInstalls)], ['Unattributed', String(t.unattributedInstalls)], ['iOS aggregate (SKAN/AAK)', String(t.iosAggregateInstalls)], ['Reinstalls (not counted as installs)', String(t.reinstalls)], ['Registrations', String(t.registrations)], ['Ad spend', money(t.spend)], ['Cost per install', money(t.cpi)]];
      doc.fontSize(10); for (const [k, v] of kv) doc.fillColor('#555').text(k, { continued: true, width: 250 }).fillColor('#111').text(`  ${v}`);
      if (d.budget) doc.moveDown(0.5).fillColor('#111').fontSize(12).text(`Budget ${d.budget.month}`).fontSize(10).fillColor('#333').text(`${money(d.budget.spent)} spent of ${money(d.budget.limit)} — ${money(d.budget.remaining)} remaining`);
      if (d.campaigns.length) {
        doc.moveDown(0.5).fillColor('#111').fontSize(12).text('Campaigns').fontSize(9);
        for (const c of d.campaigns.slice(0, 30)) doc.fillColor('#333').text(`${c.name} · ${c.channel.replace('_ADS', '')} · ${c.platform} · ${c.status.toLowerCase()} — ${c.installs} installs, ${money(c.spend)}, CPI ${money(c.cpi)}${c.targetCpi ? ` (target ${money(c.targetCpi)})` : ''}`);
      }
      if (d.countries.length) { doc.moveDown(0.5).fillColor('#111').fontSize(12).text('Top countries').fontSize(9); for (const c of d.countries) doc.fillColor('#333').text(`${c.country}: ${c.installs} installs (${c.paidInstalls} paid), ${money(c.spend)}`); }
      if (d.decisions.length) { doc.moveDown(0.5).fillColor('#111').fontSize(12).text('Optimization decisions').fontSize(9); for (const x of d.decisions.slice(0, 15)) doc.fillColor('#333').text(`${x.date} ${x.kind} (${x.outcome}): ${x.rationale}`); }
      doc.moveDown().fontSize(8).fillColor('#888').text('Installs are not guaranteed. iOS SKAdNetwork/AdAttributionKit results are aggregate and delayed by Apple; they are shown separately and never matched to users.');
      doc.end();
    });
  }

  async list(orgId: string, userId: string, q: { page: number; pageSize: number; kind?: string }) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const where = { organizationId: orgId, ...(q.kind ? { kind: q.kind } : {}) };
      const [items, total] = await Promise.all([tx.report.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q), select: { id: true, kind: true, title: true, periodStart: true, periodEnd: true, status: true, error: true, createdAt: true, readyAt: true, applicationId: true } }), tx.report.count({ where })]);
      return paged(items, total, q);
    });
  }

  async get(orgId: string, userId: string, id: string) {
    const r = await this.prisma.tenant(orgId, userId, (tx) => tx.report.findFirst({ where: { id, organizationId: orgId } }));
    if (!r) throw notFound('Report');
    return { ...r, pdfKey: undefined, csvKey: undefined, pdfUrl: r.pdfKey ? this.storage.signedUrl(r.pdfKey, 600) : null, csvUrl: r.csvKey ? this.storage.signedUrl(r.csvKey, 600) : null };
  }

  async downloadUrl(orgId: string, userId: string, id: string, format: 'pdf' | 'csv') {
    const r = await this.prisma.tenant(orgId, userId, (tx) => tx.report.findFirst({ where: { id, organizationId: orgId } }));
    if (!r) throw notFound('Report');
    const key = format === 'pdf' ? r.pdfKey : r.csvKey;
    if (r.status !== 'ready' || !key) throw new AppError('The report is not ready yet', 409, 'not_ready');
    await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'report.downloaded', entityType: 'report', entityId: id, after: { format } });
    return this.storage.signedUrl(key, 300);
  }

  /** Daily report email with the PDF attached, to users who opted in (report_ready email on by default). */
  async deliver(reportId: string) {
    const r = await this.prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    if (r.status !== 'ready' || !r.pdfKey) return;
    const stream = await this.storage.get(r.pdfKey); const chunks: Buffer[] = []; for await (const c of stream) chunks.push(c as Buffer);
    await this.notify.notifyOrg(r.organizationId, { kind: 'report_ready', title: r.title, body: 'Your report is ready. The PDF is attached; open AppGrowth AI for the CSV and details.', link: `/reports?open=${r.id}`, dedupeKey: `report:${r.id}`, permission: 'reports.read', attachments: [{ filename: `${r.kind}-${iso(r.periodEnd)}.pdf`, content: Buffer.concat(chunks) }] });
  }
}
