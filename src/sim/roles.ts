import { ROLE_CODE_RATES, ROLE_REPAIR_RATES, ROLE_TEST_RATES } from './balance';
import type { StepKind } from './tickets';

export const ROLE_IDS = ['generalist', 'frontend', 'backend', 'qa', 'platform'] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export const TICKET_DOMAINS = ['general', 'frontend', 'backend', 'infra', 'mixed'] as const;

export type TicketDomain = (typeof TICKET_DOMAINS)[number];

export type WorkTask = StepKind | 'repair';

/** Work-speed multiplier for one role doing one task on a ticket domain. */
export function roleWorkRate(roleId: RoleId, task: WorkTask, domain: TicketDomain): number {
  if (task === 'code') return ROLE_CODE_RATES[roleId][domain];
  if (task === 'test') return ROLE_TEST_RATES[roleId];
  if (task === 'repair') return ROLE_REPAIR_RATES[roleId];
  return 1;
}

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === 'string' && ROLE_IDS.some((roleId) => roleId === value);
}
