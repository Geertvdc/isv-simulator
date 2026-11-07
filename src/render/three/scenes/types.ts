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
 * How a living prop moves (see `moveAlive` in `Surroundings`), each about
 * the piece's own origin, so build it standing on the ground at its foot:
 * - `breathe`: asleep, a slow breath and now and then a twitch (a dog).
 * - `purr`: the same, slower and softer (a cat).
 * - `spray`: sways with the hand of whoever is `watering` (a hose's spray).
 * - `sway`: rocks gently about its foot, about 2°, in the breeze (a shrub,
 *   a feather flag, a weed, washing).
 * - `blink`: on for half a second, off for half a second (a hazard light,
 *   a beacon); give it a bright tint, as the glow layer isn't kept.
 * - `peck`: dips its head down now and then and turns a little (a bird
 *   pecking at crumbs); face it along +z.
 * - `wisp`: rises, swells and twists (smoke, steam); build it as a small
 *   column of pale puffs.
 * - `bob`: floats up and down a hair (a bird on a roof, a buoy, a float).
 * Living props stay a tile from the room and keep still on low quality.
 */
export type AliveKind = 'breathe' | 'purr' | 'spray' | 'sway' | 'blink' | 'peck' | 'wisp' | 'bob';

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
  /**
   * A small light source (a lit sign's letters, an aviation light, a string
   * bulb): its glow parts keep their full color and bloom on medium and high
   * instead of being dimmed like the rest of the outside. Never for windows
   * or big areas.
   */
  hot?: boolean;
}

/**
 * What a scene person is doing: standing about, talking with their hands,
 * watering with a hose, pushing a mower, on the phone (pacing a little),
 * carrying something in both hands at chest height, sipping from a cup, or
 * smoking (the cigarette raised to the mouth every few seconds).
 */
export type ScenePose =
  'idle' | 'chatting' | 'watering' | 'mowing' | 'phoning' | 'carrying' | 'sipping' | 'smoking';

/** Someone in the scene, standing at `at` facing `yaw`. */
export interface ScenePerson {
  at: Vec3;
  yaw: number;
  pose: ScenePose;
  /** How far their colors fade toward grey (default `SCENE_PERSON_GREY` in `Surroundings`, 0.3). */
  grey?: number;
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
