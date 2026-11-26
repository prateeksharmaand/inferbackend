/**
 * Spending rules shared by the API, the campaign execution engine and the budget optimisation agent.
 * Pure functions over BigInt minor units — no I/O — so every limit can be unit-tested exhaustively.
 *
 * Model: a campaign's daily budget can spend up to `daily × daysRemaining` for the rest of the month (ad platforms may
 * overdeliver on a single day but bill within the daily average). A change is allowed only if, after it, the projected
 * month-end spend stays within the monthly limit minus the reserve, the sum of daily budgets stays within the daily
 * limit, and the per-campaign / per-change caps hold.
 */
export interface Policy {
  autonomyLevel: 'RECOMMENDATION' | 'APPROVED_AUTOMATION' | 'AUTONOMOUS';
  maxDailySpendMinor: bigint | null; maxMonthlySpendMinor: bigint | null; maxCampaignBudgetMinor: bigint | null;
  maxBudgetIncreasePct: number; maxConcurrentCampaigns: number; reservePct: number; allowedProviders: string[];
}
export interface BudgetState {
  monthlyLimitMinor: bigint | null;   // organization budget for the month (customer-set)
  dailyLimitMinor: bigint | null;
  spentThisMonthMinor: bigint;        // reported by ad platforms
  spentTodayMinor: bigint;
  daysRemainingInclToday: number;
  activeDailyBudgetsMinor: bigint;    // sum of daily budgets of ACTIVE campaigns (excluding the one being changed)
  activeCampaigns: number;            // excluding the one being changed
}
export interface Change {
  actor: 'user' | 'agent';
  provider: string;
  currentDailyMinor: bigint | null;   // null = new campaign / not yet active
  newDailyMinor: bigint;
  activating: boolean;                // launching/resuming adds the campaign to the active set
}
export type Verdict = { allowed: true; warnings: string[] } | { allowed: false; reason: string; code: string; requiresApproval: boolean };

const min = (...xs: (bigint | null)[]) => xs.filter((x): x is bigint => x !== null).reduce<bigint | null>((a, b) => (a === null || b < a ? b : a), null);

export function effectiveMonthlyCap(p: Policy, b: BudgetState): bigint | null {
  return min(p.maxMonthlySpendMinor, b.monthlyLimitMinor);
}
export function effectiveDailyCap(p: Policy, b: BudgetState): bigint | null {
  return min(p.maxDailySpendMinor, b.dailyLimitMinor);
}
/** Monthly cap minus reserve, rounded down. */
export function spendableThisMonth(p: Policy, b: BudgetState): bigint | null {
  const cap = effectiveMonthlyCap(p, b);
  if (cap === null) return null;
  return (cap * BigInt(100 - p.reservePct)) / 100n;
}

export function checkChange(p: Policy, b: BudgetState, c: Change): Verdict {
  const warnings: string[] = [];
  const deny = (code: string, reason: string, requiresApproval = false): Verdict => ({ allowed: false, code, reason, requiresApproval });
  if (c.newDailyMinor <= 0n) return deny('invalid_budget', 'Daily budget must be greater than zero');
  if (c.actor === 'agent') {
    if (p.autonomyLevel === 'RECOMMENDATION') return deny('autonomy', 'Autonomy level is Recommendation: changes must be applied by a person', true);
    if (!p.allowedProviders.includes(c.provider)) return deny('provider_not_allowed', `Automation is not allowed on ${c.provider}`, true);
  }
  if (p.maxCampaignBudgetMinor !== null && c.newDailyMinor > p.maxCampaignBudgetMinor) {
    return deny('campaign_cap', `Daily budget exceeds the per-campaign limit (${p.maxCampaignBudgetMinor} minor units)`, c.actor === 'agent');
  }
  if (c.actor === 'agent' && c.currentDailyMinor !== null && c.newDailyMinor > c.currentDailyMinor) {
    const maxNew = (c.currentDailyMinor * BigInt(100 + p.maxBudgetIncreasePct)) / 100n;
    if (c.newDailyMinor > maxNew) return deny('increase_cap', `Increase exceeds ${p.maxBudgetIncreasePct}% per change`, true);
  }
  const willBeActive = c.activating || c.currentDailyMinor !== null;
  if (c.activating && b.activeCampaigns + 1 > p.maxConcurrentCampaigns) {
    return deny('concurrency_cap', `At most ${p.maxConcurrentCampaigns} campaigns may be active at once`, c.actor === 'agent');
  }
  if (willBeActive) {
    const dailyCap = effectiveDailyCap(p, b);
    const totalDaily = b.activeDailyBudgetsMinor + c.newDailyMinor;
    if (dailyCap !== null && totalDaily > dailyCap) return deny('daily_cap', 'The combined daily budgets of active campaigns would exceed the daily spending limit', c.actor === 'agent');
    if (dailyCap !== null && b.spentTodayMinor >= dailyCap) return deny('daily_spent', 'Today’s spending limit has already been reached', c.actor === 'agent');
    const spendable = spendableThisMonth(p, b);
    if (spendable !== null) {
      const remaining = spendable - b.spentThisMonthMinor;
      if (remaining <= 0n) return deny('monthly_exhausted', 'This month’s budget (after reserve) is used up', c.actor === 'agent');
      const projected = totalDaily * BigInt(Math.max(1, b.daysRemainingInclToday));
      if (projected > remaining) {
        return deny('monthly_cap', `At these daily budgets the rest of the month would spend more than the ${remaining} minor units remaining (after reserve)`, c.actor === 'agent');
      }
      if (projected * 10n > remaining * 9n) warnings.push('Projected spend uses more than 90% of the remaining monthly budget');
    } else if (c.actor === 'agent') {
      return deny('no_monthly_limit', 'Set a monthly budget before automation can change spend', true);
    }
  }
  return { allowed: true, warnings };
}

/** Days remaining in the month including today, in UTC. */
export function daysRemaining(now = new Date()): number {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return end.getUTCDate() - now.getUTCDate() + 1;
}

export interface ForecastInput {
  daysElapsed: number; daysInMonth: number; installsToDate: number; spendToDateMinor: bigint;
  recentInstalls: number; recentSpendMinor: bigint; recentDays: number; // trailing window (e.g. 7 days)
  remainingBudgetMinor: bigint | null; target: number;
}
export interface Forecast {
  method: string; expected: number; low: number; high: number; onTrack: boolean; projectedSpendMinor: bigint; recentCpiMinor: bigint | null;
  requiredDailyInstalls: number; requiredBudgetMinor: bigint | null; confidence: 'low' | 'medium' | 'high'; notes: string[];
}

/**
 * Month-end install forecast. Paid installs scale with remaining budget at the recent CPI; organic installs continue at
 * their recent daily rate. The band widens when there is little history. Never claims the target is reachable unless
 * the numbers say so.
 */
export function forecastMonth(f: ForecastInput): Forecast {
  const notes: string[] = [];
  const left = Math.max(0, f.daysInMonth - f.daysElapsed);
  const dailyInstalls = f.recentDays > 0 ? f.recentInstalls / f.recentDays : 0;
  const recentCpi = f.recentInstalls > 0 ? (f.recentSpendMinor + BigInt(Math.floor(f.recentInstalls / 2))) / BigInt(f.recentInstalls) : null;
  const dailySpend = f.recentDays > 0 ? f.recentSpendMinor / BigInt(f.recentDays) : 0n;
  let projectedSpend = dailySpend * BigInt(left);
  if (f.remainingBudgetMinor !== null && projectedSpend > f.remainingBudgetMinor) {
    projectedSpend = f.remainingBudgetMinor < 0n ? 0n : f.remainingBudgetMinor;
    notes.push('Spend is capped by the remaining monthly budget');
  }
  // installs per unit spend at recent efficiency; if no spend, fall back to the run-rate
  const remainingInstalls = recentCpi && recentCpi > 0n ? Number(projectedSpend / recentCpi) : Math.round(dailyInstalls * left);
  const expected = f.installsToDate + remainingInstalls;
  const history = f.daysElapsed;
  const spread = history >= 14 ? 0.15 : history >= 7 ? 0.25 : 0.45;
  if (history < 7) notes.push('Less than a week of data — wide uncertainty');
  if (f.recentInstalls === 0) notes.push('No installs recorded in the recent window');
  const confidence = history >= 14 && f.recentInstalls >= 100 ? 'high' : history >= 7 && f.recentInstalls >= 20 ? 'medium' : 'low';
  const requiredDaily = left > 0 ? Math.max(0, Math.ceil((f.target - f.installsToDate) / left)) : 0;
  const requiredBudget = recentCpi ? BigInt(Math.max(0, f.target - f.installsToDate)) * recentCpi : null;
  return {
    method: 'recent_cpi_budget_constrained', expected, low: Math.max(f.installsToDate, Math.floor(f.installsToDate + remainingInstalls * (1 - spread))), high: Math.ceil(f.installsToDate + remainingInstalls * (1 + spread)),
    onTrack: f.target > 0 && expected >= f.target, projectedSpendMinor: f.spendToDateMinor + projectedSpend, recentCpiMinor: recentCpi,
    requiredDailyInstalls: requiredDaily, requiredBudgetMinor: requiredBudget, confidence, notes,
  };
}
