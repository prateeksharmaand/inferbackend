export const PRESET_THEMES = [
  { name: 'Blue',    primary: '#2563eb', dark: '#1d4ed8' },
  { name: 'Indigo',  primary: '#4f46e5', dark: '#4338ca' },
  { name: 'Purple',  primary: '#7c3aed', dark: '#6d28d9' },
  { name: 'Rose',    primary: '#e11d48', dark: '#be123c' },
  { name: 'Orange',  primary: '#ea580c', dark: '#c2410c' },
  { name: 'Green',   primary: '#16a34a', dark: '#15803d' },
  { name: 'Teal',    primary: '#0d9488', dark: '#0f766e' },
  { name: 'Cyan',    primary: '#0891b2', dark: '#0e7490' },
];

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function darken(hex, amount = 0.15) {
  const { r, g, b } = hexToRgb(hex);
  const d = (v) => Math.max(0, Math.round(v * (1 - amount)));
  return `#${d(r).toString(16).padStart(2, '0')}${d(g).toString(16).padStart(2, '0')}${d(b).toString(16).padStart(2, '0')}`;
}

export function applyTheme({ primary, dark }) {
  const dk = dark || darken(primary);
  const root = document.documentElement;
  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-primary-dk', dk);
  root.style.setProperty('--color-sidebar-active', primary);
  // badge colors derived from primary
  root.style.setProperty('--color-badge-blue', primary + '22');
  root.style.setProperty('--color-badge-blue-text', primary);
  localStorage.setItem('theme', JSON.stringify({ primary, dark: dk }));
}

export function loadSavedTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { primary: '#2563eb', dark: '#1d4ed8' };
}

export function initTheme() {
  const theme = loadSavedTheme();
  applyTheme(theme);
}
