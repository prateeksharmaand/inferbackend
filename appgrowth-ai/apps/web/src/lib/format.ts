/** Money arrives as strings of minor units (BigInt on the server). Format without floating-point loss for display. */
export function money(minor: string | number | bigint | null | undefined, currency = 'INR', opts: { compact?: boolean } = {}) {
  if (minor === null || minor === undefined || minor === '') return '—';
  const v = Number(BigInt(minor)) / 100; // display only
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: opts.compact || Math.abs(v) >= 1000 ? 0 : 2, notation: opts.compact ? 'compact' : 'standard' }).format(v);
}
export const majorFromMinor = (minor: string | null | undefined) => (minor == null ? '' : (Number(BigInt(minor)) / 100).toFixed(2));
export const num = (n: number | string | bigint | null | undefined, compact = false) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('en-IN', compact ? { notation: 'compact' } : {}).format(Number(n));
export const pct = (v: number | null | undefined, digits = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(digits)}%`);
export const date = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const ago = (d: string | Date | null | undefined) => {
  if (!d) return 'never';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
