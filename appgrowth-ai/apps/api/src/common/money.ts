/** Money is BigInt minor units end to end. JSON can't carry BigInt, so the API serialises it as a string. */
export const toMinor = (major: number | string): bigint => {
  const s = String(major).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid amount: ${s}`);
  const [w, f = ''] = s.split('.');
  const neg = w.startsWith('-');
  const v = BigInt(w.replace('-', '')) * 100n + BigInt((f + '00').slice(0, 2));
  return neg ? -v : v;
};
export const fromMinor = (m: bigint | number | null | undefined): string | null => {
  if (m === null || m === undefined) return null;
  const v = BigInt(m); const neg = v < 0n; const a = neg ? -v : v;
  return `${neg ? '-' : ''}${a / 100n}.${(a % 100n).toString().padStart(2, '0')}`;
};
/** Cost per install in minor units, rounded half-up; null when there are no installs. */
export const cpiMinor = (spendMinor: bigint, installs: number): bigint | null =>
  installs > 0 ? (spendMinor * 2n + BigInt(installs)) / (2n * BigInt(installs)) : null;
export const pctOf = (part: bigint, whole: bigint): number => (whole > 0n ? Number((part * 10000n) / whole) / 100 : 0);
