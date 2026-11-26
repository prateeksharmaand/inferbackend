import { Controller, Get, Headers, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from './common/decorators';
import { registry } from './common/metrics';
import { PrismaService } from './common/prisma.service';
import { RedisService } from './common/redis.service';
import { CryptoService } from './common/crypto.service';

@ApiTags('Health') @SkipThrottle()
@Controller()
export class HealthController {
  constructor(private prisma: PrismaService, private redis: RedisService, private crypto: CryptoService) {}

  @Public() @Get('health')
  async health(@Res({ passthrough: true }) res: Response) {
    const check = async (fn: () => Promise<unknown>) => { const t = Date.now(); try { await fn(); return { ok: true, ms: Date.now() - t }; } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 120) }; } };
    const [db, redis] = await Promise.all([check(() => this.prisma.$queryRaw`SELECT 1`), check(() => this.redis.client.ping())]);
    const ok = db.ok && redis.ok;
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'degraded', db, redis, version: process.env.APP_VERSION ?? 'dev', time: new Date().toISOString() };
  }

  /** Prometheus scrape endpoint. Requires METRICS_TOKEN (Bearer) so it is never public. */
  @Public() @Get('metrics') @ApiExcludeEndpoint()
  async metrics(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    const want = process.env.METRICS_TOKEN;
    if (!want || !auth || !this.crypto.safeEqual(auth, `Bearer ${want}`)) { res.status(404).end(); return; }
    res.setHeader('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  }
}
