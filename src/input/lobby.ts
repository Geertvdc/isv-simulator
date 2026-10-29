/**
 * The join lobby: who plays with which device. Player `n` gets color `n` and
 * spawn `n`, in join order.
 */

import { MAX_PLAYERS } from '../sim/level';
import type { PlayerBinding } from './commands';
import type { DeviceId, DevicePress } from './controller';
import { isGamepadDevice } from './gamepad';
import type { Selection } from '../flow/roster';

export interface Lobby {
  /** In join order: `players[0]` is player 1. */
  players: PlayerBinding[];
  started: boolean;
  /** Ephemeral session choices, keyed by stable player identity, not controller. */
  selections?: Record<number, Selection>;
}

export function createLobby(): Lobby {
  return { players: [], started: false };
}

function isBound(players: readonly PlayerBinding[], deviceId: DeviceId): boolean {
  return players.some((p) => p.deviceId === deviceId);
}

/**
 * Applies this frame's button presses. A join press joins the first free
 * device in its join group (so Enter joins the left keyboard scheme, then the
 * right one). A joined device that `canStart` (player 1's by default; online,
 * the host's) starts the game with its interact button, or with its join
 * button once nothing in its group is left to join. Returns whether the
 * lobby changed.
 */
export function updateLobby(
  lobby: Lobby,
  presses: readonly DevicePress[],
  canStart: (deviceId: DeviceId) => boolean = (id) => id === lobby.players[0]?.deviceId,
): boolean {
  if (lobby.started) return false;
  const starter = (id: DeviceId): boolean => isBound(lobby.players, id) && canStart(id);
  // Decided before anyone joins, so the press that joins a player doesn't also start.
  let start = presses.some((p) => p.interact && starter(p.deviceId));
  let changed = false;

  const groups = new Map<string, DevicePress[]>();
  for (const press of presses) {
    if (!press.join) continue;
    const group = groups.get(press.joinGroup) ?? [];
    group.push(press);
    groups.set(press.joinGroup, group);
  }
  for (const group of groups.values()) {
    const free = group.find((p) => !isBound(lobby.players, p.deviceId));
    if (free) {
      if (lobby.players.length >= MAX_PLAYERS) continue;
      lobby.players.push({ playerId: lobby.players.length + 1, deviceId: free.deviceId });
      changed = true;
    } else if (group.some((p) => starter(p.deviceId))) {
      start = true;
    }
  }

  if (start) {
    lobby.started = true;
    changed = true;
  }
  return changed;
}

/**
 * Mid-game, a gamepad that isn't playing yet takes over the first player
 * whose gamepad got disconnected, when its join button is pressed. Mutates
 * `players`; returns whether a player changed hands.
 */
export function claimOrphanedPlayer(
  players: PlayerBinding[],
  presses: readonly DevicePress[],
  connected: ReadonlySet<DeviceId>,
): boolean {
  let changed = false;
  for (const press of presses) {
    if (!press.join || !isGamepadDevice(press.deviceId) || isBound(players, press.deviceId)) {
      continue;
    }
    const orphan = players.find((p) => isGamepadDevice(p.deviceId) && !connected.has(p.deviceId));
    if (!orphan) break;
    orphan.deviceId = press.deviceId;
    changed = true;
  }
  return changed;
}
