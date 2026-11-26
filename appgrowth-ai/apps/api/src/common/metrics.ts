import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import client from 'prom-client';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'appgrowth_' });
export const httpDuration = new client.Histogram({
  name: 'appgrowth_http_request_duration_seconds', help: 'HTTP latency', labelNames: ['method', 'route', 'status'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 0.8, 1.5, 3, 8], registers: [registry],
});
export const jobCounter = new client.Counter({ name: 'appgrowth_jobs_total', help: 'Background jobs by queue/outcome', labelNames: ['queue', 'outcome'], registers: [registry] });
export const providerErrors = new client.Counter({ name: 'appgrowth_provider_errors_total', help: 'External provider errors', labelNames: ['provider', 'kind'], registers: [registry] });

/** Records latency per route template (not raw URL, to keep label cardinality bounded). */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    const end = httpDuration.startTimer();
    const done = () => end({ method: req.method, route: (req.route?.path as string) ?? 'unmatched', status: String(ctx.switchToHttp().getResponse<Response>().statusCode) });
    return next.handle().pipe(tap({ next: done, error: done }));
  }
}
