const BASE = '/api/admin';

function token() {
  return localStorage.getItem('admin_token');
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    window.location.href = '/opd/admin/login';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const adminApi = {
  login:   (body) => request('POST', '/auth/login', body),
  changePassword: (body) => request('POST', '/auth/change-password', body),

  getStats:    () => request('GET', '/stats'),

  listClinics: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/clinics${qs ? `?${qs}` : ''}`);
  },
  getClinic:      (id)  => request('GET',   `/clinics/${id}`),
  createClinic:   (body) => request('POST',  '/clinics', body),
  updateClinic:   (id, body) => request('PATCH', `/clinics/${id}`, body),
  suspendClinic:  (id)  => request('PATCH', `/clinics/${id}/suspend`),
  activateClinic: (id)  => request('PATCH', `/clinics/${id}/activate`),
  updateClinicAbdm: (id, body) => request('PATCH', `/clinics/${id}/abdm`, body),
  syncClinicHips: () => request('POST', '/clinics/sync-hips'),

  getCatalog: () => request('GET', '/subscription-catalog'),

  listSubscriptions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/subscriptions${qs ? `?${qs}` : ''}`);
  },
  createSubscription: (body) => request('POST', '/subscriptions/create', body),
  updateSubscription: (clinicId, body) => request('PATCH', `/subscriptions/${clinicId}`, body),
  getSubscriptionItems: (clinicId) => request('GET', `/subscriptions/${clinicId}/items`),
  getRevenue: () => request('GET', '/subscriptions/revenue'),

  getAuditLogs: () => request('GET', '/audit-logs'),

  // Sales CRM
  getCrmDashboard: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/sales/crm${qs ? `?${qs}` : ''}`);
  },
  getLeadDetail: (id) => request('GET', `/sales/leads/${id}`),
  updateLead: (id, body) => request('PATCH', `/sales/leads/${id}`, body),
  getWhatsAppInbox: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/sales/wa-inbox${qs ? `?${qs}` : ''}`);
  },
  linkWhatsAppToLead: (waId, body) => request('POST', `/sales/wa-inbox/${waId}/link`, body),
  getLeadActivity: (leadId) => request('GET', `/sales/activity/${leadId}`),
};
