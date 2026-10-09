/**
 * Player vs player collision: overlapping circles push each other apart,
 * softly (`PLAYER_PUSH_STRENGTH` of the overlap per tick), then get pushed
 * back out of walls so a shove never ends up inside one. A dashing player
 * who runs into someone standing knocks them away hard and stops dashing.
 */

import { DASH_SHOVE_SPEED, PLAYER_PUSH_STRENGTH, PLAYER_RADIUS } from './balance';
import type { LevelMap } from './level';
import { isDashing, resolveCollisions } from './movement';
import type { Player, PlayerId } from './state';

/** A dashing player knocked someone away. */
export interface Shove {
  by: PlayerId;
  target: PlayerId;
}

/** Below this, two players count as standing on exactly the same spot. */
const EPSILON = 1e-9;
/** Direction to split players that stand exactly on top of each other. */
const STACKED_SPLIT = { x: 1, y: 0 };

/** Pushes overlapping players apart and out of walls. Mutates the players. Returns the shoves. */
export function separatePlayers(map: LevelMap, players: readonly Player[]): Shove[] {
  const minDist = PLAYER_RADIUS * 2;
  const shoves: Shove[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (!a || !b) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= minDist) continue;
      const n = dist > EPSILON ? { x: dx / dist, y: dy / dist } : STACKED_SPLIT;
      if (isDashing(a) !== isDashing(b)) {
        // `n` points from a to b; flip it when b is the one dashing.
        const [by, target, sign] = isDashing(a) ? [a, b, 1] : [b, a, -1];
        shove(by, target, { x: n.x * sign, y: n.y * sign }, minDist - dist);
        shoves.push({ by: by.id, target: target.id });
        continue;
      }
      const shift = ((minDist - dist) * PLAYER_PUSH_STRENGTH) / 2;
      a.pos.x -= n.x * shift;
      a.pos.y -= n.y * shift;
      b.pos.x += n.x * shift;
      b.pos.y += n.y * shift;
    }
  }
  for (const p of players) resolveCollisions(map, p.pos);
  return shoves;
}

/** `by` knocks `target` along `dir` (unit) out of the overlap, and stops dead: bonk. */
function shove(by: Player, target: Player, dir: { x: number; y: number }, overlap: number): void {
  target.pos.x += dir.x * overlap;
  target.pos.y += dir.y * overlap;
  target.vel = { x: dir.x * DASH_SHOVE_SPEED, y: dir.y * DASH_SHOVE_SPEED };
  by.dashTicks = 0;
  by.vel = { x: 0, y: 0 };
}
