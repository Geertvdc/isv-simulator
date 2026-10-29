import { TICKET_DOMAIN_LABELS } from '../sim/content';
import { TICKS_PER_SECOND } from '../sim/balance';
import { type LevelSettings, settingsForPlayers } from '../sim/levels';
import { TICKET_DOMAINS, roleWorkRate, type RoleId, type TicketDomain } from '../sim/roles';

export interface Workload {
  lines: string[];
  summary: string[];
  codingDomains: TicketDomain[];
}

/** Authored proportions are expectations, not an exact random-round promise. Never draws RNG. */
export function workloadForecast(level: LevelSettings, players: number): Workload {
  const settings = settingsForPlayers(level, players);
  const counts = settings.domainSchedule?.counts;
  const domains = counts
    ? TICKET_DOMAINS.filter((d) => counts[d] > 0)
    : (['general'] as TicketDomain[]);
  const lines = [
    counts
      ? `Ordinary features per shuffled batch: ${domains.map((d) => `${TICKET_DOMAIN_LABELS[d]} ${counts[d]}`).join(' · ')}.`
      : 'Classic work: general-domain features.',
  ];
  const summary = [
    counts
      ? `Feature batch: ${domains.map((d) => `${TICKET_DOMAIN_LABELS[d]} ${counts[d]}`).join(' · ')}`
      : 'General-domain features · testing + returning bugs',
  ];
  const share = settings.fullstackShare ?? 0;
  if (share > 0) {
    domains.push('frontend', 'backend');
    lines.push(
      `About ${Math.round(share * 100)}% of feature orders are full-stack: two coding parts (one frontend + one backend), then merge.`,
    );
    summary.push(`Full-stack ~${Math.round(share * 100)}%: two coding parts (FE + BE)`);
  }
  if (settings.incidents) {
    const domain = settings.incidents.domain ?? 'general';
    domains.push(domain);
    lines.push(
      `Incidents: ${TICKET_DOMAIN_LABELS[domain]} code + build, from ${Math.round(settings.incidents.firstTick / TICKS_PER_SECOND)}s; they interrupt features.`,
    );
    summary.push(
      `Incidents: ${TICKET_DOMAIN_LABELS[domain]} from ${Math.round(settings.incidents.firstTick / TICKS_PER_SECOND)}s`,
    );
  }
  if ((settings.designShare ?? 0) > 0)
    lines.push('Some features start with design; designed code is faster.');
  if (settings.reviewShare > 0) lines.push('Some features need two reviewers together.');
  lines.push(
    'Testing covers feature work and returning bugs. Unattended builds do not gain role speed.',
  );
  const mechanics = [
    (settings.designShare ?? 0) > 0 ? 'Design boosts code' : '',
    settings.reviewShare > 0 ? 'Two-person reviews' : '',
  ].filter(Boolean);
  if (mechanics.length) summary.push(mechanics.join(' · '));
  return { lines, summary, codingDomains: [...new Set(domains)] };
}

export function coverageHint(workload: Workload, roles: readonly RoleId[]): string {
  const uncovered = workload.codingDomains.filter(
    (d) => !roles.some((r) => roleWorkRate(r, 'code', d) >= 1),
  );
  if (uncovered.length)
    return `Coverage note: slower coding in ${uncovered.map((d) => TICKET_DOMAIN_LABELS[d]).join(', ')}. Every role can still do every task.`;
  return 'Coverage: dependable coding across the planned mix. Generalists are viable; specialisation is optional.';
}
