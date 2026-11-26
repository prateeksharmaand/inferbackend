import type { CampaignStatus } from '@prisma/client';

/**
 * Campaign lifecycle. Transitions not listed here are rejected everywhere (API, executor, optimisation agent).
 *   DRAFT → PENDING_APPROVAL → READY → ACTIVE ⇄ PAUSED → COMPLETED → ARCHIVED
 *   FAILED is reachable from creation/launch; it returns to DRAFT for editing.
 */
export const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'READY', 'ARCHIVED'],
  PENDING_APPROVAL: ['READY', 'DRAFT', 'ARCHIVED'],
  READY: ['ACTIVE', 'FAILED', 'DRAFT', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'FAILED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'ARCHIVED', 'FAILED'],
  FAILED: ['DRAFT', 'READY', 'ARCHIVED', 'PAUSED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};
export const canTransition = (from: CampaignStatus, to: CampaignStatus) => TRANSITIONS[from].includes(to);
export const EDITABLE: CampaignStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'READY', 'FAILED'];
export const LIVE: CampaignStatus[] = ['ACTIVE', 'PAUSED'];
