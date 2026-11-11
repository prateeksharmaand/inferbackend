// Clinical Template Builder API. One adapter for the clinic app (/api/emr) and the super admin
// panel (/api/admin), so the same editor works for clinic templates and system templates.
import { api } from './client';
import { adminApi } from './adminClient';

function adapter(call) {
  return {
    catalog:     ()              => call('GET',    '/clinical-templates/catalog'),
    list:        ()              => call('GET',    '/clinical-templates'),
    get:         id              => call('GET',    `/clinical-templates/${id}`),
    versions:    id              => call('GET',    `/clinical-templates/${id}/versions`),
    audit:       id              => call('GET',    `/clinical-templates/${id}/audit`),
    create:      body            => call('POST',   '/clinical-templates', body),
    update:      (id, body)      => call('PUT',    `/clinical-templates/${id}`, body),
    archive:     id              => call('DELETE', `/clinical-templates/${id}`),
    duplicate:   (id, name)      => call('POST',   `/clinical-templates/${id}/duplicate`, { name }),
    saveDraft:   (id, definition)=> call('PUT',    `/clinical-templates/${id}/draft`, { definition }),
    publish:     (id, notes)     => call('POST',   `/clinical-templates/${id}/publish`, { notes }),
    // clinic only
    config:          ()               => call('GET', '/clinical-template-config'),
    saveSelections:  selections       => call('PUT', '/clinical-template-config', { selections }),
    clinicConfig:    id               => call('GET', `/clinical-template-config/templates/${id}`),
    saveClinicConfig:(id, definition) => call('PUT', `/clinical-template-config/templates/${id}`, { definition }),
    doctorConfig:    (staffId = 'me', templateId) =>
      call('GET', `/clinical-template-config/doctors/${staffId}${templateId ? `?template_id=${templateId}` : ''}`),
    saveDoctorConfig:(staffId = 'me', body) => call('PUT', `/clinical-template-config/doctors/${staffId}`, body),
    effectiveFor:    appointmentId    => call('GET', `/appointments/${appointmentId}/effective-template`),
  };
}

const emrCall = (method, path, body) => {
  switch (method) {
    case 'GET':    return api.get(path);
    case 'POST':   return api.post(path, body);
    case 'PUT':    return api.put(path, body);
    case 'DELETE': return api.delete(path);
    default:       throw new Error(method);
  }
};

export const ctApi      = adapter(emrCall);
export const ctAdminApi = adapter((method, path, body) => adminApi.request(method, path, body));

/** Server validation errors → { section_key: { field_key | '_section': message } } */
export function errorsBySection(errors = []) {
  const out = {};
  for (const e of errors) (out[e.section_key] ||= {})[e.field_key || '_section'] = e.message;
  return out;
}
