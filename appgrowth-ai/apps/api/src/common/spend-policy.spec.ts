import { BudgetState, checkChange, daysRemaining, forecastMonth, Policy, spendableThisMonth } from './spend-policy';

const policy = (o: Partial<Policy> = {}): Policy => ({
  autonomyLevel: 'APPROVED_AUTOMATION', maxDailySpendMinor: null, maxMonthlySpendMinor: null, maxCampaignBudgetMinor: null,
  maxBudgetIncreasePct: 20, maxConcurrentCampaigns: 10, reservePct: 10, allowedProviders: ['GOOGLE_ADS', 'META_ADS'], ...o,
});
const budget = (o: Partial<BudgetState> = {}): BudgetState => ({
  monthlyLimitMinor: 300_000_00n, dailyLimitMinor: null, spentThisMonthMinor: 0n, spentTodayMinor: 0n, daysRemainingInclToday: 30,
  activeDailyBudgetsMinor: 0n, activeCampaigns: 0, ...o,
});

describe('spend policy', () => {
  it('holds back the reserve', () => {
    expect(spendableThisMonth(policy({ reservePct: 10 }), budget({ monthlyLimitMinor: 1000n }))).toBe(900n);
    expect(spendableThisMonth(policy({ maxMonthlySpendMinor: 500n }), budget({ monthlyLimitMinor: 1000n }))).toBe(450n); // the lower cap wins
  });

  it('lets a person launch within budget', () => {
    const v = checkChange(policy(), budget(), { actor: 'user', provider: 'GOOGLE_ADS', currentDailyMinor: null, newDailyMinor: 9000_00n, activating: true });
    expect(v.allowed).toBe(true);
  });

  it('refuses a launch that would overspend the month (after reserve)', () => {
    // 300k limit, 10% reserve → 270k; 30 days × 10k = 300k > 270k
    const v = checkChange(policy(), budget(), { actor: 'user', provider: 'GOOGLE_ADS', currentDailyMinor: null, newDailyMinor: 10_000_00n, activating: true });
    expect(v).toMatchObject({ allowed: false, code: 'monthly_cap' });
  });

  it('accounts for money already spent and other active campaigns', () => {
    const b = budget({ spentThisMonthMinor: 200_000_00n, daysRemainingInclToday: 10, activeDailyBudgetsMinor: 5_000_00n, activeCampaigns: 1 });
    // remaining after reserve = 270k − 200k = 70k; (5k + 3k) × 10 = 80k > 70k
    expect(checkChange(policy(), b, { actor: 'user', provider: 'META_ADS', currentDailyMinor: null, newDailyMinor: 3_000_00n, activating: true })).toMatchObject({ allowed: false, code: 'monthly_cap' });
    expect(checkChange(policy(), b, { actor: 'user', provider: 'META_ADS', currentDailyMinor: null, newDailyMinor: 2_000_00n, activating: true }).allowed).toBe(true);
  });

  it('stops everything once the month is exhausted', () => {
    const v = checkChange(policy(), budget({ spentThisMonthMinor: 270_000_00n }), { actor: 'user', provider: 'GOOGLE_ADS', currentDailyMinor: 100n, newDailyMinor: 100n, activating: false });
    expect(v).toMatchObject({ allowed: false, code: 'monthly_exhausted' });
  });

  it('enforces the daily cap across campaigns', () => {
    const p = policy({ maxDailySpendMinor: 10_000_00n });
    const b = budget({ activeDailyBudgetsMinor: 8_000_00n, activeCampaigns: 2 });
    expect(checkChange(p, b, { actor: 'user', provider: 'GOOGLE_ADS', currentDailyMinor: null, newDailyMinor: 2_500_00n, activating: true })).toMatchObject({ allowed: false, code: 'daily_cap' });
  });

  it('blocks agents at Recommendation level and on disallowed channels', () => {
    expect(checkChange(policy({ autonomyLevel: 'RECOMMENDATION' }), budget(), { actor: 'agent', provider: 'GOOGLE_ADS', currentDailyMinor: 100n, newDailyMinor: 110n, activating: false }))
      .toMatchObject({ allowed: false, code: 'autonomy', requiresApproval: true });
    expect(checkChange(policy(), budget(), { actor: 'agent', provider: 'TIKTOK_ADS', currentDailyMinor: 100n, newDailyMinor: 110n, activating: false }))
      .toMatchObject({ allowed: false, code: 'provider_not_allowed' });
  });

  it('caps the size of an agent increase but lets people decide', () => {
    expect(checkChange(policy(), budget(), { actor: 'agent', provider: 'GOOGLE_ADS', currentDailyMinor: 1000_00n, newDailyMinor: 1200_00n, activating: false }).allowed).toBe(true);
    expect(checkChange(policy(), budget(), { actor: 'agent', provider: 'GOOGLE_ADS', currentDailyMinor: 1000_00n, newDailyMinor: 1201_00n, activating: false })).toMatchObject({ allowed: false, code: 'increase_cap' });
    expect(checkChange(policy(), budget(), { actor: 'user', provider: 'GOOGLE_ADS', currentDailyMinor: 1000_00n, newDailyMinor: 2000_00n, activating: false }).allowed).toBe(true);
  });

  it('requires a monthly limit before agents touch spend', () => {
    expect(checkChange(policy(), budget({ monthlyLimitMinor: null }), { actor: 'agent', provider: 'GOOGLE_ADS', currentDailyMinor: 100n, newDailyMinor: 100n, activating: false }))
      .toMatchObject({ allowed: false, code: 'no_monthly_limit' });
  });

  it('enforces the per-campaign cap and concurrency cap', () => {
    expect(checkChange(policy({ maxCampaignBudgetMinor: 500n }), budget(), { actor: 'user', provider: 'GOOGLE_ADS', currentDailyMinor: null, newDailyMinor: 501n, activating: true })).toMatchObject({ code: 'campaign_cap' });
    expect(checkChange(policy({ maxConcurrentCampaigns: 2 }), budget({ activeCampaigns: 2 }), { actor: 'user', provider: 'GOOGLE_ADS', currentDailyMinor: null, newDailyMinor: 100n, activating: true })).toMatchObject({ code: 'concurrency_cap' });
  });

  it('always allows reducing spend that is within limits', () => {
    const b = budget({ spentThisMonthMinor: 100_000_00n, daysRemainingInclToday: 15, activeDailyBudgetsMinor: 0n, activeCampaigns: 0 });
    expect(checkChange(policy(), b, { actor: 'agent', provider: 'GOOGLE_ADS', currentDailyMinor: 9000_00n, newDailyMinor: 5000_00n, activating: false }).allowed).toBe(true);
  });

  it('counts days remaining including today', () => {
    expect(daysRemaining(new Date(Date.UTC(2026, 10, 30)))).toBe(1);
    expect(daysRemaining(new Date(Date.UTC(2026, 1, 1)))).toBe(28);
  });
});

describe('forecast', () => {
  it('projects installs from recent CPI, constrained by remaining budget', () => {
    const f = forecastMonth({ daysElapsed: 15, daysInMonth: 30, installsToDate: 3000, spendToDateMinor: 60_000_00n, recentInstalls: 1400, recentSpendMinor: 28_000_00n, recentDays: 7, remainingBudgetMinor: 40_000_00n, target: 10000 });
    // CPI = 20.00; run-rate spend 4k/day × 15 = 60k but only 40k left → 2000 more installs
    expect(f.recentCpiMinor).toBe(2000n);
    expect(f.expected).toBe(5000);
    expect(f.onTrack).toBe(false);
    expect(f.notes).toContain('Spend is capped by the remaining monthly budget');
    expect(f.requiredBudgetMinor).toBe(7000n * 2000n);
    expect(f.low).toBeLessThan(f.expected); expect(f.high).toBeGreaterThan(f.expected);
  });
  it('is honest with no data', () => {
    const f = forecastMonth({ daysElapsed: 2, daysInMonth: 30, installsToDate: 0, spendToDateMinor: 0n, recentInstalls: 0, recentSpendMinor: 0n, recentDays: 2, remainingBudgetMinor: null, target: 10000 });
    expect(f).toMatchObject({ expected: 0, onTrack: false, confidence: 'low', recentCpiMinor: null, requiredBudgetMinor: null });
  });
});
