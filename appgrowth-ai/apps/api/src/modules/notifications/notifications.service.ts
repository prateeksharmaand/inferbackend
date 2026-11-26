import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { MailService } from '../mail/mail.service';

export const NOTIFICATION_KINDS = {
  budget_threshold: 'Budget threshold reached', campaign_failed: 'Campaign failed', campaign_inactive: 'Campaign inactive',
  cpi_above_target: 'CPI above target', integration_expiring: 'Integration expiring or failing', unusual_spend: 'Unusual spend',
  target_risk: 'Install target at risk', tracking_failure: 'Install tracking failure', report_ready: 'Report ready',
  ai_ready: 'AI analysis ready', approval_needed: 'Approval needed', automation_stopped: 'Automation stopped',
} as const;
export type NotificationKind = keyof typeof NOTIFICATION_KINDS;
const DEFAULT_EMAIL: Record<string, boolean> = { report_ready: true, budget_threshold: true, campaign_failed: true, integration_expiring: true, unusual_spend: true, target_risk: true, tracking_failure: true, approval_needed: true, automation_stopped: true, cpi_above_target: false, campaign_inactive: false, ai_ready: false };

/** In-app + email notifications. A dedupeKey makes the same alert idempotent per user (e.g. "budget:2026-11:75"). */
@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');
  constructor(private prisma: PrismaService, private mail: MailService) {}

  async notifyOrg(orgId: string, n: { kind: NotificationKind; title: string; body: string; link?: string; severity?: 'info' | 'warning' | 'critical'; dedupeKey?: string; permission?: string; attachments?: { filename: string; content: Buffer }[] }) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId, user: { status: 'ACTIVE', deletedAt: null }, ...(n.permission ? { role: { permissions: { some: { permission: { key: n.permission } } } } } : {}) },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    const prefs = await this.prisma.notificationPreference.findMany({ where: { organizationId: orgId, kind: n.kind } });
    const pref = new Map(prefs.map((p) => [p.userId, p]));
    let sent = 0;
    for (const m of members) {
      const p = pref.get(m.userId);
      if (p && !p.inApp && !p.email) continue;
      try {
        await this.prisma.notification.create({ data: { organizationId: orgId, userId: m.userId, kind: n.kind, severity: n.severity ?? 'info', title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey, channel: 'IN_APP' } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue; // already notified
        throw e;
      }
      const wantEmail = p ? p.email : DEFAULT_EMAIL[n.kind] ?? false;
      if (wantEmail) {
        const ok = await this.mail.send(m.user.email, n.title, [n.body], n.link ? { label: 'Open AppGrowth AI', url: `${process.env.PUBLIC_URL}${n.link}` } : undefined, n.attachments);
        if (ok) { sent++; await this.prisma.notification.updateMany({ where: { userId: m.userId, dedupeKey: n.dedupeKey ?? undefined, title: n.title }, data: { emailedAt: new Date() } }); }
      }
    }
    return { recipients: members.length, emailed: sent };
  }

  async notifyPlatformAdmins(title: string, body: string, dedupeKey?: string) {
    const admins = await this.prisma.user.findMany({ where: { platformRole: 'SUPER_ADMIN', status: 'ACTIVE' } });
    for (const a of admins) {
      await this.prisma.notification.create({ data: { userId: a.id, kind: 'security', severity: 'critical', title, body, dedupeKey } }).catch(() => undefined);
      await this.mail.send(a.email, `[AppGrowth security] ${title}`, [body]);
    }
  }
}
