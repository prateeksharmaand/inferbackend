import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `prisma` itself runs as the owner role (bypasses RLS) — use it only for system jobs, auth and Super Admin.
 * Customer-facing code must use `tenant(orgId, userId, fn)`: the transaction switches to the `appgrowth_tenant`
 * role with app.org_id set, so Postgres RLS rejects any row from another organization even if a filter is missed.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ log: ['warn', 'error'], transactionOptions: { maxWait: 5000, timeout: 20000 } });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }

  async tenant<T>(orgId: string, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID.test(orgId) || (userId && !UUID.test(userId))) throw new Error('tenant(): invalid id');
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true), set_config('app.user_id', ${userId ?? ''}, true)`;
      await tx.$executeRawUnsafe('SET LOCAL ROLE appgrowth_tenant');
      return fn(tx);
    });
  }
}
