const FeatureAccessService = require('../../src/services/subscription/FeatureAccessService');

jest.mock('../../src/utils/logger');

describe('FeatureAccessService', () => {
  describe('getFeature', () => {
    it('should return feature definition', () => {
      const feature = FeatureAccessService.getFeature('patient_management');

      expect(feature).toBeDefined();
      expect(feature.key).toBe('patient_management');
    });

    it('should return null for unknown feature', () => {
      const feature = FeatureAccessService.getFeature('unknown_feature');

      expect(feature).toBeNull();
    });
  });

  describe('validateFeatureAccess', () => {
    it('should allow access for pro plan', async () => {
      const license = {
        plan: 'pro',
        planFeatures: { billing: true },
        primarySeatType: 'premium',
        aiCreditsRemaining: 100,
      };

      const access = await FeatureAccessService.validateFeatureAccess(license, 'billing');

      expect(access.allowed).toBe(true);
    });

    it('should deny access for base plan without feature', async () => {
      const license = {
        plan: 'base',
        planFeatures: { billing: false },
        primarySeatType: 'basic',
        aiCreditsRemaining: 0,
      };

      const access = await FeatureAccessService.validateFeatureAccess(license, 'billing');

      expect(access.allowed).toBe(false);
    });

    it('should deny AI features without credits', async () => {
      const license = {
        plan: 'pro',
        planFeatures: { ai_docassist: true },
        primarySeatType: 'premium',
        aiCreditsRemaining: 0,
      };

      const access = await FeatureAccessService.validateFeatureAccess(license, 'ai_docassist');

      expect(access.allowed).toBe(false);
      expect(access.reason).toContain('insufficient');
    });
  });

  describe('getVisibleFeatures', () => {
    it('should return features available to license', () => {
      const license = {
        plan: 'pro',
        planFeatures: { patient_management: true, billing: true },
        primarySeatType: 'premium',
      };

      const features = FeatureAccessService.getVisibleFeatures(license);

      expect(features.length).toBeGreaterThan(0);
    });
  });

  describe('getUpgradeSuggestions', () => {
    it('should suggest upgrade from base to pro', () => {
      const license = {
        plan: 'base',
        planFeatures: { billing: false },
      };

      const suggestions = FeatureAccessService.getUpgradeSuggestions(license, 'billing');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toContain('pro');
    });
  });
});
