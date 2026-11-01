import type { LevelMap } from '../../../sim/level';
import { firstGroup, tileHash } from '../../mapShape';
import { garageRoom } from '../garageRoom';
import { type Vec3, gridToWorld } from '../../projection';
import { bike, bins, bushes, hoop, kennel, oldPCs, shed, tires, tree } from '../setDressing/garage';
import type { SetPiece } from '../setDressing/shared';
import {
  acUnit,
  bbq,
  catLoaf,
  dog,
  familyCar,
  fence,
  flowerBed,
  gnome,
  hedge,
  hoseReel,
  hoseSpray,
  house,
  hydrant,
  lounger,
  mailbox,
  mower,
  overflowingBin,
  parcels,
  pizzaPile,
  rainBarrel,
  sideGate,
  sprinkler,
  toys,
  washingLine,
  wheelbarrow,
} from '../setDressing/suburb';

/**
 * The garage level's own world (the garage environment pass): Mom's house
 * behind the garage, the driveway, sidewalk and street in front, the side
 * yard on the left and the neighbour's garden on the right. Everything is
 * placed from the level's outline (its left, right, back and front edges)
 * and its ship and inbox tiles, so it fits any garage map. Pure data: the
 * models are built by `Surroundings`.
 *
 * Read from the camera: the back of the level is the top of the screen, the
 * front (+z) the bottom. Only low things stand in front of the level.
 */

export type GroundKind =
  | 'lawn'
  | 'mown'
  | 'concrete'
  | 'sidewalk'
  | 'curb'
  | 'road'
  | 'patio'
  | 'soil'
  | 'stone'
  | 'chalk';

/** A patch of ground: a rectangle in world x and z, of one surface. */
export interface GroundPatch {
  kind: GroundKind;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Which way a lawn's mowing stripes run. */
  stripes?: 'x' | 'z';
}

/** One prop in the scene. Near props cast shadows; far ones (the houses, the trees) don't. */
export interface ScenePiece {
  piece: SetPiece;
  variant: number;
  at: Vec3;
  yaw: number;
  scale: [number, number, number];
  tint: [number, number, number];
  row: 'near' | 'far';
}

export type ScenePose = 'idle' | 'chatting' | 'watering';

/** Someone in the scene, standing at `at` facing `yaw`. */
export interface ScenePerson {
  at: Vec3;
  yaw: number;
  pose: ScenePose;
}

export interface Scene {
  /** Ground surfaces, drawn over a lawn that runs out to the horizon. */
  ground: GroundPatch[];
  pieces: ScenePiece[];
  people: ScenePerson[];
  /** Tufts of long grass on the lawns: x, z and a size. */
  tufts: [number, number, number][];
}

/** The ground the props stand on (the foot of the level's slab); kept in step with `Surroundings`. */
const GROUND = -0.463;
/** How far the house runs out past the garage's left wall, and back from its front. */
const HOUSE_LEFT = 2;
const HOUSE_DEPTH = 4.2;
/** The side yard runs from the garage's left wall out to the hedge. */
const HEDGE_OUT = 4;
/** The fence on the right, between our strip and the neighbour's garden. */
const FENCE_OUT = 1.25;
/** The parking pad on the left, in front of the side yard, reaches this far back from the front. */
const PAD_DEPTH = 3.7;
/** In front: the driveway apron, then the sidewalk, the curb and the road. */
const APRON = 0.3;
const SIDEWALK = 0.75;
const CURB = 0.12;
/** Long grass every so often, more where nobody mowed. */
const TUFT_STEP = 0.5;
const TUFT_KEEP = 0.3;
const TUFT_KEEP_LONG = 0.75;

/** A number from 0 to 1 for point (a, b) with `salt`, stirred so nearby points differ. */
function unit(a: number, b: number, salt: number): number {
  let h = tileHash(Math.round(a * 97) + salt * 7919, Math.round(b * 89) - salt * 31);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}

/** The scene round `map`: pure and deterministic. */
export function garageScene(map: LevelMap): Scene {
  const { width, height } = map;
  const L = -0.5;
  const R = width - 0.5;
  const B = -0.5;
  const F = height - 0.5;
  const ship = firstGroup(map, 'ship');
  const inbox = firstGroup(map, 'inbox');
  const shipX1 = ship.length > 0 ? Math.max(...ship.map((p) => p.x)) : (width - 1) / 2;
  const inboxX = inbox.length > 0 ? (inbox[0]?.x ?? 0) : 2;

  const pieces: ScenePiece[] = [];
  const ground: GroundPatch[] = [];
  const people: ScenePerson[] = [];
  let n = 0;
  /** Puts `piece` with its center at (x, z), on the ground or `lift` above it. */
  const put = (
    piece: SetPiece,
    x: number,
    z: number,
    yaw = 0,
    variant = 0,
    row: ScenePiece['row'] = 'near',
    lift = 0,
  ) => {
    const i = n++;
    // A slight brightness and warmth change per prop, so repeats don't match.
    const bright = 0.92 + unit(i, 1, 3) * 0.12;
    const warm = (unit(i, 2, 5) * 2 - 1) * 0.05;
    pieces.push({
      piece,
      variant: variant % (piece.variants ?? 1),
      at: gridToWorld(x, z, GROUND + lift),
      yaw,
      scale: [1, 1, 1],
      tint: [bright * (1 + warm), bright, bright * (1 - warm)],
      row,
    });
  };
  const patch = (
    kind: GroundKind,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    stripes?: 'x' | 'z',
  ) => ground.push({ kind, x0, x1, z0, z1, ...(stripes ? { stripes } : {}) });

  // ---- Back: Mom's house, its wall right behind the garage's back wall ----
  const houseX0 = L - HOUSE_LEFT;
  const houseX1 = R + 0.6;
  const houseW = houseX1 - houseX0;
  // Windows above the garage, evenly spread, and clear of the hallway behind the inbox door.
  const count = Math.max(2, Math.round((R - L) / 3.4));
  const windows = Array.from({ length: count }, (_, k) => {
    const x = L + ((k + 0.5) * (R - L)) / count;
    const off = x - inboxX;
    const clear = Math.abs(off) < 1.15 ? inboxX + (off < 0 ? -1.15 : 1.15) : x;
    return clear - houseX0;
  });
  const door = HOUSE_LEFT / 2 + 0.1;
  // The garage's house door opens into a hallway cut into the house behind the inbox.
  const hall = inbox.length > 0 && (inbox[0]?.y ?? 1) === 0 ? inboxX - houseX0 : undefined;
  put(
    house(houseW, HOUSE_DEPTH, 0, windows, door, hall),
    houseX0 + houseW / 2,
    B - 0.02 - HOUSE_DEPTH / 2,
    0,
    0,
    'far',
  );

  // ---- Left: the side yard, from the garage wall out to the hedge ----
  const hedgeX = L - HEDGE_OUT;
  const padZ0 = Math.max(B + 3, F - PAD_DEPTH);
  // The hedge down the property line, from the back fence to the sidewalk.
  for (let z = B + 0.5, i = 0; z < F + APRON; z += 1, i++)
    put(hedge, hedgeX, z, Math.PI / 2, i, 'near');
  // The back fence with the side gate, from the hedge to the house's corner.
  put(sideGate, hedgeX + 1.05, B - 0.05, 0, 0, 'near');
  for (let x = hedgeX + 2.05; x < houseX0 + 0.4; x += 1) put(fence, x, B - 0.05, 0, 1, 'near');
  // By the back door: the downpipe's rain barrel, parcels on the step, the hose by the gate.
  put(rainBarrel, houseX0 + 0.25, B + 0.35);
  put(parcels, L - 0.45, B + 0.42, 0.3, 1);
  put(hoseReel, hedgeX + 2.1, B + 0.5, 0.4);
  // Bin day was last week: the bins against the garage wall, pizza boxes everywhere.
  put(overflowingBin, L - 0.36, B + 1.15, 0.15, 0);
  put(overflowingBin, L - 0.36, B + 1.78, -0.1, 1);
  put(pizzaPile, L - 1.05, B + 1.45, 0.4, 1);
  put(bins, hedgeX + 0.95, B + 1.3, 1.2, 2);
  // A bike against the wall and the mower, parked halfway through the lawn.
  const yardZ1 = padZ0;
  put(tires, L - 0.4, B + 2.45, 0.3, 1);
  const bikeZ = B + 3.2;
  if (bikeZ + 0.5 < yardZ1) put(bike, L - 0.5, bikeZ, Math.PI / 2 - 0.15, 1);
  const mowerZ = Math.min(yardZ1 - 0.7, (bikeZ + yardZ1) / 2 + 0.2);
  put(mower, L - 2.1, mowerZ, Math.PI + 0.25);
  put(gnome, hedgeX + 0.65, B + 2.4, 0.5);
  put(wheelbarrow, L - 2.85, mowerZ - 0.35, -0.6);
  // Mom's washing line, out in the sun.
  if (yardZ1 - B > 4.5) put(washingLine, hedgeX + 1.5, B + 3.3, 0.3, 0, 'far');
  put(toys, L - 1.3, yardZ1 - 0.35, 0, 0);
  // Stepping stones from the gate to the back door, then the lawn: mown at the back, long beyond the mower.
  [
    [hedgeX + 1.15, B + 0.55],
    [hedgeX + 1.45, B + 1.05],
    [hedgeX + 1.95, B + 1.25],
  ].forEach(([x, z]) =>
    patch('stone', (x ?? 0) - 0.2, (x ?? 0) + 0.2, (z ?? 0) - 0.16, (z ?? 0) + 0.16),
  );
  patch('mown', hedgeX + 0.4, L, B, mowerZ - 0.1, 'z');
  // Beyond the hedge, the other neighbour's trees.
  put(tree, hedgeX - 1.6, B + 0.8, 0.4, 0, 'far');
  put(bushes, hedgeX - 0.9, B + 2.6, 0, 3, 'far');
  put(tree, hedgeX - 1.8, Math.max(B + 3.4, padZ0), 1.1, 1, 'far');
  // Behind the gate, the back garden: Mom's shed and the big tree.
  put(shed, houseX0 - 1.1, B - 1.6, 0.15, 0, 'far');
  put(tree, hedgeX - 0.6, B - 2.2, 0.8, 3, 'far');

  // ---- Left front: the family car, evicted to the pad, the cat on its roof ----
  patch('concrete', hedgeX + 0.5, L, padZ0, F + APRON);
  const carX = L - 1.15;
  const carZ = Math.max(padZ0 + 1.35, F - 1.8);
  put(familyCar, carX, carZ, -0.04, 0);
  put(catLoaf, carX + 0.1, carZ - 0.55, 0.9, 0, 'near', 1.04);
  put(bushes, hedgeX + 0.85, padZ0 + 0.45, 0.3, 1);
  // The hoop at the back of the pad, facing it.
  put(hoop, hedgeX + 0.9, padZ0 + 0.1, 0.25, 0);

  // ---- Front: the driveway apron, the sidewalk, the curb and the street ----
  // The apron runs across both garage doors: the open one and the closed one beside it.
  const doors = [...ship.map((p) => p.x), ...garageRoom(map).door.map((p) => p.x)];
  const apronX1 = Math.min(R, (doors.length > 0 ? Math.max(...doors) : shipX1) + 1.2);
  patch('concrete', L, apronX1, F, F + APRON);
  patch('mown', apronX1, R + FENCE_OUT, F, F + APRON, 'x');
  const s0 = F + APRON;
  const s1 = s0 + SIDEWALK;
  patch('sidewalk', L - 30, R + 30, s0, s1);
  patch('curb', L - 30, R + 30, s1, s1 + CURB);
  patch('road', L - 30, R + 30, s1 + CURB, s1 + 8);
  // Chalk on the sidewalk: a hopscotch, right of the door.
  const chalkX = Math.min(R - 1.4, apronX1 + 0.6);
  patch('chalk', chalkX, chalkX + 1.6, s0 + 0.12, s1 - 0.12);
  put(mailbox, L - 0.95, s1 - 0.2, 0.08);
  put(hydrant, R + 0.85, s1 - 0.25);

  // ---- Right: our narrow strip, the fence, the neighbour's garden ----
  const fenceX = R + FENCE_OUT;
  put(rainBarrel, houseX1 - 0.3, B + 0.35);
  put(acUnit, R + 0.6, B + 1.15, 0.15);
  put(oldPCs, R + 0.5, (B + F) / 2 + 0.3, -1.2, 1);
  put(bushes, R + 0.6, F - 1.1, 0.4, 0);
  patch('mown', R, fenceX, B, F, 'z');
  for (let z = B - 2.5, i = 0; z < F + APRON - 0.3; z += 1, i++)
    put(fence, fenceX, z, -Math.PI / 2, 0, 'near');
  // The neighbour's: a tidy striped lawn, a flower bed along the fence, the kennel, a tree.
  patch('mown', fenceX, R + 12, B - 1.2, F + APRON, 'z');
  for (let z = B + 2.2, i = 0; z < F - 0.6; z += 1, i++)
    put(flowerBed, fenceX + 0.5, z, -Math.PI / 2, i, 'near');
  patch('soil', fenceX + 0.12, fenceX + 0.9, B + 1.6, Math.max(B + 2.2, F - 1.1));
  put(kennel, fenceX + 1.0, B + 0.55, -0.35, 0);
  put(dog, fenceX + 1.25, B + 1.3, 0.6);
  put(tree, fenceX + 3.4, B + 0.4, 0.3, 0, 'far');
  put(lounger, fenceX + 2.05, B + 2.0, -0.5);
  // A tree at the front corner, out to the side where it hides nothing.
  put(tree, fenceX + 0.95, F - 0.3, 0.9, 3, 'far');
  put(sprinkler, fenceX + 2.1, F - 1.6, 0);
  put(toys, fenceX + 1.6, F - 0.4, 0.7, 1);
  // The neighbour's house, set further back.
  put(
    house(10, HOUSE_DEPTH, 1, [1.6, 4.4]),
    fenceX + 0.7 + 5,
    B - 1.2 - HOUSE_DEPTH / 2,
    0,
    0,
    'far',
  );
  patch('patio', fenceX + 0.7, fenceX + 4, B - 1.2, B - 0.2);
  // Watering the flowers, hose arcing over them.
  const waterZ = Math.min(B + 3.6, F - 1.6);
  people.push({
    at: gridToWorld(fenceX + 1.3, waterZ, GROUND),
    yaw: -Math.PI / 2,
    pose: 'watering',
  });
  put(hoseSpray, fenceX + 1.3, waterZ, -Math.PI / 2, 0, 'far');
  // Mom by the bins, on about the pizza boxes again.
  people.push({
    at: gridToWorld(L - 1.55, B + 2.05, GROUND),
    yaw: Math.PI / 2 - 0.5,
    pose: 'chatting',
  });

  // ---- Void tiles inside the outline (a notch in the map): a little patio ----
  const voids = map.tiles.flatMap((t, i) =>
    t === 'void' ? [{ x: i % width, z: Math.floor(i / width) }] : [],
  );
  for (const v of voids) patch('patio', v.x - 0.5, v.x + 0.5, v.z - 0.5, v.z + 0.5);
  const corner = [...voids].sort((a, b) => a.z - b.z || b.x - a.x)[0];
  if (corner) put(bbq, corner.x, corner.z - 0.1, 0.3);

  return { ground, pieces, people, tufts: tufts(map, ground, pieces, mowerZ, L, hedgeX) };
}

/**
 * Tufts of long grass, on a jittered grid over the lawns: never on paving,
 * the slab or under a prop. Thick past the mower, where the lawn's not done.
 */
function tufts(
  map: LevelMap,
  ground: readonly GroundPatch[],
  pieces: readonly ScenePiece[],
  mowerZ: number,
  L: number,
  hedgeX: number,
): [number, number, number][] {
  const { width, height } = map;
  const out: [number, number, number][] = [];
  const paved = ground.filter((g) => g.kind !== 'mown' && g.kind !== 'lawn');
  const inside = (g: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) =>
    x > g.x0 - 0.1 && x < g.x1 + 0.1 && z > g.z0 - 0.1 && z < g.z1 + 0.1;
  for (let gx = -8; gx < width + 8; gx += TUFT_STEP) {
    for (let gz = -1; gz < height + 0.5; gz += TUFT_STEP) {
      const x = gx + (unit(gx, gz, 11) - 0.5) * TUFT_STEP;
      const z = gz + (unit(gx, gz, 13) - 0.5) * TUFT_STEP;
      // Nowhere on or right by the level's slab.
      if (x > -0.7 && x < width - 0.3 && z > -0.7 && z < height - 0.3) continue;
      if (paved.some((g) => inside(g, x, z))) continue;
      if (pieces.some((p) => Math.hypot(p.at.x - x, p.at.z - z) < 0.45)) continue;
      const long = x < L && x > hedgeX && z > mowerZ;
      if (unit(gx, gz, 17) > (long ? TUFT_KEEP_LONG : TUFT_KEEP)) continue;
      out.push([x, z, (long ? 1.3 : 0.8) + unit(gx, gz, 19) * 0.5]);
    }
  }
  return out;
}
