import type { ModelBuilder } from '../kit';
import type { Vec3 } from '../../projection';
import type { SetPiece } from '../setDressing/shared';

/**
 * What a hand-built scene (`scenes/<id>.ts`, registered in `scenes/index.ts`)
 * hands `Surroundings`: its ground, props and people, as plain data.
 */

/**
 * A ground surface's name. The built-in ones (`lawn`, `mown`, `concrete`,
 * `sidewalk`, `curb`, `road`, `patio`, `soil`, `stone`, `chalk`,
 * `driveway`) are painted by `scenes/ground.ts`; a scene can bring its own
 * with `Scene.painters`.
 */
export type GroundKind = string;

/** A patch of ground: a rectangle in world x and z, of one surface. */
export interface GroundPatch {
  kind: GroundKind;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Which way a lawn's mowing stripes (or a painter's own stripes) run. */
  stripes?: 'x' | 'z';
}

/**
 * Paints one patch of a scene's own ground kind into `b` (see
 * `scenes/ground.ts` for the helpers). `salt` is the patch's index, so two
 * patches of one kind get their own shades.
 */
export type GroundPainter = (b: ModelBuilder, g: GroundPatch, salt: number) => void;

/**
 * How a living prop moves (see `Surroundings`): breathing slowly in its
 * sleep, purring (slower, softer), or swaying with the hand of whoever is
 * `watering` (a hose's spray).
 */
export type AliveKind = 'breathe' | 'purr' | 'spray';

/** One prop in the scene. Near props cast shadows; far ones (the houses, the trees) don't. */
export interface ScenePiece {
  piece: SetPiece;
  variant: number;
  at: Vec3;
  yaw: number;
  scale: [number, number, number];
  tint: [number, number, number];
  row: 'near' | 'far';
  /** A living prop, its own mesh that moves; left out for a still one (merged with the rest). */
  alive?: AliveKind;
}

/**
 * What a scene person is doing: standing about, talking with their hands,
 * watering with a hose, pushing a mower, on the phone (pacing a little),
 * carrying something in both hands at chest height, or sipping from a cup.
 */
export type ScenePose =
  'idle' | 'chatting' | 'watering' | 'mowing' | 'phoning' | 'carrying' | 'sipping';

/** Someone in the scene, standing at `at` facing `yaw`. */
export interface ScenePerson {
  at: Vec3;
  yaw: number;
  pose: ScenePose;
}

/** A level's hand-built world, as data. */
export interface Scene {
  /** The color of the big ground plane under everything, out to the horizon (a lawn, asphalt, cobbles). */
  horizon: number;
  /** Ground surfaces, drawn over the horizon plane in order. */
  ground: GroundPatch[];
  /** The scene's own ground kinds, by name; tried before the built-in ones. */
  painters?: Readonly<Record<string, GroundPainter>>;
  pieces: ScenePiece[];
  people: ScenePerson[];
  /** Tufts of long grass on the lawns: x, z and a size. */
  tufts: [number, number, number][];
}

/** The ground the props stand on (the foot of the level's slab); kept in step with `Surroundings`. */
export const GROUND = -0.463;
/** Scene people are smaller than the players and the office people, so nobody takes them for a player. */
export const SCENE_PERSON_SCALE = 0.88;
