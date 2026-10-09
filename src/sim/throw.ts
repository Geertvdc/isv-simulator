/**
 * Throwing: a carried ticket flies along the thrower's facing, over floor,
 * counters and other furniture. It lands on the first counter or station
 * that would take it, stops in front of walls, and otherwise drops on the
 * floor once it has flown `THROW_RANGE` tiles. Another empty-handed player
 * facing it catches it on the way.
 */

import {
  CATCH_RADIUS,
  THROW_HOLD_TICKS,
  THROW_RANGE,
  THROW_SPEED,
  TICKS_PER_SECOND,
} from './balance';
import { canPutDown } from './interact';
import { type GridPoint, getTile } from './level';
import { type GameState, type Player, type PlayerId, getPlayer } from './state';
import { type Ticket, ticketCarriedBy } from './tickets';

const STEP = THROW_SPEED / TICKS_PER_SECOND;

/**
 * One tick of the throw wind-up for `player`. `pressedIdle` is a press of
 * interact that did nothing; holding on after one throws the carried ticket.
 */
export function updateThrowCharge(
  state: GameState,
  player: Player,
  held: boolean,
  pressedIdle: boolean,
): void {
  if (!held || !ticketCarriedBy(state, player.id)) {
    player.throwCharge = 0;
    return;
  }
  if (pressedIdle) player.throwCharge = 1;
  else if (player.throwCharge > 0) player.throwCharge++;
  if (player.throwCharge >= THROW_HOLD_TICKS) {
    player.throwCharge = 0;
    throwTicket(state, player.id);
  }
}

/** Throws the ticket `playerId` carries along their facing. Returns whether there was one. */
export function throwTicket(state: GameState, playerId: PlayerId): boolean {
  const player = getPlayer(state, playerId);
  const ticket = ticketCarriedBy(state, playerId);
  if (!player || !ticket) return false;
  ticket.location = {
    kind: 'flying',
    pos: { ...player.pos },
    from: { ...player.pos },
    dir: { ...player.facing },
    thrownBy: playerId,
    lastFloor: tileOf(player.pos),
  };
  state.events.push({ type: 'thrown', playerId, ticketId: ticket.id });
  return true;
}

/** Moves every flying ticket one tick along, and lands or hands over the ones that are done. */
export function updateFlights(state: GameState): void {
  for (const ticket of state.tickets) {
    if (ticket.location.kind === 'flying') fly(state, ticket);
  }
}

function tileOf(pos: { x: number; y: number }): GridPoint {
  return { x: Math.round(pos.x) + 0, y: Math.round(pos.y) + 0 };
}

function fly(state: GameState, ticket: Ticket): void {
  const loc = ticket.location;
  if (loc.kind !== 'flying') return;
  const before = tileOf(loc.pos);
  const pos = { x: loc.pos.x + loc.dir.x * STEP, y: loc.pos.y + loc.dir.y * STEP };
  const at = tileOf(pos);
  const tile = getTile(state.level, at.x, at.y);

  if (tile === null || tile === 'wall') {
    land(state, ticket, loc.lastFloor);
    return;
  }
  loc.pos = pos;
  if (tile === 'floor') loc.lastFloor = at;
  const catcher = findCatcher(state, ticket);
  if (catcher) {
    ticket.location = { kind: 'player', playerId: catcher.id };
    state.events.push({ type: 'caught', playerId: catcher.id, ticketId: ticket.id });
    return;
  }
  const entered = at.x !== before.x || at.y !== before.y;
  if (entered && tile !== 'floor' && canPutDown(state, ticket, at.x, at.y)) {
    land(state, ticket, at);
    return;
  }
  const travelled = Math.hypot(pos.x - loc.from.x, pos.y - loc.from.y);
  if (travelled >= THROW_RANGE && tile === 'floor') land(state, ticket, at);
}

/** Lands on tile `at`: the counter or station it found, or the floor. */
function land(state: GameState, ticket: Ticket, at: GridPoint): void {
  ticket.location = { kind: 'tile', x: at.x, y: at.y };
  state.events.push({ type: 'landed', ticketId: ticket.id, ...at });
}

/**
 * The closest empty-handed player, other than the thrower, within reach and
 * facing the ticket as it comes at them.
 */
function findCatcher(state: GameState, ticket: Ticket): Player | undefined {
  const loc = ticket.location;
  if (loc.kind !== 'flying') return undefined;
  let best: Player | undefined;
  let bestDist = CATCH_RADIUS;
  for (const p of state.players) {
    if (p.id === loc.thrownBy || ticketCarriedBy(state, p.id)) continue;
    const dx = loc.pos.x - p.pos.x;
    const dy = loc.pos.y - p.pos.y;
    const dist = Math.hypot(dx, dy);
    const inFront = dx * p.facing.x + dy * p.facing.y > 0;
    const headOn = loc.dir.x * p.facing.x + loc.dir.y * p.facing.y < 0;
    if (dist > bestDist || !inFront || !headOn) continue;
    best = p;
    bestDist = dist;
  }
  return best;
}
