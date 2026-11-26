import { CallHandler, ExecutionContext, Injectable, NestInterceptor, OnModuleDestroy } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { PrismaService } from './prisma.service';

/** Per-organization API usage log, buffered and flushed in batches so logging never slows requests. */
@Injectable()
export class ApiLogInterceptor implements NestInterceptor, OnModuleDestroy {
  private buf: { organizationId: string | null; userId: string | null; method: string; route: string; status: number; durationMs: number }[] = [];
  private timer = setInterval(() => void this.flush(), 5000);
  constructor(private prisma: PrismaService) { this.timer.unref?.(); }
  async onModuleDestroy() { clearInterval(this.timer); await this.flush(); }
  private async flush() {
    if (!this.buf.length) return;
    const batch = this.buf.splice(0, this.buf.length);
    await this.prisma.apiLog.createMany({ data: batch }).catch(() => undefined);
  }
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request & { user?: { id: string }; org?: { id: string } }>();
    const t = Date.now();
    const done = () => {
      const route = (req.route?.path as string) ?? 'unmatched';
      if (route.includes('/health') || route.includes('/metrics')) return;
      this.buf.push({ organizationId: req.org?.id ?? null, userId: req.user?.id ?? null, method: req.method, route: route.slice(0, 200), status: ctx.switchToHttp().getResponse<Response>().statusCode, durationMs: Date.now() - t });
      if (this.buf.length > 500) void this.flush();
    };
    return next.handle().pipe(tap({ next: done, error: done }));
  }
}
