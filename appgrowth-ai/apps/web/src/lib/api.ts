/**
 * Browser API client. Auth lives in httpOnly cookies; mutations echo the CSRF cookie; the active organization is
 * sent as X-Organization-Id. An expired access token is refreshed once (single-flight) and the request retried.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

const ORG_KEY = 'ag.org';
export const getOrgId = () => { try { return localStorage.getItem(ORG_KEY); } catch { return null; } };
export const setOrgId = (id: string | null) => { try { if (id) localStorage.setItem(ORG_KEY, id); else localStorage.removeItem(ORG_KEY); } catch { /* private mode */ } };
const csrf = () => document.cookie.split('; ').find((c) => c.startsWith('ag_csrf='))?.split('=')[1];

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then((r) => r.ok).catch(() => false).finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

type Opts = { method?: string; body?: unknown; org?: boolean; signal?: AbortSignal; raw?: boolean };

export async function api<T = unknown>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') { const c = csrf(); if (c) headers['X-CSRF-Token'] = c; }
  if (opts.org !== false) { const o = getOrgId(); if (o) headers['X-Organization-Id'] = o; }
  const res = await fetch(`/api/v1${path}`, { method, headers, credentials: 'include', body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: opts.signal });
  if (res.status === 401 && !retried && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    if (await refresh()) return api<T>(path, opts, true);
  }
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try { body = await res.json(); } catch { /* non-JSON */ }
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      const next = encodeURIComponent(location.pathname + location.search);
      if (!location.pathname.startsWith('/login')) location.href = `/login?next=${next}`;
    }
    throw new ApiError(res.status, body.error?.code ?? 'error', body.error?.message ?? `Request failed (${res.status})`, body.error?.details);
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

export const errorMessage = (e: unknown) => {
  if (e instanceof ApiError) {
    if (Array.isArray(e.details) && e.details.length) return `${e.message}: ${(e.details as string[]).join('; ')}`;
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
};

/** Multipart upload with the same auth/CSRF/org handling as api(). */
export async function upload<T = unknown>(path: string, file: File, field = 'file'): Promise<T> {
  const fd = new FormData(); fd.append(field, file);
  const headers: Record<string, string> = {};
  const c = csrf(); if (c) headers['X-CSRF-Token'] = c;
  const o = getOrgId(); if (o) headers['X-Organization-Id'] = o;
  let res = await fetch(`/api/v1${path}`, { method: 'POST', body: fd, headers, credentials: 'include' });
  if (res.status === 401 && (await refresh())) res = await fetch(`/api/v1${path}`, { method: 'POST', body: fd, headers, credentials: 'include' });
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string } } = {};
    try { body = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, body.error?.code ?? 'error', body.error?.message ?? `Upload failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
