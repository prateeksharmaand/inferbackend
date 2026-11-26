import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, PlatformAdmin, RequirePermission } from '../../common/decorators';
import { AppError, notFound } from '../../common/errors';
import { fromMinor, toMinor } from '../../common/money';
import { PrismaService } from '../../common/prisma.service';
import { monthOf } from '../budgets/budgets.service';

class PaymentDto {
  @ApiProperty() @IsUUID() invoiceId: string;
  @ApiProperty({ example: '9999.00' }) @Matches(/^\d{1,10}(\.\d{1,2})?$/) amount: string;
  @ApiProperty({ enum: ['bank_transfer', 'manual', 'gateway'] }) @IsIn(['bank_transfer', 'manual', 'gateway']) method: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;
}

/**
 * Subscription billing (platform fee) — entirely separate from advertising spend, which the ad platforms bill to the
 * customer's own ad accounts. Invoices are generated per period; payments are recorded by the Super Admin (bank transfer)
 * until an online payment gateway is enabled (feature flag billing.online_payments). GST/tax rate from BILLING_TAX_RATE_PCT.
 */
@ApiTags('Billing') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller()
export class BillingController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @RequirePermission('billing.manage') @Get('billing') async overview(@CurrentOrg() o: OrgContext) {
    const [sub, invoices, plans, usage] = await Promise.all([
      this.prisma.subscription.findFirst({ where: { organizationId: o.id }, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
      this.prisma.invoice.findMany({ where: { organizationId: o.id }, orderBy: { issuedAt: 'desc' }, take: 36 }),
      this.prisma.subscriptionPlan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.aiUsage.aggregate({ where: { organizationId: o.id, date: { gte: monthOf() } }, _sum: { inputTokens: true, outputTokens: true, generations: true } }),
    ]);
    return {
      subscription: sub, plans: plans.map((p) => ({ ...p, price: fromMinor(p.priceMinor) })),
      invoices: invoices.map((i) => ({ ...i, subtotal: fromMinor(i.subtotalMinor), tax: fromMinor(i.taxMinor), total: fromMinor(i.totalMinor) })),
      usage: { aiTokens: ((usage._sum.inputTokens ?? 0n) + (usage._sum.outputTokens ?? 0n)).toString(), aiTokensLimit: sub?.plan.aiTokensMonth.toString(), mediaGenerations: usage._sum.generations ?? 0 },
      note: 'This is your AppGrowth subscription. Advertising spend is billed by Google, Apple, Meta and TikTok directly to your ad accounts.',
    };
  }

  /** Issues an invoice for the current period of an org's active paid subscription (idempotent per period). */
  @PlatformAdmin() @Post('admin/organizations/:id/invoices') async issue(@Param('id', ParseUUIDPipe) orgId: string, @CurrentUser() u: AuthUser) {
    const sub = await this.prisma.subscription.findFirst({ where: { organizationId: orgId, status: 'ACTIVE' }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
    if (!sub) throw new AppError('No active paid subscription', 409, 'no_subscription');
    if (sub.plan.priceMinor <= 0n) throw new AppError('This plan has no price (custom/enterprise): record a manual invoice', 409, 'no_price');
    const existing = await this.prisma.invoice.findFirst({ where: { subscriptionId: sub.id, periodStart: sub.currentPeriodStart } });
    if (existing) return existing;
    const rate = BigInt(Math.round(Number(process.env.BILLING_TAX_RATE_PCT ?? 18) * 100));
    const tax = (sub.plan.priceMinor * rate + 5000n) / 10000n;
    const seq = await this.prisma.invoice.count() + 1;
    const inv = await this.prisma.invoice.create({ data: {
      organizationId: orgId, subscriptionId: sub.id, number: `AG-${new Date().getUTCFullYear()}-${String(seq).padStart(5, '0')}`, status: 'open', subtotalMinor: sub.plan.priceMinor, taxMinor: tax, totalMinor: sub.plan.priceMinor + tax,
      currency: sub.plan.currency, periodStart: sub.currentPeriodStart, periodEnd: sub.currentPeriodEnd, lines: [{ description: `${sub.plan.name} plan`, amountMinor: sub.plan.priceMinor.toString() }],
    } });
    await this.audit.record({ organizationId: orgId, actorUserId: u.id, actor: `user:${u.id}`, action: 'admin.invoice_issued', entityType: 'invoice', entityId: inv.id, after: { number: inv.number, total: fromMinor(inv.totalMinor) } });
    return inv;
  }

  @PlatformAdmin() @Post('admin/payments') async pay(@Body() dto: PaymentDto, @CurrentUser() u: AuthUser) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: dto.invoiceId } });
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'paid') throw new AppError('Invoice already paid', 409, 'already_paid');
    const amount = toMinor(dto.amount);
    const p = await this.prisma.$transaction(async (tx) => {
      const pay = await tx.payment.create({ data: { organizationId: inv.organizationId, invoiceId: inv.id, amountMinor: amount, currency: inv.currency, method: dto.method, externalId: dto.reference ?? null, recordedById: u.id } });
      const paid = await tx.payment.aggregate({ where: { invoiceId: inv.id, status: 'succeeded' }, _sum: { amountMinor: true } });
      if ((paid._sum.amountMinor ?? 0n) >= inv.totalMinor) await tx.invoice.update({ where: { id: inv.id }, data: { status: 'paid', paidAt: new Date() } });
      return pay;
    });
    await this.audit.record({ organizationId: inv.organizationId, actorUserId: u.id, actor: `user:${u.id}`, action: 'admin.payment_recorded', entityType: 'invoice', entityId: inv.id, after: { amount: dto.amount, method: dto.method }, security: true });
    return p;
  }

  @PlatformAdmin({ allowSupport: true }) @Get('admin/invoices') async invoices() {
    return (await this.prisma.invoice.findMany({ orderBy: { issuedAt: 'desc' }, take: 200, include: { payments: true } })).map((i) => ({ ...i, total: fromMinor(i.totalMinor) }));
  }
}
