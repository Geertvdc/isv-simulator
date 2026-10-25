/**
 * Player steering and collision against the level's solid tiles.
 *
 * The player is a circle; every solid tile is a unit box centered on its grid
 * point. Movement is applied one axis at a time and each step is followed by
 * pushing the circle out of any box it overlaps, along the shortest way out.
 * Against a flat wall that push is straight back, so diagonal input slides
 * along it; against a box corner it points away from the corner, so the
 * circle rolls around it. A head-on hit that only just clips a corner also
 * gets an explicit sideways nudge (`CORNER_NUDGE`) so it never stops dead.
 */

import {
  CORNER_NUDGE,
  DASH_COOLDOWN_TICKS,
  DASH_SPEED,
  DASH_TICKS,
  CORNER_NUDGE_MAX_SIDE_INPUT,
  DIAGONAL_FACING_GRACE_TICKS,
  DIAGONAL_MIN_SHARE,
  PLAYER_ACCEL,
  PLAYER_DECEL,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  TICKS_PER_SECOND,
  WALL_PROBE,
} from './balance';
import { type LevelMap, getTile, isSolid } from './level';
import type { Player, Vec } from './state';

const DT = 1 / TICKS_PER_SECOND;
/** Push-out passes per step; a circle touches at most a few boxes at once. */
const RESOLVE_PASSES = 4;
/** Below this a vector counts as zero. */
const EPSILON = 1e-9;

type Axis = 'x' | 'y';

function length(v: Vec): number {
  return Math.hypot(v.x, v.y);
}

/** Clamps input to length 1 so diagonal input is never faster than straight input. */
export function clampMove(move: Vec): Vec {
  const len = length(move);
  return len > 1 ? { x: move.x / len, y: move.y / len } : { x: move.x, y: move.y };
}

/** Moves `from` toward `to` by at most `maxStep`. */
function approach(from: Vec, to: Vec, maxStep: number): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxStep) return { x: to.x, y: to.y };
  return { x: from.x + (dx / dist) * maxStep, y: from.y + (dy / dist) * maxStep };
}

function isSolidAt(map: LevelMap, x: number, y: number): boolean {
  return isSolid(getTile(map, x, y));
}

/**
 * How deep a circle at `pos` sits in the box of tile (tx, ty), and the
 * direction to push it out. `null` when they don't overlap.
 */
function penetration(
  pos: Vec,
  tx: number,
  ty: number,
  r: number,
): { depth: number; n: Vec } | null {
  const cx = Math.min(Math.max(pos.x, tx - 0.5), tx + 0.5);
  const cy = Math.min(Math.max(pos.y, ty - 0.5), ty + 0.5);
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist >= r) return null;
  if (dist > EPSILON) return { depth: r - dist, n: { x: dx / dist, y: dy / dist } };

  // Center inside the box: leave by the nearest face.
  const exits = [
    { depth: pos.x - (tx - 0.5) + r, n: { x: -1, y: 0 } },
    { depth: tx + 0.5 - pos.x + r, n: { x: 1, y: 0 } },
    { depth: pos.y - (ty - 0.5) + r, n: { x: 0, y: -1 } },
    { depth: ty + 0.5 - pos.y + r, n: { x: 0, y: 1 } },
  ];
  return exits.reduce((a, b) => (b.depth < a.depth ? b : a));
}

/** Pushes a circle out of every solid tile it overlaps. Mutates `pos`. */
export function resolveCollisions(map: LevelMap, pos: Vec, r: number = PLAYER_RADIUS): void {
  for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
    let moved = false;
    for (let ty = Math.round(pos.y - r); ty <= Math.round(pos.y + r); ty++) {
      for (let tx = Math.round(pos.x - r); tx <= Math.round(pos.x + r); tx++) {
        if (!isSolidAt(map, tx, ty)) continue;
        const hit = penetration(pos, tx, ty, r);
        if (!hit) continue;
        pos.x += hit.n.x * hit.depth;
        pos.y += hit.n.y * hit.depth;
        moved = true;
      }
    }
    if (!moved) return;
  }
}

/** Deepest overlap of a circle at `pos` with any solid tile; 0 when clear. */
export function maxPenetration(map: LevelMap, pos: Vec, r: number = PLAYER_RADIUS): number {
  let deepest = 0;
  for (let ty = Math.round(pos.y - r); ty <= Math.round(pos.y + r); ty++) {
    for (let tx = Math.round(pos.x - r); tx <= Math.round(pos.x + r); tx++) {
      if (!isSolidAt(map, tx, ty)) continue;
      deepest = Math.max(deepest, penetration(pos, tx, ty, r)?.depth ?? 0);
    }
  }
  return deepest;
}

function other(axis: Axis): Axis {
  return axis === 'x' ? 'y' : 'x';
}

/** Moves `pos` along one axis by `delta`, then pushes it out of walls. */
function moveAxis(map: LevelMap, pos: Vec, axis: Axis, delta: number): void {
  pos[axis] += delta;
  resolveCollisions(map, pos);
}

/**
 * When the player is blocked moving along `axis` in direction `dir`, finds the
 * closest lane (row or column) that is open ahead and within `CORNER_NUDGE`
 * of fitting, and slides toward it. Returns whether it nudged.
 */
function nudgeAroundCorner(
  map: LevelMap,
  pos: Vec,
  axis: Axis,
  dir: number,
  maxStep: number,
): boolean {
  const side = other(axis);
  const free = 0.5 - PLAYER_RADIUS;
  const ahead = Math.round(pos[axis] + dir * (PLAYER_RADIUS + 0.01));
  const here = Math.round(pos[axis]);
  const tileAt = (along: number, lane: number): boolean =>
    axis === 'x' ? isSolidAt(map, along, lane) : isSolidAt(map, lane, along);

  let best: { lane: number; shift: number } | null = null;
  const center = Math.round(pos[side]);
  for (const lane of [center - 1, center, center + 1]) {
    if (tileAt(ahead, lane) || tileAt(here, lane)) continue;
    const shift = Math.max(0, Math.abs(pos[side] - lane) - free);
    if (shift <= EPSILON || shift > CORNER_NUDGE) continue;
    if (!best || shift < best.shift) best = { lane, shift };
  }
  if (!best) return false;

  const step = Math.min(best.shift, maxStep) * Math.sign(best.lane - pos[side]);
  moveAxis(map, pos, side, step);
  return true;
}

/**
 * Drops the parts of target velocity `target` that push into a wall the
 * player at `pos` touches, while the input also steers along the other axis.
 * Collision would eat that part every tick anyway, and `approach` shares
 * one acceleration budget between the axes: spent on the wall, a diagonal
 * that grazed a corner would crawl back up to speed along it. Head-on input
 * is left alone so it still reaches `nudgeAroundCorner`. Mutates `target`.
 */
function steerAlongWalls(map: LevelMap, pos: Vec, move: Vec, target: Vec): void {
  const here = maxPenetration(map, pos);
  const deepening = (axis: Axis): number => {
    const dir = Math.sign(target[axis]);
    if (dir === 0 || Math.abs(move[other(axis)]) < CORNER_NUDGE_MAX_SIDE_INPUT) return 0;
    const probe = { x: pos.x, y: pos.y };
    probe[axis] += dir * WALL_PROBE;
    return maxPenetration(map, probe) - here;
  };
  const dx = deepening('x');
  const dy = deepening('y');
  // Deeper by over half the probe: the wall faces this axis more than the other.
  // On a box corner both may: drop only the worse one, so the player rolls round it.
  const blocked = (d: number): boolean => d > WALL_PROBE / 2;
  if (blocked(dx) && dx >= dy) target.x = 0;
  else if (blocked(dy)) target.y = 0;
}

/**
 * Turns the player to face along `move` (non-zero). A diagonal facing
 * holds for `DIAGONAL_FACING_GRACE_TICKS` while the input drops to one of
 * its two directions, so letting go of two keys a tick or two apart
 * doesn't snap the player round as they stop. Mutates the player.
 */
function steerFacing(player: Player, move: Vec): void {
  const len = length(move);
  const dir = { x: move.x / len, y: move.y / len };
  if (Math.min(Math.abs(dir.x), Math.abs(dir.y)) >= DIAGONAL_MIN_SHARE) {
    player.sinceDiagonal = 0;
    player.facing = dir;
    return;
  }
  player.sinceDiagonal = Math.min(player.sinceDiagonal + 1, DIAGONAL_FACING_GRACE_TICKS + 1);
  const along = dir.x * player.facing.x + dir.y * player.facing.y;
  const holding = player.sinceDiagonal <= DIAGONAL_FACING_GRACE_TICKS && along > 0.5;
  if (!holding) player.facing = dir;
}

export function isDashing(player: Player): boolean {
  return player.dashTicks > 0;
}

/**
 * Starts a dash along the move direction, or along the facing direction
 * without input. Returns whether it started: not while cooling down.
 */
export function startDash(player: Player, rawMove: Vec): boolean {
  if (player.dashCooldown > 0) return false;
  const move = clampMove(rawMove);
  const len = length(move);
  if (len > EPSILON) player.facing = { x: move.x / len, y: move.y / len };
  player.dashTicks = DASH_TICKS;
  player.dashCooldown = DASH_COOLDOWN_TICKS;
  return true;
}

/**
 * Advances one player by one tick. Mutates the player. While dashing the
 * player shoots along their facing at `DASH_SPEED` and can't steer; after
 * the dash they slow back down to walking speed.
 */
export function stepPlayer(map: LevelMap, player: Player, rawMove: Vec): void {
  const move = clampMove(rawMove);
  const moving = length(move) > EPSILON;
  if (player.dashCooldown > 0) player.dashCooldown--;
  if (isDashing(player)) {
    player.dashTicks--;
    player.vel = { x: player.facing.x * DASH_SPEED, y: player.facing.y * DASH_SPEED };
  } else {
    const target = { x: move.x * PLAYER_MAX_SPEED, y: move.y * PLAYER_MAX_SPEED };
    if (moving) steerAlongWalls(map, player.pos, move, target);
    player.vel = approach(player.vel, target, (moving ? PLAYER_ACCEL : PLAYER_DECEL) * DT);
    if (moving) steerFacing(player, move);
    // Standing still ends the grace: the next input faces wherever it says.
    else player.sinceDiagonal = DIAGONAL_FACING_GRACE_TICKS + 1;
  }

  const pos = player.pos;
  for (const axis of ['x', 'y'] as const) {
    const delta = player.vel[axis] * DT;
    if (Math.abs(delta) <= EPSILON) continue;
    const before = pos[axis];
    moveAxis(map, pos, axis, delta);
    const moved = pos[axis] - before;
    // Hitting a wall eats the speed along that axis, so you don't stay glued to it.
    player.vel[axis] = moved / DT;

    const blocked = Math.abs(moved) < Math.abs(delta) * 0.5;
    if (blocked && Math.abs(move[other(axis)]) < CORNER_NUDGE_MAX_SIDE_INPUT) {
      nudgeAroundCorner(map, pos, axis, Math.sign(delta), PLAYER_MAX_SPEED * DT);
    }
  }
}

const NO_MOVE: Vec = { x: 0, y: 0 };

/**
 * One player's movement for one tick, as `tick` runs it: a dash starts on the
 * press of dash (it went from up to down since the last tick), then the
 * player steps. Mutates the player. Returns whether a dash started.
 * Client-side prediction runs this same function for the local players.
 */
export function movePlayer(
  map: LevelMap,
  player: Player,
  move: Vec = NO_MOVE,
  dash = false,
): boolean {
  const dashPressed = dash && !player.dashHeld;
  player.dashHeld = dash;
  const dashed = dashPressed && startDash(player, move);
  stepPlayer(map, player, move);
  return dashed;
}
