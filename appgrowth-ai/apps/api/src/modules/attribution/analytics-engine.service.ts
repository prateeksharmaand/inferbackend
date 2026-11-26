import { Injectable, Logger } from '@nestjs/common';
import { Platform, Prisma } from '@prisma/client';
import { cpiMinor } from '../../common/money';
import { PrismaService } from '../../common/prisma.service';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const SKAN_SOURCES = ['skadnetwork', 'adattributionkit'];

/**
 * Analytics Processing Engine. Rebuilds rollups for an app and date range from raw events and platform metrics.
 * Idempotent: each run deletes and re-inserts the range in one transaction, so it can be re-run any time.
 *
 * Counting rules (documented in docs/AI_AGENT_ARCHITECTURE.md → Attribution methodology):
 *  - firstInstalls / organic / paid / unattributed come from user-level install events (one per device, de-duplicated).
 *  - Reinstalls are counted separately and never as installs.
 *  - SKAdNetwork / AdAttributionKit postbacks → aggregateAttributedInstalls (iOS), added to paid totals in the UI but never
 *    to user-level counts (they cannot be de-duplicated against them).
 *  - Aggregate sources (GA4/Firebase first_open, Adjust reports) fill firstInstalls only for days/platforms without
 *    user-level data, so one source of truth is used per day.
 */
@Injectable()
export class AnalyticsEngine {
  private log = new Logger('AnalyticsEngine');
  constructor(private prisma: PrismaService) {}

  async rollupOrg(orgId: string, days = 35) {
    const apps = await this.prisma.application.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true } });
    const to = new Date(); const from = new Date(to.getTime() - days * DAY);
    for (const a of apps) await this.rollupApp(orgId, a.id, from, to);
    return { apps: apps.length };
  }

  async rollupApp(orgId: string, appId: string, fromIn: Date, toIn: Date) {
    const from = new Date(Date.UTC(fromIn.getUTCFullYear(), fromIn.getUTCMonth(), fromIn.getUTCDate()));
    const end = new Date(Date.UTC(toIn.getUTCFullYear(), toIn.getUTCMonth(), toIn.getUTCDate()) + DAY);
    const [app, org] = await Promise.all([this.prisma.application.findUniqueOrThrow({ where: { id: appId }, include: { platforms: true } }), this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } })]);
    const defaultPlatform: Platform = app.platforms[0]?.platform ?? 'ANDROID';
    type K = `${string}|${Platform}`;
    const rows = new Map<K, { first: number; re: number; organic: number; paid: number; unattr: number; agg: number; regs: number; active: number; spend: bigint; aggFallback: number }>();
    const row = (d: string, p: Platform) => { const k = `${d}|${p}` as K; let r = rows.get(k); if (!r) { r = { first: 0, re: 0, organic: 0, paid: 0, unattr: 0, agg: 0, regs: 0, active: 0, spend: 0n, aggFallback: 0 }; rows.set(k, r); } return r; };

    const installs = await this.prisma.$queryRaw<{ d: Date; platform: Platform; kind: string; attribution: string; n: bigint }[]>`
      SELECT ("installedAt" AT TIME ZONE 'UTC')::date AS d, platform, kind::text, attribution::text, count(*) AS n FROM install_events
      WHERE "applicationId" = ${appId}::uuid AND "installedAt" >= ${from} AND "installedAt" < ${end} GROUP BY 1, 2, 3, 4`;
    for (const r of installs) {
      const x = row(iso(r.d), r.platform); const n = Number(r.n);
      if (r.kind === 'REINSTALL') { x.re += n; continue; }
      x.first += n;
      if (r.attribution === 'PAID') x.paid += n; else if (r.attribution === 'ORGANIC') x.organic += n; else x.unattr += n;
    }
    const aggs = await this.prisma.attributionEvent.groupBy({ by: ['date', 'source'], where: { applicationId: appId, date: { gte: from, lt: end } }, _sum: { installs: true } });
    const aggRaw = await this.prisma.attributionEvent.findMany({ where: { applicationId: appId, date: { gte: from, lt: end }, source: { notIn: SKAN_SOURCES } }, select: { date: true, installs: true, raw: true } });
    for (const a of aggs) if (SKAN_SOURCES.includes(a.source)) row(iso(a.date), 'IOS').agg += a._sum.installs ?? 0;
    for (const a of aggRaw) {
      const os = String((a.raw as { platform?: string })?.platform ?? '').toLowerCase();
      const p: Platform = os.includes('ios') ? 'IOS' : os.includes('android') ? 'ANDROID' : defaultPlatform;
      row(iso(a.date), p).aggFallback += a.installs;
    }
    const regs = await this.prisma.$queryRaw<{ d: Date; platform: Platform | null; n: bigint }[]>`
      SELECT ("occurredAt" AT TIME ZONE 'UTC')::date AS d, platform, count(*) AS n FROM conversion_events
      WHERE "applicationId" = ${appId}::uuid AND category = 'registration' AND "occurredAt" >= ${from} AND "occurredAt" < ${end} GROUP BY 1, 2`;
    for (const r of regs) row(iso(r.d), r.platform ?? defaultPlatform).regs += Number(r.n);
    const active = await this.prisma.$queryRaw<{ d: Date; platform: Platform | null; n: bigint }[]>`
      SELECT ("occurredAt" AT TIME ZONE 'UTC')::date AS d, platform, count(DISTINCT "deviceIdHash") AS n FROM conversion_events
      WHERE "applicationId" = ${appId}::uuid AND "deviceIdHash" IS NOT NULL AND "occurredAt" >= ${from} AND "occurredAt" < ${end} GROUP BY 1, 2`;
    for (const r of active) row(iso(r.d), r.platform ?? defaultPlatform).active += Number(r.n);
    const spend = await this.prisma.$queryRaw<{ d: Date; platform: Platform; amount: bigint }[]>`
      SELECT s.date AS d, c.platform, sum(s."amountMinor")::bigint AS amount FROM advertising_spend s JOIN campaigns c ON c.id = s."campaignId"
      WHERE c."applicationId" = ${appId}::uuid AND s.date >= ${from} AND s.date < ${end} GROUP BY 1, 2`;
    for (const r of spend) row(iso(r.d), r.platform).spend += BigInt(r.amount);

    // Campaign rollups
    const campaigns = await this.prisma.campaign.findMany({ where: { applicationId: appId }, select: { id: true } });
    const cIds = campaigns.map((c) => c.id);
    const cm = cIds.length ? await this.prisma.campaignMetric.groupBy({ by: ['campaignId', 'date'], where: { campaignId: { in: cIds }, date: { gte: from, lt: end } }, _sum: { impressions: true, clicks: true, installs: true, spendMinor: true } }) : [];
    const ci = cIds.length ? await this.prisma.$queryRaw<{ c: string; d: Date; n: bigint }[]>`SELECT "campaignId"::text AS c, ("installedAt" AT TIME ZONE 'UTC')::date AS d, count(*) AS n FROM install_events WHERE "campaignId" = ANY(${cIds}::uuid[]) AND kind = 'FIRST_INSTALL' AND "installedAt" >= ${from} AND "installedAt" < ${end} GROUP BY 1, 2` : [];
    const cr = cIds.length ? await this.prisma.$queryRaw<{ c: string; d: Date; n: bigint }[]>`SELECT "campaignId"::text AS c, ("occurredAt" AT TIME ZONE 'UTC')::date AS d, count(*) AS n FROM conversion_events WHERE "campaignId" = ANY(${cIds}::uuid[]) AND category = 'registration' AND "occurredAt" >= ${from} AND "occurredAt" < ${end} GROUP BY 1, 2` : [];
    const ck = (c: string, d: Date | string) => `${c}|${typeof d === 'string' ? d : iso(d)}`;
    const attributed = new Map(ci.map((x) => [ck(x.c, x.d), Number(x.n)])); const regsBy = new Map(cr.map((x) => [ck(x.c, x.d), Number(x.n)]));
    const campaignRows = new Map<string, Prisma.AnalyticsCampaignDailyCreateManyInput>();
    for (const m of cm) {
      const spendM = m._sum.spendMinor ?? 0n; const inst = m._sum.installs ?? 0;
      campaignRows.set(ck(m.campaignId, m.date), { organizationId: orgId, campaignId: m.campaignId, date: m.date, impressions: m._sum.impressions ?? 0n, clicks: m._sum.clicks ?? 0n, platformInstalls: inst, attributedInstalls: attributed.get(ck(m.campaignId, m.date)) ?? 0, registrations: regsBy.get(ck(m.campaignId, m.date)) ?? 0, spendMinor: spendM, cpiMinor: cpiMinor(spendM, inst) });
    }
    for (const [k, n] of attributed) if (!campaignRows.has(k)) { const [c, d] = k.split('|'); campaignRows.set(k, { organizationId: orgId, campaignId: c, date: new Date(`${d}T00:00:00Z`), attributedInstalls: n, registrations: regsBy.get(k) ?? 0 }); }

    // Country rollups
    const countries = await this.prisma.$queryRaw<{ d: Date; country: string; total: bigint; paid: bigint }[]>`
      SELECT ("installedAt" AT TIME ZONE 'UTC')::date AS d, country, count(*) AS total, count(*) FILTER (WHERE attribution = 'PAID') AS paid FROM install_events
      WHERE "applicationId" = ${appId}::uuid AND kind = 'FIRST_INSTALL' AND "installedAt" >= ${from} AND "installedAt" < ${end} GROUP BY 1, 2`;
    const countrySpend = cIds.length ? await this.prisma.campaignMetric.groupBy({ by: ['date', 'country'], where: { campaignId: { in: cIds }, date: { gte: from, lt: end } }, _sum: { spendMinor: true, installs: true } }) : [];
    const ctry = new Map<string, Prisma.CountryMetricCreateManyInput>();
    for (const r of countries) ctry.set(`${iso(r.d)}|${r.country}`, { organizationId: orgId, applicationId: appId, country: r.country, date: r.d, installs: Number(r.total), paidInstalls: Number(r.paid), spendMinor: 0n });
    for (const s of countrySpend) {
      const k = `${iso(s.date)}|${s.country}`; const cur = ctry.get(k) ?? { organizationId: orgId, applicationId: appId, country: s.country, date: s.date, installs: 0, paidInstalls: 0, spendMinor: 0n };
      cur.spendMinor = (cur.spendMinor as bigint) + (s._sum.spendMinor ?? 0n);
      if (!countries.length) { cur.paidInstalls = (cur.paidInstalls ?? 0) + (s._sum.installs ?? 0); cur.installs = (cur.installs ?? 0) + (s._sum.installs ?? 0); } // no user-level data: platform-reported
      ctry.set(k, cur);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.analyticsDaily.deleteMany({ where: { applicationId: appId, date: { gte: from, lt: end } } });
      await tx.analyticsDaily.createMany({ data: [...rows.entries()].map(([k, r]) => {
        const [d, p] = k.split('|') as [string, Platform];
        const useFallback = r.first === 0 && r.re === 0 && r.aggFallback > 0;
        return { organizationId: orgId, applicationId: appId, platform: p, date: new Date(`${d}T00:00:00Z`), firstInstalls: useFallback ? r.aggFallback : r.first, reinstalls: r.re, organicInstalls: r.organic, paidInstalls: r.paid, unattributedInstalls: useFallback ? r.aggFallback : r.unattr, aggregateAttributedInstalls: r.agg, registrations: r.regs, activeUsers: r.active, spendMinor: r.spend, currency: org.currency };
      }) });
      if (cIds.length) {
        await tx.analyticsCampaignDaily.deleteMany({ where: { campaignId: { in: cIds }, date: { gte: from, lt: end } } });
        await tx.analyticsCampaignDaily.createMany({ data: [...campaignRows.values()] });
      }
      await tx.countryMetric.deleteMany({ where: { applicationId: appId, date: { gte: from, lt: end } } });
      await tx.countryMetric.createMany({ data: [...ctry.values()] });
    }, { timeout: 60_000 });
    await this.retention(orgId, appId, from, toIn);
    return { days: rows.size, campaigns: campaignRows.size };
  }

  /** D1/D7/D30 for install cohorts with device ids: share of the cohort with any event on day N (±0). */
  async retention(orgId: string, appId: string, from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<{ cohort: Date; campaign: string | null; total: number; size: bigint; d1: bigint; d7: bigint; d30: bigint }[]>`
      WITH cohort AS (
        SELECT DISTINCT ON ("deviceIdHash") "deviceIdHash" AS dev, ("installedAt" AT TIME ZONE 'UTC')::date AS day, "campaignId"
        FROM install_events WHERE "applicationId" = ${appId}::uuid AND kind = 'FIRST_INSTALL' AND "deviceIdHash" IS NOT NULL
          AND "installedAt" >= ${from} AND "installedAt" < ${new Date(to.getTime() + DAY)} ORDER BY "deviceIdHash", "installedAt"
      ), active AS (
        SELECT DISTINCT "deviceIdHash" AS dev, ("occurredAt" AT TIME ZONE 'UTC')::date AS day FROM conversion_events
        WHERE "applicationId" = ${appId}::uuid AND "deviceIdHash" IS NOT NULL AND "occurredAt" >= ${from}
      )
      SELECT c.day AS cohort, c."campaignId"::text AS campaign, GROUPING(c."campaignId")::int AS total, count(*) AS size,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active a WHERE a.dev = c.dev AND a.day = c.day + 1)) AS d1,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active a WHERE a.dev = c.dev AND a.day = c.day + 7)) AS d7,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active a WHERE a.dev = c.dev AND a.day = c.day + 30)) AS d30
      FROM cohort c GROUP BY GROUPING SETS ((c.day), (c.day, c."campaignId"))`;
    const today = Date.now();
    const ratio = (n: bigint, size: bigint, cohort: Date, lag: number) => (cohort.getTime() + (lag + 1) * DAY <= today && size > 0n ? new Prisma.Decimal(Number(n) / Number(size)).toDecimalPlaces(4) : null);
    await this.prisma.$transaction(async (tx) => {
      await tx.retentionMetric.deleteMany({ where: { applicationId: appId, cohortDate: { gte: from, lte: to } } });
      // GROUPING(campaignId)=1 is the per-day total; per-campaign rows without a campaign (organic) are dropped.
      const data = rows.filter((r) => r.total === 1 || r.campaign !== null).map((r) => ({
        organizationId: orgId, applicationId: appId, cohortDate: r.cohort, campaignId: r.total === 1 ? null : r.campaign, source: r.total === 1 ? 'all' : 'campaign', cohortSize: Number(r.size),
        d1: ratio(r.d1, r.size, r.cohort, 1), d7: ratio(r.d7, r.size, r.cohort, 7), d30: ratio(r.d30, r.size, r.cohort, 30),
      }));
      await tx.retentionMetric.createMany({ data });
    });
  }
}
