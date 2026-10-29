import type { DevicePress } from '../input/controller';
import type { Lobby } from '../input/lobby';
import { ROLE_IDS, isRoleId, type RoleId } from '../sim/roles';

export interface Selection {
  roleId: RoleId;
  ready: boolean;
}

export type RosterCommand =
  | { type: 'role'; playerId: number; roleId: RoleId }
  | { type: 'ready'; playerId: number; ready: boolean };

/** Why a roster command was refused (shown with `COMMAND_FAILURE_TEXT`). */
export type RosterFailure = 'rosterLocked' | 'unknownPlayer' | 'unknownRole';

/** Unconfigured bindings (including old test/dev entry points) start as generalists. */
export function selection(lobby: Lobby, playerId: number): Selection {
  return lobby.selections?.[playerId] ?? { roleId: 'generalist', ready: false };
}

/**
 * The roster command handler. Outside `src/flow` go through `applyCommand`
 * (`./commands`), which dispatches here.
 */
export function configureRoster(
  lobby: Lobby,
  screen: string,
  command: RosterCommand,
): { ok: true } | { ok: false; reason: RosterFailure } {
  if (screen !== 'lobby' && screen !== 'intro') return { ok: false, reason: 'rosterLocked' };
  if (!lobby.players.some((p) => p.playerId === command.playerId)) {
    return { ok: false, reason: 'unknownPlayer' };
  }
  const previous = selection(lobby, command.playerId);
  if (command.type === 'role' && !isRoleId(command.roleId)) {
    return { ok: false, reason: 'unknownRole' };
  }
  const next =
    command.type === 'role'
      ? { roleId: command.roleId, ready: previous.roleId === command.roleId && previous.ready }
      : { ...previous, ready: command.ready };
  lobby.selections ??= {};
  lobby.selections[command.playerId] = next;
  return { ok: true };
}

export function resetReadiness(lobby: Lobby): void {
  for (const player of lobby.players) {
    if (lobby.selections?.[player.playerId]) {
      lobby.selections[player.playerId] = { ...selection(lobby, player.playerId), ready: false };
    }
  }
}

/** Only bound devices select; horizontal navigation cycles roles, confirmation readies. */
export function rosterPresses(
  lobby: Lobby,
  screen: string,
  presses: readonly DevicePress[],
): boolean {
  let changed = false;
  for (const player of lobby.players) {
    const press = presses.find((p) => p.deviceId === player.deviceId);
    if (!press) continue;
    if (press.nav.x !== 0) {
      const current = selection(lobby, player.playerId).roleId;
      const roleId =
        ROLE_IDS[
          (ROLE_IDS.indexOf(current) + Math.sign(press.nav.x) + ROLE_IDS.length) % ROLE_IDS.length
        ];
      if (!roleId) throw new Error('Invalid role cycle');
      configureRoster(lobby, screen, { type: 'role', playerId: player.playerId, roleId });
      changed = true;
    } else if (screen === 'intro' && press.interact) {
      configureRoster(lobby, screen, {
        type: 'ready',
        playerId: player.playerId,
        ready: !selection(lobby, player.playerId).ready,
      });
      changed = true;
    }
  }
  return changed;
}

export function rolesForRoster(lobby: Lobby): Record<number, RoleId> {
  return Object.fromEntries(
    lobby.players.map((p) => [p.playerId, selection(lobby, p.playerId).roleId]),
  );
}
