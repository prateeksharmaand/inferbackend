import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors';
import { providerErrors } from '../../common/metrics';

export interface ProviderSelection { provider: string; model: string | null; apiKey: string | null; baseUrl: string | null; prices: { input_per_mtok: number; output_per_mtok: number; per_unit: number } }
export interface AgentResponse { output: Record<string, unknown>; usage: { input_tokens: number; output_tokens: number }; cost_micros: number; sources: { url: string; title: string }[]; provider: string; model: string; grounded: boolean; warnings: string[]; duration_ms: number }
export interface MediaResponse { items: { mime: string; base64: string }[]; units: number; usage: { input_tokens: number; output_tokens: number }; cost_micros: number; provider: string; model: string }

/** HTTP client for the internal Python AI service (private Docker network, bearer token). */
@Injectable()
export class AiClient {
  private base = process.env.AI_SERVICE_URL ?? 'http://localhost:8100';

  private async post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
    let r: Response;
    try {
      r = await fetch(`${this.base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_SERVICE_TOKEN ?? ''}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      providerErrors.inc({ provider: 'ai_service', kind: 'unreachable' });
      throw new AppError(`AI service unreachable: ${(e as Error).name === 'TimeoutError' ? 'timed out' : (e as Error).message}`, 503, 'ai_unavailable', { retryable: true });
    }
    const j = (await r.json().catch(() => ({}))) as { error?: { code?: string; message?: string; retryable?: boolean } } & T;
    if (!r.ok) {
      providerErrors.inc({ provider: (body as { provider?: string }).provider ?? 'default', kind: j.error?.code ?? String(r.status) });
      throw new AppError(j.error?.message ?? `AI service error ${r.status}`, r.status === 503 ? 503 : 502, j.error?.code ?? 'ai_error', { retryable: j.error?.retryable ?? r.status >= 500 });
    }
    return j;
  }

  runAgent(key: string, sel: ProviderSelection, context: Record<string, unknown>, opts: { timeoutSec: number; grounded?: boolean; instructions?: string }) {
    return this.post<AgentResponse>(`/v1/agents/${key}/run`, { provider: sel.provider, model: sel.model, api_key: sel.apiKey, base_url: sel.baseUrl, prices: sel.prices, context, grounded: opts.grounded, instructions: opts.instructions ?? '' }, opts.timeoutSec * 1000);
  }

  media(sel: ProviderSelection, req: { kind: 'image' | 'video'; prompt: string; size?: string; n?: number; aspect_ratio?: string; seconds?: number }) {
    return this.post<MediaResponse>('/v1/media', { provider: sel.provider, model: sel.model, api_key: sel.apiKey, base_url: sel.baseUrl, prices: sel.prices, ...req }, req.kind === 'video' ? 660_000 : 180_000);
  }

  check(sel: ProviderSelection) {
    return this.post<{ ok: boolean; provider: string; model: string }>('/v1/providers/check', { provider: sel.provider, model: sel.model, api_key: sel.apiKey, base_url: sel.baseUrl }, 60_000);
  }

  async health(): Promise<boolean> {
    try { return (await fetch(`${this.base}/health`, { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; }
  }
}
