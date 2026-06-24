/**
 * Phone Normalization Utilities
 *
 * Standardizes Indian mobile numbers to 10-digit format
 * Handles: +91-XXXXXXXXXX, 91-XXXXXXXXXX, 0-XXXXXXXXXX, XXXXXXXXXX
 */

/**
 * Normalize Indian mobile number to 10-digit format
 *
 * @param {string|null} mobile - Raw input (accepts various formats)
 * @returns {string|null} - Normalized 10-digit number or null if invalid
 *
 * Examples:
 *   normalizePhone('+91-9650269758') → '9650269758'
 *   normalizePhone('91-9650269758') → '9650269758'
 *   normalizePhone('09650269758') → '9650269758'
 *   normalizePhone('9650269758') → '9650269758'
 *   normalizePhone('+91 (96502) 69758') → '9650269758'
 *   normalizePhone('5650269758') → null (first digit must be 6-9)
 *   normalizePhone('abc') → null (not a number)
 */
function normalizePhone(mobile) {
  if (!mobile) return null;

  // Step 1: Remove common separators (spaces, hyphens, parentheses)
  let normalized = String(mobile)
    .replace(/[\s\-()]/g, '')
    .trim();

  // Step 2: Remove country code variants
  if (normalized.startsWith('+91')) {
    normalized = normalized.slice(3);
  } else if (normalized.startsWith('91')) {
    normalized = normalized.slice(2);
  }

  // Step 3: Remove leading 0 (for landline format like 09650269758)
  if (normalized.startsWith('0')) {
    normalized = normalized.slice(1);
  }

  // Step 4: Validate: exactly 10 digits
  if (!/^\d{10}$/.test(normalized)) {
    return null;
  }

  // Step 5: Validate: first digit in [6-9] (Indian mobile requirement)
  if (!/^[6-9]/.test(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Validate if a phone number is valid Indian mobile
 * @param {string} mobile - Phone number to validate
 * @returns {boolean}
 */
function isValidPhone(mobile) {
  return normalizePhone(mobile) !== null;
}

/**
 * Compare two phone numbers after normalization
 * @param {string} phone1 - First phone number
 * @param {string} phone2 - Second phone number
 * @returns {boolean} - true if both normalize to same value
 */
function phoneEquals(phone1, phone2) {
  const norm1 = normalizePhone(phone1);
  const norm2 = normalizePhone(phone2);

  if (!norm1 || !norm2) return false;
  return norm1 === norm2;
}

module.exports = {
  normalizePhone,
  isValidPhone,
  phoneEquals
};
