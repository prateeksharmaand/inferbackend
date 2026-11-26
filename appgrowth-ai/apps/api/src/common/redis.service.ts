import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { randomUUID } from 'crypto';

/** Shared Redis connection + a small distributed lock (SET NX PX, token-checked release). */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null, lazyConnect: false });
  async onModuleDestroy() { await this.client.quit().catch(() => undefined); }

  /** Runs fn while holding `lock:<key>`. Returns { acquired:false } when someone else holds it. */
  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<{ acquired: true; value: T } | { acquired: false }> {
    const token = randomUUID();
    const ok = await this.client.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return { acquired: false };
    try {
      return { acquired: true, value: await fn() };
    } finally {
      await this.client.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, `lock:${key}`, token);
    }
  }
}
