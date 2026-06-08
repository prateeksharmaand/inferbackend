const BASE = '/api/emr';

function getToken() { return localStorage.getItem('emr_token'); }

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem('emr_token');
    localStorage.removeItem('emr_user');
    // Don't redirect if already on admin routes
    if (!window.location.pathname.startsWith('/opd/admin')) {
      window.location.href = '/opd/login';
    }
    return;
  }

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.error === 'clinic_suspended') {
      localStorage.removeItem('emr_token');
      localStorage.removeItem('emr_user');
      window.location.href = '/opd/login?suspended=1';
      return;
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.detail  = data.detail;
    err.status  = res.status;
    // Subscription limit exceeded — fire global event so any component can show upgrade modal
    if (res.status === 402 && data.error === 'subscription_limit') {
      err.subscriptionLimit = true;
      err.resource  = data.resource;
      err.limit     = data.limit;
      err.used      = data.used;
      err.limitMsg  = data.message;
      window.dispatchEvent(new CustomEvent('subscription:limit', { detail: data }));
    }
    if (res.status === 402 && data.error === 'pro_required') {
      err.proRequired = true;
      window.dispatchEvent(new CustomEvent('subscription:limit', {
        detail: { resource: data.feature, message: data.message },
      }));
    }
    throw err;
  }
  return data;
}

export const api = {
  get:    (path)        => req('GET',    path),
  post:   (path, body)  => req('POST',   path, body),
  patch:  (path, body)  => req('PATCH',  path, body),
  delete: (path)        => req('DELETE', path),
};
