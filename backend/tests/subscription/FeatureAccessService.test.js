/**
 * FeatureAccessService Tests
 *
 * Comprehensive tests for feature-based access control:
 * - Feature configuration retrieval
 * - Feature access validation
 * - Plan-based restrictions
 * - Seat type restrictions
 * - AI credit requirements
 * - Upsell suggestions
 */

const FeatureAccessService = require('../../src/services/subscription/FeatureAccessService');

describe('FeatureAccessService', () => {
  describe('getFeature()', () => {
    test('should return feature configuration for valid key', () => {
      const feature = FeatureAccessService.getFeature('patient_management');

      expect(feature).toBeDefined();
      expect(feature.key).toBe('patient_management');
      expect(feature.name).toBe('Patient Management');
      expect(feature.requiredPlan).toBe('base');
      expect(feature.requiredSeatTypes).toEqual(expect.arrayContaining(['premium', 'basic']));
    });

    test('should return null for unknown feature key', () => {
      const feature = FeatureAccessService.getFeature('nonexistent_feature');

      expect(feature).toBeNull();
    });

    test('should return AI features', () => {
      const scribe = FeatureAccessService.getFeature('ai_scribe');

      expect(scribe).toBeDefined();
      expect(scribe.aiCreditsRequired).toBeGreaterThan(0);
      expect(scribe.requiredPlan).toBe('pro');
    });

    test('should return pro features', () => {
      const billing = FeatureAccessService.getFeature('billing');

      expect(billing.requiredPlan).toBe('pro');
      expect(billing.category).toBe('pro');
    });
  });

  describe('getAllFeatures()', () => {
    test('should return array of all features', () => {
      const features = FeatureAccessService.getAllFeatures();

      expect(Array.isArray(features)).toBe(true);
      expect(features.length).toBeGreaterThan(10);
    });

    test('should include core EMR features', () => {
      const features = FeatureAccessService.getAllFeatures();
      const keys = features.map(f => f.key);

      expect(keys).toContain('patient_management');
      expect(keys).toContain('appointments');
      expect(keys).toContain('prescriptions');
    });

    test('should include pro features', () => {
      const features = FeatureAccessService.getAllFeatures();
      const keys = features.map(f => f.key);

      expect(keys).toContain('billing');
      expect(keys).toContain('analytics');
      expect(keys).toContain('export');
    });

    test('should include AI features', () => {
      const features = FeatureAccessService.getAllFeatures();
      const keys = features.map(f => f.key);

      expect(keys).toContain('ai_docassist');
      expect(keys).toContain('ai_scribe');
      expect(keys).toContain('ai_coding');
    });
  });

  describe('getFeaturesByCategory()', () => {
    test('should return features in emr category', () => {
      const features = FeatureAccessService.getFeaturesByCategory('emr');

      expect(features.length).toBeGreaterThan(2);
      features.forEach(f => expect(f.category).toBe('emr'));
    });

    test('should return features in pro category', () => {
      const features = FeatureAccessService.getFeaturesByCategory('pro');

      expect(features.length).toBeGreaterThan(2);
      features.forEach(f => expect(f.category).toBe('pro'));
    });

    test('should return AI features in ai category', () => {
      const features = FeatureAccessService.getFeaturesByCategory('ai');

      expect(features.length).toBeGreaterThan(1);
      features.forEach(f => {
        expect(f.category).toBe('ai');
        expect(f.aiCreditsRequired).toBeGreaterThan(0);
      });
    });

    test('should return empty array for nonexistent category', () => {
      const features = FeatureAccessService.getFeaturesByCategory('nonexistent');

      expect(features).toEqual([]);
    });
  });

  describe('validateFeatureAccess()', () => {
    const baseActiveLicense = {
      clinicId: 100,
      staffId: 10,
      plan: 'base',
      status: 'active',
      subscriptionValid: true,
      seatTypes: ['basic'],
      aiCreditsRemaining: 0,
    };

    const proActiveLicense = {
      clinicId: 100,
      staffId: 10,
      plan: 'pro',
      status: 'active',
      subscriptionValid: true,
      seatTypes: ['premium'],
      aiCreditsRemaining: 100,
    };

    test('should allow patient_management for base plan', () => {
      const result = FeatureAccessService.validateFeatureAccess(baseActiveLicense, 'patient_management');

      expect(result.accessible).toBe(true);
      expect(result.reason).toBe('allowed');
    });

    test('should deny billing for base plan', () => {
      const result = FeatureAccessService.validateFeatureAccess(baseActiveLicense, 'billing');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('pro_required');
    });

    test('should allow billing for pro plan', () => {
      const result = FeatureAccessService.validateFeatureAccess(proActiveLicense, 'billing');

      expect(result.accessible).toBe(true);
    });

    test('should deny feature for wrong seat type', () => {
      const license = {
        ...baseActiveLicense,
        seatTypes: ['basic'],
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'prescriptions');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('seat_type_not_allowed');
    });

    test('should allow prescriptions for premium seat', () => {
      const license = {
        ...proActiveLicense,
        seatTypes: ['premium'],
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'prescriptions');

      expect(result.accessible).toBe(true);
    });

    test('should deny AI feature without sufficient credits', () => {
      const license = {
        ...proActiveLicense,
        aiCreditsRemaining: 0, // ai_scribe requires 5
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'ai_scribe');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('insufficient_ai_credits');
    });

    test('should allow AI feature with sufficient credits', () => {
      const license = {
        ...proActiveLicense,
        aiCreditsRemaining: 10, // ai_scribe requires 5
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'ai_scribe');

      expect(result.accessible).toBe(true);
    });

    test('should deny feature for expired subscription', () => {
      const license = {
        ...baseActiveLicense,
        status: 'expired',
        subscriptionValid: false,
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'patient_management');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('subscription_inactive');
    });

    test('should deny feature for cancelled subscription', () => {
      const license = {
        ...baseActiveLicense,
        status: 'cancelled',
        subscriptionValid: false,
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'patient_management');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('subscription_inactive');
    });

    test('should allow feature for trial subscription', () => {
      const license = {
        ...proActiveLicense,
        status: 'trial',
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'billing');

      expect(result.accessible).toBe(true);
    });

    test('should return error for unknown feature', () => {
      const result = FeatureAccessService.validateFeatureAccess(baseActiveLicense, 'unknown_feature');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('unknown_feature');
    });

    test('should include feature details in response', () => {
      const result = FeatureAccessService.validateFeatureAccess(baseActiveLicense, 'billing');

      expect(result.feature).toBe('Billing & Invoicing');
      expect(result.currentPlan).toBe('base');
      expect(result.requiredPlan).toBe('pro');
    });
  });

  describe('assertFeatureAccess()', () => {
    const activeLicense = {
      clinicId: 100,
      staffId: 10,
      plan: 'pro',
      status: 'active',
      subscriptionValid: true,
      seatTypes: ['premium'],
      aiCreditsRemaining: 100,
    };

    test('should not throw when feature accessible', () => {
      expect(() => {
        FeatureAccessService.assertFeatureAccess(activeLicense, 'billing');
      }).not.toThrow();
    });

    test('should throw with code when feature denied', () => {
      const error = (() => {
        try {
          FeatureAccessService.assertFeatureAccess(activeLicense, 'patient_management');
        } catch (e) {
          return e;
        }
      })();

      expect(error).toBeDefined();
      expect(error.code).toBe('FEATURE_ACCESS_DENIED');
    });

    test('should include feature key in error', () => {
      const error = (() => {
        try {
          const license = { ...activeLicense, plan: 'base' };
          FeatureAccessService.assertFeatureAccess(license, 'billing');
        } catch (e) {
          return e;
        }
      })();

      expect(error.feature).toBe('billing');
    });

    test('should set error status to 402', () => {
      const error = (() => {
        try {
          const license = { ...activeLicense, plan: 'base' };
          FeatureAccessService.assertFeatureAccess(license, 'billing');
        } catch (e) {
          return e;
        }
      })();

      expect(error.status).toBe(402);
    });
  });

  describe('getVisibleFeatures()', () => {
    test('should return only accessible features', () => {
      const license = {
        clinicId: 100,
        plan: 'base',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['basic'],
        aiCreditsRemaining: 0,
      };

      const features = FeatureAccessService.getVisibleFeatures(license);

      expect(features.length).toBeGreaterThan(0);
      // All should be accessible
      features.forEach(feature => {
        const result = FeatureAccessService.validateFeatureAccess(license, feature.key);
        expect(result.accessible).toBe(true);
      });
    });

    test('should include patient_management for base plan', () => {
      const license = {
        plan: 'base',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['basic'],
        aiCreditsRemaining: 0,
      };

      const features = FeatureAccessService.getVisibleFeatures(license);
      const keys = features.map(f => f.key);

      expect(keys).toContain('patient_management');
    });

    test('should include billing for pro plan', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['premium'],
        aiCreditsRemaining: 100,
      };

      const features = FeatureAccessService.getVisibleFeatures(license);
      const keys = features.map(f => f.key);

      expect(keys).toContain('billing');
    });

    test('should exclude AI features without credits', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['premium'],
        aiCreditsRemaining: 0,
      };

      const features = FeatureAccessService.getVisibleFeatures(license);
      const keys = features.map(f => f.key);

      expect(keys).not.toContain('ai_scribe');
      expect(keys).not.toContain('ai_coding');
    });

    test('should include AI features with sufficient credits', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['premium'],
        aiCreditsRemaining: 100,
      };

      const features = FeatureAccessService.getVisibleFeatures(license);
      const keys = features.map(f => f.key);

      expect(keys).toContain('ai_scribe');
      expect(keys).toContain('ai_coding');
    });
  });

  describe('getUpgradeSuggestions()', () => {
    test('should return unavailable features for base plan', () => {
      const license = {
        plan: 'base',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['basic'],
        aiCreditsRemaining: 0,
      };

      const suggestions = FeatureAccessService.getUpgradeSuggestions(license);

      expect(suggestions.length).toBeGreaterThan(0);
      // All should be unavailable
      suggestions.forEach(suggestion => {
        const result = FeatureAccessService.validateFeatureAccess(license, suggestion.key);
        expect(result.accessible).toBe(false);
      });
    });

    test('should suggest pro features for base plan', () => {
      const license = {
        plan: 'base',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['basic'],
        aiCreditsRemaining: 0,
      };

      const suggestions = FeatureAccessService.getUpgradeSuggestions(license);
      const keys = suggestions.map(s => s.key);

      expect(keys).toContain('billing');
      expect(keys).toContain('analytics');
    });

    test('should include reason for each suggestion', () => {
      const license = {
        plan: 'base',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['basic'],
        aiCreditsRemaining: 0,
      };

      const suggestions = FeatureAccessService.getUpgradeSuggestions(license);

      suggestions.forEach(suggestion => {
        expect(suggestion.reason).toBeDefined();
        expect(suggestion.feature).toBeDefined();
        expect(suggestion.category).toBeDefined();
      });
    });

    test('should suggest AI upgrades without credits', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['premium'],
        aiCreditsRemaining: 0,
      };

      const suggestions = FeatureAccessService.getUpgradeSuggestions(license);
      const keys = suggestions.map(s => s.key);

      expect(keys).toContain('ai_scribe');
    });

    test('should return empty for pro plan with credits', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['premium'],
        aiCreditsRemaining: 100,
      };

      const suggestions = FeatureAccessService.getUpgradeSuggestions(license);

      expect(suggestions.length).toBe(0);
    });
  });

  describe('validatePolicyConfiguration()', () => {
    test('should validate all features are properly configured', () => {
      const result = FeatureAccessService.validatePolicyConfiguration();

      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    test('should return feature count', () => {
      const result = FeatureAccessService.validatePolicyConfiguration();

      expect(result.featureCount).toBeGreaterThan(10);
    });

    test('should verify all features have required fields', () => {
      const features = FeatureAccessService.getAllFeatures();

      features.forEach(feature => {
        expect(feature.key).toBeDefined();
        expect(feature.name).toBeDefined();
        expect(feature.requiredPlan).toBeDefined();
        expect(Array.isArray(feature.requiredSeatTypes)).toBe(true);
        expect(typeof feature.aiCreditsRequired).toBe('number');
      });
    });
  });

  describe('complex access scenarios', () => {
    test('should handle multiple seat types', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['premium', 'scribe'],
        aiCreditsRemaining: 50,
      };

      const prescriptionAccess = FeatureAccessService.validateFeatureAccess(license, 'prescriptions');
      const scribeAccess = FeatureAccessService.validateFeatureAccess(license, 'ai_scribe');

      expect(prescriptionAccess.accessible).toBe(true);
      expect(scribeAccess.accessible).toBe(true);
    });

    test('should deny based on any failing check', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['basic'], // Wrong seat type for prescriptions
        aiCreditsRemaining: 100,
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'prescriptions');

      expect(result.accessible).toBe(false);
    });

    test('should provide specific reason for denial', () => {
      const baseLicense = {
        plan: 'base',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['basic'],
        aiCreditsRemaining: 0,
      };

      const result = FeatureAccessService.validateFeatureAccess(baseLicense, 'billing');

      expect(result.reason).toBe('pro_required');
      expect(result.currentPlan).toBe('base');
      expect(result.requiredPlan).toBe('pro');
    });
  });

  describe('AI credit calculations', () => {
    test('should allow docassist with 1 credit', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['premium'],
        aiCreditsRemaining: 1,
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'ai_docassist');

      expect(result.accessible).toBe(true);
    });

    test('should deny docassist without credits', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['premium'],
        aiCreditsRemaining: 0,
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'ai_docassist');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('insufficient_ai_credits');
    });

    test('should allow scribe with 5 credits', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['premium'],
        aiCreditsRemaining: 5,
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'ai_scribe');

      expect(result.accessible).toBe(true);
    });

    test('should deny scribe with 4 credits', () => {
      const license = {
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        seatTypes: ['premium'],
        aiCreditsRemaining: 4,
      };

      const result = FeatureAccessService.validateFeatureAccess(license, 'ai_scribe');

      expect(result.accessible).toBe(false);
      expect(result.available).toBe(4);
      expect(result.required).toBe(5);
    });
  });
});
