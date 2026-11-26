import { cpiMinor, fromMinor, pctOf, toMinor } from './money';

describe('money', () => {
  it('parses major units exactly, without floating point', () => {
    expect(toMinor('0.1')).toBe(10n);
    expect(toMinor('1234567890.99')).toBe(123456789099n);
    expect(toMinor(19.5)).toBe(1950n);
    expect(() => toMinor('1.234')).toThrow();
    expect(() => toMinor('abc')).toThrow();
  });
  it('formats minor units', () => {
    expect(fromMinor(5n)).toBe('0.05');
    expect(fromMinor(-1050n)).toBe('-10.50');
    expect(fromMinor(null)).toBeNull();
  });
  it('computes CPI rounded half-up and null with no installs', () => {
    expect(cpiMinor(10000n, 3)).toBe(3333n);  // 33.333 → 33.33
    expect(cpiMinor(10000n, 6)).toBe(1667n);  // 16.6667 → 16.67
    expect(cpiMinor(5n, 2)).toBe(3n);         // 2.5 → 3 (half-up)
    expect(cpiMinor(10000n, 0)).toBeNull();
  });
  it('computes percentages', () => {
    expect(pctOf(7500n, 10000n)).toBe(75);
    expect(pctOf(1n, 3n)).toBe(33.33);
    expect(pctOf(1n, 0n)).toBe(0);
  });
});
