import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Whether ABDM is switched on for the signed-in user's clinic (Super Admin → Clinics → ABDM).
// Fetched once per page load and shared; false until known, so ABHA options never flash on
// for a clinic that has ABDM off. Call refreshAbdmEnabled() after changing the setting.
let cached = null;      // boolean once loaded
let inflight = null;
const listeners = new Set();

function load() {
  if (!inflight) {
    inflight = api.get('/clinic-settings/abdm')
      .then(r => !!r?.abdm_enabled)
      .catch(() => false)
      .then(v => { cached = v; listeners.forEach(fn => fn(v)); return v; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function refreshAbdmEnabled() { cached = null; return load(); }

export default function useAbdmEnabled() {
  const [enabled, setEnabled] = useState(cached ?? false);
  useEffect(() => {
    listeners.add(setEnabled);
    if (cached === null) load(); else setEnabled(cached);
    return () => listeners.delete(setEnabled);
  }, []);
  return enabled;
}
