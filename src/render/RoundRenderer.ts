import type Phaser from 'phaser';
import type { HintId } from '../flow/hints';
import type { LevelMap } from '../sim/level';
import type { GameEvent } from '../sim/orders';
import type { MapLook } from './MapRenderer';
import type { Point } from './projection';
import type { RoundView } from './roundView';

/** One frame of a round, for whatever draws it. */
export interface RoundFrame {
  view: RoundView;
  /** Events from the ticks run this frame (none while paused). */
  events: readonly GameEvent[];
  /** First-level hints still open, and whether they show right now. */
  hints: readonly HintId[];
  hintsVisible: boolean;
  /** Scene time in ms. */
  timeMs: number;
}

/**
 * What `GameScene` asks of the thing that draws the level and the round on
 * it: the 2D Phaser renderers (`PhaserRoundRenderer`) or the 3D one
 * (`?render=3d`, `src/render/three/`). One is made per scene start, for one
 * level map; the scene's shutdown cleans it up.
 */
export interface RoundRenderer {
  /** Draws the round from `frame`: players, tickets, stations, effects, hints, target highlights. */
  syncRound(frame: RoundFrame): void;
  /** Runs every frame, in a round or not, after `syncRound`. */
  render(timeMs: number, deltaMs: number): void;
  setShake(enabled: boolean): void;
  /** Debug mode: tile labels, free camera where the renderer has one. */
  setDebug(enabled: boolean): void;
  /** The tile under canvas point (sx, sy) on the floor, which may lie outside the map. */
  tileAt(sx: number, sy: number): Point;
  /** Outlines the hovered tile, or nothing. */
  setHover(tile: Point | null): void;
}

export type RoundRendererFactory = (
  scene: Phaser.Scene,
  map: LevelMap,
  look: MapLook,
) => RoundRenderer;
