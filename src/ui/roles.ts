import { selection, type RosterCommand } from '../flow/roster';
import type { Lobby } from '../input/lobby';
import {
  DOMAIN_ICONS,
  ROLE_DESCRIPTIONS,
  ROLE_ICONS,
  ROLE_LABELS,
  TICKET_DOMAIN_LABELS,
  WORK_TASK_LABELS,
} from '../sim/content';
import {
  ROLE_IDS,
  TICKET_DOMAINS,
  roleWorkRate,
  type RoleId,
  type TicketDomain,
  type WorkTask,
} from '../sim/roles';
import type { WorkFeedback } from '../sim/state';
import { rolePreviews } from '../render/three/RolePreview';
import { el } from './dom';

export function domainText(domain: TicketDomain): string {
  return `${DOMAIN_ICONS[domain]} ${TICKET_DOMAIN_LABELS[domain]}`;
}

export function roleText(roleId: RoleId): string {
  return `${ROLE_ICONS[roleId]} ${ROLE_LABELS[roleId]}`;
}

export function workRateText(work: WorkFeedback): string {
  if (work.task === 'review') return 'Review · quorum met';
  const solo = `${WORK_TASK_LABELS[work.task]} ${work.rate.toFixed(2)}x`;
  return work.teamRate === undefined ? solo : `${solo} · pair total ${work.teamRate.toFixed(2)}x`;
}

export type RosterDispatch = (command: RosterCommand) => void;

export interface SkillBar {
  label: string;
  rate: number;
  percent: number;
}

/** Every chart shares a scale: 1.00x is the baseline, 1.60x fills the track. */
export function roleSkills(role: RoleId): SkillBar[] {
  const skills: { label: string; task: WorkTask; domain: TicketDomain }[] = [
    ...TICKET_DOMAINS.map((domain) => ({
      label: `${TICKET_DOMAIN_LABELS[domain]} code`,
      task: 'code' as const,
      domain,
    })),
    { label: 'Testing', task: 'test', domain: 'general' },
    { label: 'Design', task: 'design', domain: 'general' },
    { label: 'Repair', task: 'repair', domain: 'general' },
  ];
  return skills.map(({ label, task, domain }) => {
    const rate = roleWorkRate(role, task, domain);
    return { label, rate, percent: (rate / 1.6) * 100 };
  });
}

/** Role UI is read-only except for commands; a device's arrow/confirm keys use the same path. */
export function rolePanel(
  root: HTMLElement,
  dispatch: RosterDispatch,
): {
  render: (lobby: Lobby | null, id: number, owned: boolean, confirmation: boolean) => void;
} {
  const panel = el('div', 'role-panel');
  const canvas = document.createElement('canvas');
  canvas.className = 'role-preview';
  canvas.width = canvas.height = 240;
  canvas.setAttribute('aria-hidden', 'true');
  const name = el('div', 'role-name');
  const description = el('p', 'role-description');
  const identity = el('div', 'role-identity');
  identity.append(canvas, name);
  const chart = el('div', 'role-skills');
  chart.setAttribute('aria-label', 'Base work speeds; 1.00x is standard');
  const controls = el('div', 'role-controls');
  const previous = document.createElement('button');
  const next = document.createElement('button');
  const ready = document.createElement('button');
  previous.textContent = '◀';
  next.textContent = '▶';
  previous.setAttribute('aria-label', 'Previous role');
  next.setAttribute('aria-label', 'Next role');
  const position = el('span', 'role-position');
  let current: { lobby: Lobby; id: number } | null = null;
  const cycle = (step: number): void => {
    if (!current) return;
    const role = selection(current.lobby, current.id).roleId;
    const roleId =
      ROLE_IDS[(ROLE_IDS.indexOf(role) + step + ROLE_IDS.length) % ROLE_IDS.length] ?? 'generalist';
    dispatch({ type: 'role', playerId: current.id, roleId });
  };
  previous.onclick = () => {
    cycle(-1);
  };
  next.onclick = () => {
    cycle(1);
  };
  ready.onclick = () => {
    if (current)
      dispatch({
        type: 'ready',
        playerId: current.id,
        ready: !selection(current.lobby, current.id).ready,
      });
  };
  controls.append(previous, position, next, ready);
  for (const control of [previous, next, ready]) {
    for (const event of ['keydown', 'keyup']) {
      control.addEventListener(event, (e) => {
        if (e instanceof KeyboardEvent && (e.key === 'Enter' || e.key === ' ')) e.stopPropagation();
      });
    }
  }
  panel.append(identity, description, chart, controls);
  root.append(panel);
  let shownRole: RoleId | null = null;
  return {
    render: (lobby, id, owned, confirmation) => {
      panel.hidden = !lobby;
      if (!lobby) {
        rolePreviews.hide(canvas);
        current = null;
        return;
      }
      current = { lobby, id };
      const choice = selection(lobby, id);
      name.textContent = roleText(choice.roleId);
      description.textContent = ROLE_DESCRIPTIONS[choice.roleId];
      rolePreviews.show(canvas, id, choice.roleId);
      previous.disabled = next.disabled = !owned;
      ready.disabled = !owned;
      ready.hidden = !confirmation;
      ready.textContent = choice.ready ? '✓ Ready · undo' : 'Confirm ready';
      ready.setAttribute('aria-pressed', String(choice.ready));
      panel.classList.toggle('is-ready', confirmation && choice.ready);
      panel.classList.toggle('with-confirmation', confirmation);
      if (shownRole === choice.roleId) return;
      shownRole = choice.roleId;
      const role = choice.roleId;
      position.textContent = `${ROLE_IDS.indexOf(role) + 1} / ${ROLE_IDS.length}`;
      chart.replaceChildren(
        ...roleSkills(role).map(({ label, rate, percent }) => {
          const row = el('div', 'skill-row');
          const track = el('span', 'skill-track');
          const fill = el('span', 'skill-fill');
          fill.style.width = `${percent}%`;
          track.setAttribute('aria-hidden', 'true');
          track.append(fill);
          row.dataset.strength = rate > 1 ? 'strong' : rate < 1 ? 'weak' : 'standard';
          row.append(
            el('span', 'skill-label', label),
            track,
            el('span', 'skill-value', `${rate.toFixed(2)}x`),
          );
          return row;
        }),
      );
    },
  };
}
