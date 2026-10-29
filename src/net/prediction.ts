/**
 * Client-side prediction of this machine's players' movement.
 *
 * Online, everything on screen comes from the server's snapshots, drawn a
 * moment in the past (13e). For other players that's smooth; for your own
 * it means your developer starts moving a round trip plus 100 ms after the
 * key. So the client runs the sim's own movement code (`movePlayer`, the
 * player push and the manager push) for its own players, with the inputs it
 * just sent, ahead of the server: to the tick its newest input lands on.
 *
 * - The server applies the input stamped `t` at server tick `t`, and the
 *   snapshot labelled `S` comes after ticks `< S` ran. So each snapshot
 *   says where the local players really were at `S`; prediction takes that
 *   (the base) and replays the inputs stamped `S` and later (reconciliation).
 * - Ticks without a sent input repeat the newest earlier one, as the server
 *   does, and stand still after `NET_INPUT_REPEAT_TICKS`.
 * - Other players are simulated along without input from where the newest
 *   snapshot has them (they slow down and stop, and get pushed like on the
 *   server), but never drawn from here: the screen shows them interpolated.
 *   A teammate standing still is then exactly what the server has; someone
 *   walking is off and the server's correction glides it away. Managers are
 *   obstacles where the newest snapshot has them.
 * - A correction (the predicted position moved by a reconcile) becomes a
 *   visual offset that decays over `NET_PREDICT_SMOOTH_MS`; past
 *   `NET_PREDICT_SNAP_DISTANCE`, or when the snapshot says a local player
 *   was shoved or bumped, it snaps.
 * - While the round isn't running (pause, results) nothing is predicted:
 *   the local players are where the newest snapshot has them. During the
 *   countdown the server tick the round starts on is known, so prediction
 *   stands still until then and moves from that tick on, like the server.
 *
 * Only movement is predicted. Tickets, stations, throws and everything else
 * stay the server's, drawn interpolated.
 */

import {
  COUNTDOWN_STEP_MS,
  COUNTDOWN_STEPS,
  NET_INPUT_REPEAT_TICKS,
  NET_PREDICT_MAX_TICKS,
  NET_PREDICT_SMOOTH_MS,
  NET_PREDICT_SNAP_DISTANCE,
  TICKS_PER_SECOND,
} from '../sim/balance';
import type { LevelMap } from '../sim/level';
import { pushOutOfManager } from '../sim/manager';
import { movePlayer } from '../sim/movement';
import type { GameEvent } from '../sim/orders';
import { separatePlayers } from '../sim/push';
import type { InputCommand, Player, PlayerId, Vec } from '../sim/state';

const TICK_MS = 1000 / TICKS_PER_SECOND;
const COUNTDOWN_MS = COUNTDOWN_STEPS * COUNTDOWN_STEP_MS;

/** A correction smaller than this (tiles) is rounding, not a correction. */
const CORRECTION_EPSILON = 1e-6;
/** An offset shorter than this (tiles) is gone. */
const OFFSET_EPSILON = 0.001;

interface Obstacle {
  pos: Vec;
  facing: Vec;
}

export interface PredictionStats {
  /** Snapshots taken in. */
  reconciles: number;
  /** Reconciles that moved a local player's predicted position. */
  corrections: number;
  /** Corrections drawn as a jump (too far, or a shove). */
  snaps: number;
  /** The largest correction seen, in tiles, and the last one. */
  maxErrorTiles: number;
  lastErrorTiles: number;
}

/** What the server's snapshot says, as far as prediction cares. */
export interface PredictionSnapshot {
  serverTick: number;
  players: readonly Player[];
  managers: readonly Obstacle[];
  events: readonly GameEvent[];
  /**
   * The server tick the sim runs from: at or before `serverTick` while the
   * round plays, the countdown's end during the countdown, `null` while it
   * doesn't run (a pause, the results).
   */
  runsFrom: number | null;
}

export interface Prediction {
  /** `?predict=0` turns it off: nothing is predicted. */
  enabled: boolean;
  level: LevelMap | null;
  /** The newest snapshot's server tick; `null` until the first one of the round. */
  baseTick: number | null;
  /** The server tick the sim runs from; `null`: it doesn't (pause, results). */
  runsFrom: number | null;
  /**
   * The other players at `tick`, simulated without input from the newest
   * snapshot (only as obstacles), and the managers where it has them.
   */
  others: Player[];
  managers: Obstacle[];
  /** Inputs sent for the base tick or later, sorted by tick. */
  inputs: InputCommand[];
  /** Per player, the newest input below the base tick: what the server repeats. */
  lastAcked: Record<PlayerId, InputCommand | undefined>;
  /** The predicted players are after the ticks below this one ran. */
  tick: number;
  /** This machine's players at `tick`, and at `tick - 1` (to draw between). */
  current: Player[];
  previous: Player[];
  /** Where the drawn player is off its prediction (a correction gliding away), by id. */
  offsets: Record<PlayerId, Vec | undefined>;
  stats: PredictionStats;
}

function emptyStats(): PredictionStats {
  return { reconciles: 0, corrections: 0, snaps: 0, maxErrorTiles: 0, lastErrorTiles: 0 };
}

export function createPrediction(enabled: boolean): Prediction {
  return {
    enabled,
    level: null,
    baseTick: null,
    runsFrom: null,
    others: [],
    managers: [],
    inputs: [],
    lastAcked: {},
    tick: 0,
    current: [],
    previous: [],
    offsets: {},
    stats: emptyStats(),
  };
}

/** A new round (on `level`): forgets everything but whether it's on. */
export function resetPrediction(p: Prediction, level: LevelMap | null): void {
  Object.assign(p, createPrediction(p.enabled), { level });
}

function clonePlayer(player: Player): Player {
  return {
    ...player,
    pos: { ...player.pos },
    vel: { ...player.vel },
    facing: { ...player.facing },
  };
}

/** Whether there is something to draw for this machine's players. */
export function isPredicting(p: Prediction): boolean {
  return p.enabled && p.baseTick !== null && p.current.length > 0;
}

/** Takes in the inputs just sent (stamped). Ones the server already ran are ignored. */
export function recordInputs(p: Prediction, stamped: readonly InputCommand[]): void {
  if (!p.enabled) return;
  for (const input of stamped) {
    if (p.baseTick !== null && input.tick < p.baseTick) continue;
    const copy = { ...input, move: { ...input.move } };
    const same = p.inputs.findIndex((i) => i.tick === input.tick && i.playerId === input.playerId);
    if (same >= 0) {
      p.inputs[same] = copy;
      continue;
    }
    let at = p.inputs.length;
    while (at > 0 && (p.inputs[at - 1]?.tick ?? -Infinity) > input.tick) at--;
    p.inputs.splice(at, 0, copy);
  }
  // A base that never comes (a stalled round) must not let this grow forever.
  const cap = NET_PREDICT_MAX_TICKS * 8;
  if (p.inputs.length > cap) p.inputs.splice(0, p.inputs.length - cap);
}

/** The input the server runs for `id` at tick `t`, as far as this client knows. */
function inputFor(p: Prediction, id: PlayerId, t: number): InputCommand | null {
  let found: InputCommand | null = null;
  for (const input of p.inputs) {
    if (input.tick > t) break;
    if (input.playerId === id) found = input;
  }
  found ??= p.lastAcked[id] ?? null;
  if (!found || t - found.tick > NET_INPUT_REPEAT_TICKS) return null;
  return found;
}

/** One tick of movement for this machine's players, at tick `t`. */
function step(p: Prediction, t: number): void {
  const level = p.level;
  if (!level) return;
  for (const player of p.current) {
    const input = inputFor(p, player.id, t);
    movePlayer(level, player, input?.move, input?.dash);
  }
  // Their inputs are on other machines: they let go.
  for (const other of p.others) movePlayer(level, other);
  const everyone = [...p.current, ...p.others].sort((a, b) => a.id - b.id);
  separatePlayers(level, everyone);
  for (const player of p.current) {
    for (const manager of p.managers) pushOutOfManager(level, player, manager);
  }
}

/**
 * Runs ticks `p.tick` up to (not including) `until`, at most `NET_PREDICT_MAX_TICKS` of them.
 *
 * The replay clones players every tick and `reconcile` filters and clones
 * too. Profiled with 4 local players at 300 ms RTT (18 ticks replayed per
 * snapshot): reconcile + replay ~0.07 ms, ~0.03 ms per frame on average,
 * <0.6 ms worst frame (600 ms RTT: double); the garbage costs a ~0.2 ms
 * scavenge every couple of seconds. Far inside a 16.7 ms frame, so no
 * buffer reuse.
 */
function simulate(p: Prediction, until: number): void {
  const from = Math.max(p.tick, until - NET_PREDICT_MAX_TICKS);
  for (let t = from; t < until; t++) {
    p.previous = p.current.map(clonePlayer);
    // Before the countdown ends the server's sim doesn't run: nobody moves.
    if (p.runsFrom !== null && t >= p.runsFrom) step(p, t);
  }
  p.tick = Math.max(p.tick, until);
}

/**
 * Runs the prediction up to `targetTick` (the tick this frame's input is
 * stamped with, with its fraction): the predicted players are then after
 * that tick ran. Never goes back.
 */
export function advancePrediction(p: Prediction, targetTick: number): void {
  if (!p.enabled || p.baseTick === null || p.runsFrom === null) return;
  const until = Math.floor(targetTick) + 1;
  if (until > p.tick) simulate(p, until);
}

/** Whether this snapshot's events say a local player was knocked about. */
function knocked(events: readonly GameEvent[], local: ReadonlySet<PlayerId>): boolean {
  return events.some(
    (e) =>
      (e.type === 'shoved' && (local.has(e.target) || local.has(e.by))) ||
      (e.type === 'managerBumped' && local.has(e.target)),
  );
}

/**
 * Takes in a snapshot the round kept: the server's word on where this
 * machine's players (`localIds`) were at its tick. The prediction starts
 * again from there and replays the inputs since, to the tick it had reached;
 * how far that moved each player becomes a correction to glide away (or
 * snap).
 */
export function reconcile(
  p: Prediction,
  snap: PredictionSnapshot,
  localIds: readonly PlayerId[],
): void {
  if (!p.enabled || !p.level) return;
  const local = new Set(localIds);
  const before = new Map(p.current.map((pl) => [pl.id, { ...pl.pos }]));
  const hadBase = p.baseTick !== null;
  const reached = p.tick;

  p.stats.reconciles++;
  p.baseTick = snap.serverTick;
  p.runsFrom = snap.runsFrom;
  // Others never dash here: a shove by them is the server's call (it
  // arrives as a correction that snaps).
  p.others = snap.players
    .filter((pl) => !local.has(pl.id))
    .map((pl) => ({ ...clonePlayer(pl), dashTicks: 0 }));
  p.managers = snap.managers.map((m) => ({ pos: { ...m.pos }, facing: { ...m.facing } }));
  const acked = p.inputs.filter((i) => i.tick < snap.serverTick);
  for (const input of acked) p.lastAcked[input.playerId] = input;
  p.inputs = p.inputs.filter((i) => i.tick >= snap.serverTick);

  p.current = snap.players.filter((pl) => local.has(pl.id)).map(clonePlayer);
  p.previous = p.current.map(clonePlayer);
  p.tick = snap.serverTick;
  if (snap.runsFrom !== null && hadBase && reached > snap.serverTick) simulate(p, reached);

  const wasKnocked = knocked(snap.events, local);
  const offsets: Record<PlayerId, Vec | undefined> = {};
  for (const player of p.current) {
    const was = before.get(player.id);
    if (!was) continue;
    const error = { x: was.x - player.pos.x, y: was.y - player.pos.y };
    const size = Math.hypot(error.x, error.y);
    const old = p.offsets[player.id] ?? { x: 0, y: 0 };
    let offset = { x: old.x + error.x, y: old.y + error.y };
    if (size > CORRECTION_EPSILON) {
      p.stats.corrections++;
      p.stats.lastErrorTiles = size;
      p.stats.maxErrorTiles = Math.max(p.stats.maxErrorTiles, size);
    }
    if (wasKnocked || Math.hypot(offset.x, offset.y) > NET_PREDICT_SNAP_DISTANCE) {
      if (size > CORRECTION_EPSILON) p.stats.snaps++;
      offset = { x: 0, y: 0 };
    }
    if (Math.hypot(offset.x, offset.y) >= OFFSET_EPSILON) offsets[player.id] = offset;
  }
  p.offsets = offsets;
}

/** Lets the corrections glide away: `dtMs` of real time passed. */
export function decayCorrections(p: Prediction, dtMs: number): void {
  const keep = Math.exp(-Math.max(0, dtMs) / NET_PREDICT_SMOOTH_MS);
  const offsets: Record<PlayerId, Vec | undefined> = {};
  for (const [id, o] of Object.entries(p.offsets)) {
    if (!o) continue;
    const next = { x: o.x * keep, y: o.y * keep };
    if (Math.hypot(next.x, next.y) >= OFFSET_EPSILON) offsets[Number(id)] = next;
  }
  p.offsets = offsets;
}

/**
 * How far between the predicted players at `tick - 1` and `tick` to draw,
 * for a frame whose input target is `targetTick` (with its fraction).
 */
export function predictionAlpha(p: Prediction, targetTick: number): number {
  return Math.min(1, Math.max(0, targetTick - (p.tick - 1)));
}

/**
 * A local player as drawn: between its last two predicted ticks, plus the
 * correction still gliding away. `null` when not predicted.
 */
export function predictedPlayer(p: Prediction, id: PlayerId, alpha: number): Player | null {
  if (!isPredicting(p)) return null;
  const now = p.current.find((pl) => pl.id === id);
  if (!now) return null;
  const was = p.previous.find((pl) => pl.id === id) ?? now;
  const offset = p.offsets[id] ?? { x: 0, y: 0 };
  return {
    ...clonePlayer(now),
    pos: {
      x: was.pos.x + (now.pos.x - was.pos.x) * alpha + offset.x,
      y: was.pos.y + (now.pos.y - was.pos.y) * alpha + offset.y,
    },
  };
}

/**
 * The server tick a countdown that started at `countdownStartMs` (the room's
 * clock: server tick times the tick length) ends on: the first tick whose
 * flow update finds it over, which is also the round's first sim tick.
 */
export function countdownEndTick(countdownStartMs: number): number {
  let t = Math.max(0, Math.floor((countdownStartMs + COUNTDOWN_MS) / TICK_MS) - 1);
  while (t * TICK_MS - countdownStartMs < COUNTDOWN_MS) t++;
  return t;
}
