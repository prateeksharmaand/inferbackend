import { canTransition, TRANSITIONS } from './campaign-state';

describe('campaign state machine', () => {
  it('follows the documented lifecycle', () => {
    expect(canTransition('DRAFT', 'PENDING_APPROVAL')).toBe(true);
    expect(canTransition('PENDING_APPROVAL', 'READY')).toBe(true);
    expect(canTransition('READY', 'ACTIVE')).toBe(true);
    expect(canTransition('ACTIVE', 'PAUSED')).toBe(true);
    expect(canTransition('PAUSED', 'ACTIVE')).toBe(true);
    expect(canTransition('ACTIVE', 'COMPLETED')).toBe(true);
    expect(canTransition('COMPLETED', 'ARCHIVED')).toBe(true);
  });
  it('never skips approval or revives archived campaigns', () => {
    expect(canTransition('DRAFT', 'ACTIVE')).toBe(false);
    expect(canTransition('PENDING_APPROVAL', 'ACTIVE')).toBe(false);
    expect(canTransition('ACTIVE', 'ARCHIVED')).toBe(false); // pause or complete first so nothing keeps spending
    for (const to of Object.keys(TRANSITIONS)) expect(canTransition('ARCHIVED', to as never)).toBe(false);
  });
  it('lets failed campaigns be fixed or retried', () => {
    expect(canTransition('FAILED', 'DRAFT')).toBe(true);
    expect(canTransition('FAILED', 'READY')).toBe(true);
  });
});
