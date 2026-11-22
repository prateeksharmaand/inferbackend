/**
 * Central HTTP client. Auth uses httpOnly cookies set by the API; JS never sees tokens.
 * - Echoes the readable cp_csrf cookie as X-CSRF-Token on mutations (double-submit CSRF).
 * - On 401 token_expired, refreshes once (rotating refresh token) and retries.
 */
import type { ApiErrorBody } from "@/types/api";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

function csrf(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split("; ").find((c) => c.startsWith("cp_csrf="))?.split("=")[1];
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

export function qs(params?: Query): string {
  if (!params) return "";
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    u.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export async function request<T>(method: string, path: string, body?: unknown, opts: { retry?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const t = csrf();
    if (t) headers["X-CSRF-Token"] = t;
  }
  const res = await fetch(path, {
    method, headers, credentials: "include",
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  if (res.status === 401 && opts.retry !== false && !path.startsWith("/api/auth/")) {
    if (await refresh()) return request<T>(method, path, body, { retry: false });
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  }
  if (!res.ok) {
    let payload: ApiErrorBody | null = null;
    try { payload = await res.json(); } catch { /* non-JSON */ }
    throw new ApiError(res.status, payload?.error?.code ?? "http_error",
      payload?.error?.message ?? `Request failed (${res.status})`, payload?.error?.details);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  get: <T>(p: string, q?: Query) => request<T>("GET", p + qs(q)),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  patch: <T>(p: string, b: unknown) => request<T>("PATCH", p, b),
  put: <T>(p: string, b: unknown) => request<T>("PUT", p, b),
  del: <T = void>(p: string) => request<T>("DELETE", p),
  upload: <T>(p: string, form: FormData) => request<T>("POST", p, form),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "validation_error" && Array.isArray(e.details)) {
      return (e.details as { loc: string[]; msg: string }[]).map((d) => `${d.loc.slice(1).join(".")}: ${d.msg}`).join("; ");
    }
    return e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong";
}
