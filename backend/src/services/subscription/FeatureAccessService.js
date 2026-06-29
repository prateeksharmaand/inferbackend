/**
 * FeatureAccessService - Feature-based access control
 *
 * Configuration-driven feature gating.
 * All feature checks go through this service.
 */

const { pool } = require('../../config/database');
const logger = require('../../utils/logger');

// Feature configuration - single source of truth
const FEATURES = {
  // Core EMR Features
  PATIENT_MANAGEMENT: {
    key: 'patient_management',
    name: 'Patient Management',
    requiredPlan: 'base',
    requiredSeatTypes: ['premium', 'basic'],
    aiCreditsRequired: 0,
    usageLimit: 'max_patients',
    apiEndpoint: '/api/patients',
    category: 'emr',
  },
  APPOINTMENTS: {
    key: 'appointments',
    name: 'Appointments',
    requiredPlan: 'base',
    requiredSeatTypes: ['premium', 'basic'],
    aiCreditsRequired: 0,
    usageLimit: 'max_appointments',
    apiEndpoint: '/api/appointments',
    category: 'emr',
  },
  PRESCRIPTIONS: {
    key: 'prescriptions',
    name: 'Prescriptions',
    requiredPlan: 'base',
    requiredSeatTypes: ['premium'],
    aiCreditsRequired: 0,
    usageLimit: 'max_prescriptions',
    apiEndpoint: '/api/prescriptions',
    category: 'emr',
  },

  // Pro Features
  BILLING: {
    key: 'billing',
    name: 'Billing & Invoicing',
    requiredPlan: 'pro',
    requiredSeatTypes: ['premium', 'basic'],
    aiCreditsRequired: 0,
    usageLimit: null,
    apiEndpoint: '/api/billing',
    category: 'pro',
  },
  ANALYTICS: {
    key: 'analytics',
    name: 'Analytics & Reports',
    requiredPlan: 'pro',
    requiredSeatTypes: ['premium', 'basic'],
    aiCreditsRequired: 0,
    usageLimit: null,
    apiEndpoint: '/api/reports',
    category: 'pro',
  },
  EXPORT: {
    key: 'export',
    name: 'Export',
    requiredPlan: 'pro',
    requiredSeatTypes: ['premium', 'basic'],
    aiCreditsRequired: 0,
    usageLimit: null,
    apiEndpoint: '/api/export',
    category: 'pro',
  },

  // AI Features
  AI_DOCASSIST: {
    key: 'ai_docassist',
    name: 'DocAssist AI',
    requiredPlan: 'pro',
    requiredSeatTypes: ['premium'],
    aiCreditsRequired: 1,
    usageLimit: null,
    apiEndpoint: '/api/ai/docassist',
    category: 'ai',
  },
  AI_SCRIBE: {
    key: 'ai_scribe',
    name: 'AI Scribe',
    requiredPlan: 'pro',
    requiredSeatTypes: ['premium', 'scribe'],
    aiCreditsRequired: 5,
    usageLimit: null,
    apiEndpoint: '/api/ai/scribe',
    category: 'ai',
  },
  AI_CODING: {
    key: 'ai_coding',
    name: 'Medical Coding AI',
    requiredPlan: 'pro',
    requiredSeatTypes: ['premium'],
    aiCreditsRequired: 2,
    usageLimit: null,
    apiEndpoint: '/api/ai/coding',
    category: 'ai',
  },
  AI_MEAL_PLAN: {
    key: 'ai_meal_plan',
    name: 'AI Meal Plan',
    requiredPlan: 'pro',
    requiredSeatTypes: ['premium', 'basic'],
    aiCreditsRequired: 1,
    usageLimit: null,
    apiEndpoint: '/api/diet/ai-meal-plan',
    category: 'ai',
  },

  // Lab Features
  LAB_UPLOAD: {
    key: 'lab_upload',
    name: 'Lab Upload',
    requiredPlan: 'pro',
    requiredSeatTypes: ['premium', 'basic'],
    aiCreditsRequired: 0,
    usageLimit: null,
    apiEndpoint: '/api/labs/upload',
    category: 'pro',
  },

  // Advanced Features
  TELEMEDICINE: {
    key: 'telemedicine',
    name: 'Telemedicine',
    requiredPlan: 'pro',
    requiredSeatTypes: ['premium'],
    aiCreditsRequired: 0,
    usageLimit: null,
    apiEndpoint: '/api/telemedicine',
    category: 'pro',
  },
  ABDM: {
    key: 'abdm',
    name: 'ABDM Integration',
    requiredPlan: 'pro',
    requiredSeatTypes: ['premium'],
    aiCreditsRequired: 0,
    usageLimit: null,
    apiEndpoint: '/api/abdm',
    category: 'pro',
  },
};

class FeatureAccessService {
  /**
   * Get feature configuration
   * @param {string} featureKey
   * @returns {Object|null} Feature config
   */
  getFeature(featureKey) {
    const feature = Object.values(FEATURES).find(f => f.key === featureKey);
    return feature || null;
  }

  /**
   * Get all features
   * @returns {Array} All feature configurations
   */
  getAllFeatures() {
    return Object.values(FEATURES);
  }

  /**
   * Get features by category
   * @param {string} category
   * @returns {Array} Features in category
   */
  getFeaturesByCategory(category) {
    return Object.values(FEATURES).filter(f => f.category === category);
  }

  /**
   * Validate if feature is accessible
   * @param {Object} effectiveLicense - Result from EffectiveLicenseResolver
   * @param {string} featureKey
   * @returns {Object} {accessible: boolean, reason: string, ...}
   */
  validateFeatureAccess(effectiveLicense, featureKey) {
    const feature = this.getFeature(featureKey);

    if (!feature) {
      return {
        accessible: false,
        reason: 'unknown_feature',
        featureKey,
      };
    }

    // Check subscription status
    if (!['active', 'trial'].includes(effectiveLicense.status)) {
      return {
        accessible: false,
        reason: 'subscription_inactive',
        subscriptionStatus: effectiveLicense.status,
        feature: feature.name,
      };
    }

    // Check plan requirement
    if (effectiveLicense.plan !== feature.requiredPlan) {
      if (feature.requiredPlan === 'pro') {
        return {
          accessible: false,
          reason: 'pro_required',
          feature: feature.name,
          currentPlan: effectiveLicense.plan,
          requiredPlan: feature.requiredPlan,
        };
      }
    }

    // Check seat type requirement
    const hasAllowedSeat = effectiveLicense.seatTypes.some(st =>
      feature.requiredSeatTypes.includes(st)
    );

    if (!hasAllowedSeat) {
      return {
        accessible: false,
        reason: 'seat_type_not_allowed',
        feature: feature.name,
        requiredSeatTypes: feature.requiredSeatTypes,
        userSeatTypes: effectiveLicense.seatTypes,
      };
    }

    // Check AI credits if required
    if (feature.aiCreditsRequired > 0) {
      if (effectiveLicense.aiCreditsRemaining < feature.aiCreditsRequired) {
        return {
          accessible: false,
          reason: 'insufficient_ai_credits',
          feature: feature.name,
          required: feature.aiCreditsRequired,
          available: effectiveLicense.aiCreditsRemaining,
        };
      }
    }

    // All checks passed
    return {
      accessible: true,
      reason: 'allowed',
      feature: feature.name,
    };
  }

  /**
   * Check if user can access feature (throw on deny)
   * @param {Object} effectiveLicense
   * @param {string} featureKey
   * @throws {Error} If access denied
   */
  assertFeatureAccess(effectiveLicense, featureKey) {
    const result = this.validateFeatureAccess(effectiveLicense, featureKey);

    if (!result.accessible) {
      const error = new Error(`Feature access denied: ${featureKey}`);
      error.code = 'FEATURE_ACCESS_DENIED';
      error.reason = result.reason;
      error.feature = featureKey;
      error.details = result;
      error.status = 402;
      throw error;
    }
  }

  /**
   * Get visible features for frontend
   * @param {Object} effectiveLicense
   * @returns {Array} Accessible features
   */
  getVisibleFeatures(effectiveLicense) {
    return Object.values(FEATURES).filter(feature => {
      const result = this.validateFeatureAccess(effectiveLicense, feature.key);
      return result.accessible;
    });
  }

  /**
   * Get upsell/upgrade suggestions
   * @param {Object} effectiveLicense
   * @returns {Array} Unavailable features for upsell
   */
  getUpgradeSuggestions(effectiveLicense) {
    return Object.values(FEATURES)
      .filter(feature => {
        const result = this.validateFeatureAccess(effectiveLicense, feature.key);
        return !result.accessible;
      })
      .map(feature => ({
        feature: feature.name,
        key: feature.key,
        category: feature.category,
        reason: this.validateFeatureAccess(effectiveLicense, feature.key).reason,
      }));
  }

  /**
   * Validate feature policy configuration is complete
   * @returns {Object} {valid: boolean, missingFeatures: [...]}
   */
  validatePolicyConfiguration() {
    const missingFields = [];

    Object.values(FEATURES).forEach(feature => {
      if (!feature.key || !feature.name) {
        missingFields.push(`${feature.key}: missing name or key`);
      }
      if (!feature.requiredPlan) {
        missingFields.push(`${feature.key}: missing requiredPlan`);
      }
      if (!Array.isArray(feature.requiredSeatTypes)) {
        missingFields.push(`${feature.key}: missing requiredSeatTypes`);
      }
      if (typeof feature.aiCreditsRequired !== 'number') {
        missingFields.push(`${feature.key}: missing aiCreditsRequired`);
      }
    });

    return {
      valid: missingFields.length === 0,
      featureCount: Object.values(FEATURES).length,
      missingFields,
    };
  }
}

module.exports = new FeatureAccessService();
