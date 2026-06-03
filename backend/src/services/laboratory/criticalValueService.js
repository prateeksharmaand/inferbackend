/**
 * Critical Value Detection Service
 */

const db = require('../../db');

class CriticalValueService {
  /**
   * Check if result is a critical value
   */
  async isCriticalValue(labId, testCode, resultValue) {
    try {
      // Get lab's critical value thresholds
      const result = await db.query(
        'SELECT critical_value_thresholds FROM laboratories WHERE id = $1',
        [labId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const thresholds = result.rows[0].critical_value_thresholds || {};
      const testThreshold = thresholds[testCode];

      if (!testThreshold) {
        return false;
      }

      // Check against thresholds
      const isCritical =
        (testThreshold.low && resultValue < testThreshold.low) ||
        (testThreshold.high && resultValue > testThreshold.high);

      return isCritical;
    } catch (error) {
      console.error('Critical value check error:', error);
      return false;
    }
  }

  /**
   * Get critical value thresholds for a test
   */
  async getThresholds(labId, testCode) {
    try {
      const result = await db.query(
        'SELECT critical_value_thresholds FROM laboratories WHERE id = $1',
        [labId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const thresholds = result.rows[0].critical_value_thresholds || {};
      return thresholds[testCode];
    } catch (error) {
      console.error('Get thresholds error:', error);
      return null;
    }
  }

  /**
   * Set critical value thresholds for a lab
   */
  async setThresholds(labId, thresholds) {
    try {
      const result = await db.query(
        'UPDATE laboratories SET critical_value_thresholds = $1 WHERE id = $2 RETURNING id',
        [JSON.stringify(thresholds), labId]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('Set thresholds error:', error);
      return false;
    }
  }

  /**
   * Detect out-of-range values
   */
  isOutOfRange(value, rangeLow, rangeHigh) {
    if (!value || (rangeLow === null && rangeHigh === null)) {
      return false;
    }

    return (rangeLow !== null && value < rangeLow) || (rangeHigh !== null && value > rangeHigh);
  }

  /**
   * Detect abnormal values based on patient baseline
   */
  async isAbnormalFromBaseline(patientId, testCode, resultValue) {
    try {
      // Get patient's baseline (average of recent normal results)
      const result = await db.query(
        `SELECT AVG(result_value) as baseline
         FROM lab_test_results
         WHERE patient_id = $1 AND test_code = $2 AND is_critical_value = false
         AND result_timestamp > NOW() - INTERVAL '6 months'
         LIMIT 20`,
        [patientId, testCode]
      );

      if (result.rows.length === 0 || !result.rows[0].baseline) {
        return false;
      }

      const baseline = parseFloat(result.rows[0].baseline);
      const deviation = Math.abs((resultValue - baseline) / baseline);

      // Abnormal if > 50% deviation from baseline
      return deviation > 0.5;
    } catch (error) {
      console.error('Baseline abnormality check error:', error);
      return false;
    }
  }

  /**
   * Generate critical value alert message
   */
  generateAlertMessage(testName, value, unit, threshold) {
    let severity = 'CRITICAL';
    let message = `🚨 CRITICAL VALUE ALERT: ${testName}`;

    if (threshold) {
      if (value < threshold.low) {
        message += ` is DANGEROUSLY LOW (${value} ${unit}, threshold: <${threshold.low})`;
        severity = 'CRITICAL_LOW';
      } else if (value > threshold.high) {
        message += ` is DANGEROUSLY HIGH (${value} ${unit}, threshold: >${threshold.high})`;
        severity = 'CRITICAL_HIGH';
      }
    } else {
      message += `: ${value} ${unit}`;
    }

    return { message, severity };
  }
}

module.exports = new CriticalValueService();
