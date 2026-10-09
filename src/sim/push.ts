/**
 * Player vs player collision: overlapping circles push each other apart,
 * softly (`PLAYER_PUSH_STRENGTH` of the overlap per tick), then get pushed
 * back out of walls so a shove never ends up inside one.
 */

import { PLAYER_PUSH_STRENGTH, PLAYER_RADIUS } from './balance';
import type { LevelMap } from './level';
import { resolveCollisions } from './movement';
import type { Player } from './state';

/** Below this, two players count as standing on exactly the same spot. */
const EPSILON = 1e-9;
/** Direction to split players that stand exactly on top of each other. */
const STACKED_SPLIT = { x: 1, y: 0 };

/** Pushes overlapping players apart and out of walls. Mutates the players. */
export function separatePlayers(map: LevelMap, players: readonly Player[]): void {
  const minDist = PLAYER_RADIUS * 2;
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
      const shift = ((minDist - dist) * PLAYER_PUSH_STRENGTH) / 2;
      a.pos.x -= n.x * shift;
      a.pos.y -= n.y * shift;
      b.pos.x += n.x * shift;
      b.pos.y += n.y * shift;
    }
  }
  for (const p of players) resolveCollisions(map, p.pos);
}
