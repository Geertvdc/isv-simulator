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
  const summary = el('div', 'role-rates');
  const controls = el('div', 'role-controls');
  const previous = document.createElement('button');
  const next = document.createElement('button');
  const ready = document.createElement('button');
  previous.textContent = '◀ Role';
  next.textContent = 'Role ▶';
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
  controls.append(previous, next, ready);
  const details = document.createElement('details');
  details.className = 'role-details';
  details.append(el('summary', '', 'All work speeds'));
  for (const control of [previous, next, ready, details]) {
    for (const event of ['keydown', 'keyup']) {
      control.addEventListener(event, (e) => {
        if (e instanceof KeyboardEvent && (e.key === 'Enter' || e.key === ' ')) e.stopPropagation();
      });
    }
  }
  const matrix = el('div', 'role-matrix');
  details.append(matrix);
  panel.append(canvas, name, description, summary, controls, details);
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
      if (shownRole === choice.roleId) return;
      shownRole = choice.roleId;
      const role = choice.roleId;
      const best = Math.max(...TICKET_DOMAINS.map((d) => roleWorkRate(role, 'code', d)));
      summary.textContent = `Code ${best.toFixed(2)}x peak · Test ${roleWorkRate(role, 'test', 'general').toFixed(2)}x`;
      matrix.replaceChildren(
        ...[
          ...TICKET_DOMAINS.map(
            (domain) =>
              `${domainText(domain)} code: ${roleWorkRate(role, 'code', domain).toFixed(2)}x`,
          ),
          `Test: ${roleWorkRate(role, 'test', 'general').toFixed(2)}x · Design: 1.00x`,
          `Repair: ${roleWorkRate(role, 'repair', 'general').toFixed(2)}x · Review: quorum unchanged`,
          'Work speed, not duration. Builds run unattended. Design and pairing apply during work.',
        ].map((text) => el('div', '', text)),
      );
    },
  };
}
