import mixpanel from 'mixpanel-browser';

const TOKEN = '8779da9d7ea8b15a3c2cff673aaee22c';
const IS_DEV = import.meta.env.DEV;

mixpanel.init(TOKEN, {
  debug: IS_DEV,
  track_pageview: false,   // we track pages manually via React Router
  persistence: 'localStorage',
  ignore_dnt: false,
});

// ── Identity ──────────────────────────────────────────────────────────────────

export function identifyUser(user) {
  if (!user?.clinic_id) return;
  mixpanel.identify(user.clinic_id);
  mixpanel.people.set({
    $name:          user.name        || '',
    clinic_id:      user.clinic_id,
    doctor_id:      user.id          || '',
    specialization: user.specialization || '',
    qualification:  user.qualification  || '',
    clinic_address: user.clinic_address || '',
  });
}

export function resetUser() {
  mixpanel.reset();
}

// ── Page tracking ─────────────────────────────────────────────────────────────

export function trackPage(pageName, properties = {}) {
  mixpanel.track('page_viewed', { page: pageName, ...properties });
}

// ── Events ────────────────────────────────────────────────────────────────────

export function track(eventName, properties = {}) {
  mixpanel.track(eventName, properties);
}

export default mixpanel;
