import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from './prisma.service';

export interface AuditEntry {
  organizationId?: string | null; actorUserId?: string | null; actor: string; action: string;
  entityType?: string; entityId?: string; before?: unknown; after?: unknown; ip?: string; security?: boolean;
}
const SECRET_KEYS = /token|secret|password|apikey|api_key|authorization|code_verifier/i;
/** Recursively blank anything that looks like a credential before it reaches the audit log. */
const redactPlain = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(redactPlain);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : redactPlain(x)]));
  }
  return v;
};
/** Normalise through JSON first (Dates, Decimals, BigInts → plain values), then redact. */
export const redact = (v: unknown): unknown =>
  v === undefined ? undefined : redactPlain(JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)) ?? 'null'));

@Injectable()
export class AuditService {
  private log = new Logger('Audit');
  constructor(private prisma: PrismaService) {}
  async record(e: AuditEntry, tx?: Tx) {
    const data = {
      organizationId: e.organizationId ?? null, actorUserId: e.actorUserId ?? null, actor: e.actor, action: e.action,
      entityType: e.entityType, entityId: e.entityId, ip: e.ip, security: e.security ?? false,
      before: e.before === undefined ? Prisma.JsonNull : (redact(e.before) as Prisma.InputJsonValue),
      after: e.after === undefined ? Prisma.JsonNull : (redact(e.after) as Prisma.InputJsonValue),
    };
    try {
      await (tx ?? this.prisma).auditLog.createMany({ data: [data] }); // no RETURNING: the tenant role may insert, not read
    } catch (err) {
      this.log.error(`audit write failed for ${e.action}: ${(err as Error).message}`);
      if (tx) throw err; // inside a business transaction an unaudited change must not commit
    }
  }
}
