/**
 * Where things stand in the 3D world, in world units (one tile is one unit,
 * see `gridToWorld` in `../projection.ts`). No three.js here, so it can be
 * tested and shared by the 3D views.
 */

import { PLAYER_RADIUS, THROW_RANGE } from '../../sim/balance';
import { type LevelMap, type Tile, getTile } from '../../sim/level';
import type { GameState } from '../../sim/state';
import { QUEUE_TILE, type QueueKind, type Ticket, queuedTickets } from '../../sim/tickets';
import { isFrontWall } from '../mapShape';
import { type Box3, type Vec3, gridToWorld } from '../projection';
import type { RoundView } from '../roundView';

/** Full walls: a little taller than a developer. */
export const WALL_HEIGHT = 1.15;
/** Walls on the camera side are cut down so they never hide what's behind. */
export const FRONT_WALL_HEIGHT = 0.3;
/** Counters and stations: about hip height on a developer. */
export const STATION_HEIGHT = 0.55;
/** A developer's height without the hat. */
export const BODY_HEIGHT = 0.9;
/** How far the level's slab reaches below the floor (the diorama's front face). */
export const SLAB_DEPTH = 0.45;

/** Ticket cards (folders lying flat): size in world units. */
export const CARD_SIZE = { width: 0.42, depth: 0.32, thickness: 0.05 };
/** Queued tickets stack up on their queue; past this many only the count grows. */
export const QUEUE_STACK_MAX = 4;
/** Height of the carried ticket's bottom above the floor: held out in front at chest height. */
export const CARRY_HEIGHT = 0.62;
/** How far in front of the carrier's center the carried ticket floats. */
export const CARRY_REACH = PLAYER_RADIUS + 0.1;
/** Extra height at the top of a throw's arc. */
export const THROW_ARC = 0.5;

/** Height of the block on tile (x, y): 0 for floor and outside the map. */
export function blockHeight(map: LevelMap, x: number, y: number): number {
  const tile = getTile(map, x, y);
  if (tile === null || tile === 'floor') return 0;
  if (tile === 'wall') return isFrontWall(map, x, y) ? FRONT_WALL_HEIGHT : WALL_HEIGHT;
  return STATION_HEIGHT;
}

/** Room over the walls for hats and thrown tickets at the back of the room. */
const BOX_HEADROOM = 0.25;

/** The world box the camera keeps in view: the slab, the floor and everything standing on it. */
export function levelBox(map: LevelMap): Box3 {
  return {
    min: { x: -0.5, y: -SLAB_DEPTH, z: -0.5 },
    max: { x: map.width - 0.5, y: WALL_HEIGHT + BOX_HEADROOM, z: map.height - 0.5 },
  };
}

/** Block heights from the tallest down, for picking. */
const PICK_HEIGHTS = [WALL_HEIGHT, STATION_HEIGHT, FRONT_WALL_HEIGHT];

/**
 * The tile whose top a view ray hits first. `ground(h)` is where the ray
 * crosses height `h` (or `null`); the ray meets higher tops before lower
 * ones, so the first height whose tile is that tall wins, else the floor.
 */
export function pickTile(
  map: LevelMap,
  ground: (height: number) => { x: number; y: number } | null,
): { x: number; y: number } | null {
  for (const h of PICK_HEIGHTS) {
    const g = ground(h);
    if (!g) continue;
    const tile = { x: Math.round(g.x) + 0, y: Math.round(g.y) + 0 };
    if (blockHeight(map, tile.x, tile.y) === h) return tile;
  }
  const g = ground(0);
  return g && { x: Math.round(g.x) + 0, y: Math.round(g.y) + 0 };
}

/** Every tile of kind `tile` on the map. */
export function tilesOf(map: LevelMap, tile: Tile): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) === tile) out.push({ x, y });
    }
  }
  return out;
}

const anchors = new WeakMap<LevelMap, Partial<Record<QueueKind, Vec3 | null>>>();

/** Bottom center of a queue's stack: the middle of the top of its queue tiles. */
export function queueAnchor(map: LevelMap, queue: QueueKind): Vec3 | null {
  let cached = anchors.get(map);
  if (!cached) {
    cached = {};
    anchors.set(map, cached);
  }
  const known = cached[queue];
  if (known !== undefined) return known;
  const anchor = findQueueAnchor(map, queue);
  cached[queue] = anchor;
  return anchor;
}

function findQueueAnchor(map: LevelMap, queue: QueueKind): Vec3 | null {
  const tiles = tilesOf(map, QUEUE_TILE[queue]);
  if (tiles.length === 0) return null;
  const x = tiles.reduce((sum, t) => sum + t.x, 0) / tiles.length;
  const y = tiles.reduce((sum, t) => sum + t.y, 0) / tiles.length;
  return gridToWorld(x, y, STATION_HEIGHT);
}

export interface TicketPlacement {
  /** Bottom center of the card. */
  pos: Vec3;
  /** Turn around the vertical axis, radians (a carried card turns with its carrier). */
  yaw: number;
  visible: boolean;
  carried: boolean;
}

/** Where ticket `ticket` is drawn now, or `null` when it can't be (its carrier or queue is gone). */
export function placeTicket(view: RoundView, ticket: Ticket): TicketPlacement | null {
  const { state } = view;
  const loc = ticket.location;
  switch (loc.kind) {
    case 'queue': {
      const anchor = queueAnchor(state.level, loc.queue);
      if (!anchor) return null;
      const queued = queuedTickets(state, loc.queue);
      const index = queued.indexOf(ticket);
      // The oldest ticket, the one you'd grab next, sits on top.
      const level = Math.min(queued.length, QUEUE_STACK_MAX) - 1;
      const height = Math.max(0, level - Math.min(index, QUEUE_STACK_MAX));
      return {
        pos: { ...anchor, y: anchor.y + height * CARD_SIZE.thickness * 1.2 },
        yaw: ((index % 3) - 1) * 0.12,
        visible: index < QUEUE_STACK_MAX,
        carried: false,
      };
    }
    case 'tile':
      return {
        pos: gridToWorld(loc.x, loc.y, blockHeight(state.level, loc.x, loc.y)),
        yaw: 0,
        visible: true,
        carried: false,
      };
    case 'flying': {
      const flown = Math.hypot(loc.pos.x - loc.from.x, loc.pos.y - loc.from.y);
      const arc = Math.sin(Math.PI * Math.min(1, flown / THROW_RANGE)) * THROW_ARC;
      return {
        pos: gridToWorld(loc.pos.x, loc.pos.y, CARRY_HEIGHT + arc),
        // Spins as it flies.
        yaw: flown * 4,
        visible: true,
        carried: false,
      };
    }
    case 'player': {
      const pos = view.renderPos(loc.playerId);
      const player = state.players.find((p) => p.id === loc.playerId);
      if (!pos || !player) return null;
      const { facing } = player;
      return {
        pos: gridToWorld(
          pos.x + facing.x * CARRY_REACH,
          pos.y + facing.y * CARRY_REACH,
          CARRY_HEIGHT,
        ),
        yaw: facingYaw(facing),
        visible: true,
        carried: true,
      };
    }
  }
}

/**
 * Turn around the vertical axis that makes a model built facing the camera
 * (+z, grid +y) face grid direction `facing`.
 */
export function facingYaw(facing: { x: number; y: number }): number {
  if (facing.x === 0 && facing.y === 0) return 0;
  return Math.atan2(facing.x, facing.y);
}

/** How many tickets wait in each queue, for the count over it. */
export function queueCounts(state: GameState): Record<QueueKind, number> {
  return {
    feature: queuedTickets(state, 'feature').length,
    bug: queuedTickets(state, 'bug').length,
  };
}
