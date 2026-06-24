/**
 * Phone Normalization Utility Tests
 */

const { normalizePhone, isValidPhone, phoneEquals } = require('../src/utils/phone-utils');

describe('Phone Normalization', () => {
  describe('normalizePhone()', () => {
    test('Standard 10-digit format', () => {
      expect(normalizePhone('9650269758')).toBe('9650269758');
    });

    test('With country code +91', () => {
      expect(normalizePhone('+919650269758')).toBe('9650269758');
    });

    test('With country code 91 (no +)', () => {
      expect(normalizePhone('919650269758')).toBe('9650269758');
    });

    test('With leading 0 (landline format)', () => {
      expect(normalizePhone('09650269758')).toBe('9650269758');
    });

    test('With spaces and hyphens', () => {
      expect(normalizePhone('+91-9650-269758')).toBe('9650269758');
      expect(normalizePhone('9650 269758')).toBe('9650269758');
    });

    test('With parentheses', () => {
      expect(normalizePhone('+91 (96502) 69758')).toBe('9650269758');
    });

    test('All formatting variants', () => {
      const variants = [
        '9650269758',
        '+919650269758',
        '919650269758',
        '09650269758',
        '+91-9650-269758',
        '96 50 26 97 58',
        '+91 (96502) 69758'
      ];
      variants.forEach(v => {
        expect(normalizePhone(v)).toBe('9650269758');
      });
    });

    test('Invalid: First digit not in [6-9]', () => {
      expect(normalizePhone('5650269758')).toBeNull();
      expect(normalizePhone('1650269758')).toBeNull();
      expect(normalizePhone('0650269758')).toBeNull();
    });

    test('Invalid: Not 10 digits', () => {
      expect(normalizePhone('96502697')).toBeNull(); // 8 digits
      expect(normalizePhone('965026975890')).toBeNull(); // 12 digits
    });

    test('Invalid: Non-numeric', () => {
      expect(normalizePhone('abcdefghij')).toBeNull();
      expect(normalizePhone('9650-abc-758')).toBeNull();
    });

    test('Invalid: Null/undefined', () => {
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
      expect(normalizePhone('')).toBeNull();
    });

    test('Valid first digit: 6-9', () => {
      expect(normalizePhone('6650269758')).toBe('6650269758');
      expect(normalizePhone('7650269758')).toBe('7650269758');
      expect(normalizePhone('8650269758')).toBe('8650269758');
      expect(normalizePhone('9650269758')).toBe('9650269758');
    });
  });

  describe('isValidPhone()', () => {
    test('Valid numbers', () => {
      expect(isValidPhone('9650269758')).toBe(true);
      expect(isValidPhone('+919650269758')).toBe(true);
    });

    test('Invalid numbers', () => {
      expect(isValidPhone('5650269758')).toBe(false);
      expect(isValidPhone('abc')).toBe(false);
      expect(isValidPhone(null)).toBe(false);
    });
  });

  describe('phoneEquals()', () => {
    test('Same normalized value', () => {
      expect(phoneEquals('9650269758', '+919650269758')).toBe(true);
      expect(phoneEquals('9650269758', '09650269758')).toBe(true);
    });

    test('Different numbers', () => {
      expect(phoneEquals('9650269758', '9650269759')).toBe(false);
    });

    test('One invalid', () => {
      expect(phoneEquals('9650269758', '5650269758')).toBe(false);
      expect(phoneEquals('abc', '9650269758')).toBe(false);
    });

    test('Both invalid', () => {
      expect(phoneEquals('abc', 'def')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    test('Whitespace handling', () => {
      expect(normalizePhone('  9650269758  ')).toBe('9650269758');
    });

    test('Multiple leading zeros', () => {
      expect(normalizePhone('009650269758')).toBe('9650269758');
    });

    test('Mixed country code and leading zero', () => {
      expect(normalizePhone('+91 09650269758')).toBe('9650269758');
    });
  });
});
