import type { LevelMap } from '../../../sim/level';
import { firstGroup, tileHash } from '../../mapShape';
import { garageRoom } from '../garageRoom';
import { type Vec3, gridToWorld } from '../../projection';
import { bushes, hoop, kennel, shed, tires, tree } from '../setDressing/garage';
import type { SetPiece } from '../setDressing/shared';
import {
  acUnit,
  bbq,
  boxStack,
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
  monitorStack,
  mower,
  overflowingBin,
  parcels,
  pizzaPile,
  rainBarrel,
  sideGate,
  sprinkler,
  tarpLump,
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
  | 'chalk'
  | 'driveway';

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

export type ScenePose = 'idle' | 'chatting' | 'watering' | 'mowing';

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
/** The house's front stands this far behind the garage's back wall: hidden behind it, so no lawn shows between. */
const HOUSE_GAP = 0.06;
/** The neighbour's house is set back this far from our back wall line. */
const NEIGHBOUR_BACK = 1;
/** The side yard runs from the garage's left wall out to the hedge. */
const HEDGE_OUT = 4;
/** The fence on the right, between our strip and the neighbour's garden. */
const FENCE_OUT = 1.25;
/**
 * The family car on the side pad: its middle this far behind the level's
 * front, so the whole car stands above the player legend (bottom left), and
 * this far out from the left wall. Nose in toward the house, turned a little:
 * parked in a hurry.
 */
const CAR_BACK = 3.4;
const CAR_OUT = 1.3;
const CAR_TURN = 0.21;
/** Half the car's footprint, turned, along z: where it starts and ends. */
const CAR_HALF = 1.35;
/** How high the car's roof is, for the cat. */
const CAR_ROOF = 0.98;
/** In front: the driveway apron, then the sidewalk, the curb and the road, all shallow so the road shows. */
const APRON = 0.12;
const SIDEWALK = 0.34;
const CURB = 0.12;
/** Scene people are smaller than the players and the office people, so nobody takes them for a player. */
export const SCENE_PERSON_SCALE = 0.88;
/** Someone pushing the mower stands this far behind it, holding its handle. */
const MOWER_REACH = 1.02;
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
  const shipXs = ship.map((p) => p.x);
  const shipX0 = ship.length > 0 ? Math.min(...shipXs) : (width - 1) / 2;
  const shipX1 = ship.length > 0 ? Math.max(...shipXs) : (width - 1) / 2;
  const inboxX = inbox.length > 0 ? (inbox[0]?.x ?? 0) : 2;

  const pieces: ScenePiece[] = [];
  const ground: GroundPatch[] = [];
  const people: ScenePerson[] = [];
  let n = 0;
  /** Puts `piece` with its center at (x, z), on the ground or `lift` above it, `size` times its size. */
  const put = (
    piece: SetPiece,
    x: number,
    z: number,
    yaw = 0,
    variant = 0,
    row: ScenePiece['row'] = 'near',
    lift = 0,
    size = 1,
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
      scale: [size, size, size],
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
  const stone = (x: number, z: number, r = 0.18) => patch('stone', x - r, x + r, z - r, z + r);

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
  // The house model's front is its origin: it stands flush behind the back wall.
  put(
    house(houseW, HOUSE_DEPTH, 0, windows, door, hall),
    houseX0 + houseW / 2,
    B - HOUSE_GAP,
    0,
    0,
    'far',
  );

  // ---- Left: the side yard, from the garage wall out to the hedge ----
  const hedgeX = L - HEDGE_OUT;
  // The car's place first: the yard is what's left behind it.
  const carZ = F - CAR_BACK;
  const carX = L - CAR_OUT;
  const yardZ1 = carZ - CAR_HALF;
  const padZ0 = yardZ1 - 0.45;
  /** Whether something reaching to z + `reach` still fits in the yard, behind the car. */
  const fits = (z: number, reach = 0.5) => z + reach < yardZ1;
  // The hedge down the property line, from the back fence to the sidewalk.
  for (let z = B + 0.5, i = 0; z < F + APRON; z += 1, i++)
    put(hedge, hedgeX, z, Math.PI / 2, i, 'near');
  // The back fence with the side gate, from the hedge to the house's corner.
  put(sideGate, hedgeX + 1.05, B - 0.05, 0, 0, 'near');
  for (let x = hedgeX + 2.05; x < houseX0 + 0.4; x += 1) put(fence, x, B - 0.05, 0, 1, 'near');
  // By the back door: the downpipe's rain barrel, the hose reel by the gate.
  put(rainBarrel, houseX0 + 0.25, B + 0.35);
  put(hoseReel, hedgeX + 2.1, B + 0.5, 0.4);
  // Everything piled up against the garage's outside wall: parcels, the bins (bin day was
  // last week, pizza boxes spilling out), the founders' unpacked boxes, old monitors, a
  // tarp over the old sofa, tyres. Tight to the wall, so the lawn beyond is open.
  put(parcels, L - 0.42, B + 0.4, 0.3, 1);
  put(overflowingBin, L - 0.36, B + 1.05, 0.15, 0);
  put(overflowingBin, L - 0.36, B + 1.66, -0.1, 1);
  put(pizzaPile, L - 0.98, B + 1.3, 0.4, 1);
  put(pizzaPile, L - 0.9, B + 0.62, -0.3, 0);
  if (fits(B + 2.4)) put(boxStack, L - 0.4, B + 2.35, Math.PI / 2, 1);
  if (fits(B + 3.05)) put(monitorStack, L - 0.5, B + 3.0, Math.PI / 2 - 0.2, 1);
  if (fits(B + 2.8)) put(tarpLump, L - 0.98, B + 2.75, Math.PI / 2 + 0.15);
  if (fits(B + 3.7, 0.3)) put(tires, L - 0.45, B + 3.68, 0.3, 2);
  if (fits(B + 3.55, 0.3)) put(boxStack, L - 1.0, B + 3.5, 1.2, 2);
  // Mowing the lawn, pushing away from the wall: the far side's still long.
  const mowerZ = Math.min(B + 3.75, yardZ1 - 0.75);
  const mowerX = L - 1.5 - MOWER_REACH;
  const mowYaw = -Math.PI / 2 + 0.3;
  put(mower, mowerX, mowerZ, mowYaw);
  people.push({
    at: gridToWorld(
      mowerX - Math.sin(mowYaw) * MOWER_REACH,
      mowerZ - Math.cos(mowYaw) * MOWER_REACH,
      GROUND,
    ),
    yaw: mowYaw,
    pose: 'mowing',
  });
  // The gardening kit by the hedge, a gnome keeping watch, Mom's washing out in the sun.
  if (fits(mowerZ + 0.75)) put(wheelbarrow, hedgeX + 0.75, mowerZ + 0.75, 0.5);
  put(gnome, hedgeX + 0.62, B + 1.25, 0.5, 0, 'near', 0, 1.4);
  if (yardZ1 - B > 4.5) put(washingLine, hedgeX + 1.55, B + 2.05, 0.3, 0, 'far');
  // Stepping stones from the gate to the back door, then the lawn: mown up to the mower's row.
  stone(hedgeX + 1.15, B + 0.55);
  stone(hedgeX + 1.45, B + 1.05);
  stone(hedgeX + 1.95, B + 1.25);
  patch('mown', hedgeX + 0.4, L, B, mowerZ + 0.3, 'x');
  // Beyond the hedge, the other neighbour's trees.
  put(tree, hedgeX - 1.6, B + 0.8, 0.4, 0, 'far');
  put(bushes, hedgeX - 0.9, B + 2.6, 0, 3, 'far');
  put(tree, hedgeX - 1.8, Math.max(B + 3.4, padZ0), 1.1, 1, 'far');
  // Behind the gate, the back garden: Mom's shed and the big tree.
  put(shed, houseX0 - 1.1, B - 1.6, 0.15, 0, 'far');
  put(tree, hedgeX - 0.6, B - 2.2, 0.8, 3, 'far');

  // ---- Left front: the family car, evicted to the pad, the cat on its roof ----
  patch('concrete', hedgeX + 0.5, L, padZ0, F + APRON);
  put(familyCar, carX, carZ, Math.PI + CAR_TURN, 0);
  put(catLoaf, carX + 0.12, carZ + 0.1, 2.3, 0, 'near', CAR_ROOF);
  // The hoop against the hedge, facing the pad, the ball under the car.
  put(hoop, hedgeX + 0.75, padZ0 + 0.6, Math.PI / 2 - 0.25, 0);
  put(bushes, hedgeX + 0.85, F - 0.6, 0.3, 1);

  // ---- Front: the driveway apron, the sidewalk, the curb and the street ----
  // The apron runs across both garage doors: the open one and the closed one beside it.
  const doors = [...shipXs, ...garageRoom(map).door.map((p) => p.x)];
  const apronX1 = Math.min(R, (doors.length > 0 ? Math.max(...doors) : shipX1) + 1.2);
  patch('concrete', L, apronX1, F, F + APRON);
  patch('mown', apronX1, R + FENCE_OUT, F, F + APRON, 'x');
  const s0 = F + APRON;
  const s1 = s0 + SIDEWALK;
  const road = s1 + CURB;
  // The driveway from the open door straight down to the street, over a dropped curb.
  const drive0 = shipX0 - 0.65;
  const drive1 = shipX1 + 0.65;
  patch('sidewalk', L - 30, R + 30, s0, s1);
  patch('driveway', drive0, drive1, F, road);
  patch('curb', L - 30, drive0, s1, road);
  patch('curb', drive1, R + 30, s1, road);
  patch('road', L - 30, R + 30, road, road + 8);
  // Chalk on the sidewalk: a hopscotch, left of the driveway, clear of the score.
  const chalkX1 = drive0 - 0.3;
  const chalkX0 = Math.max(L + 1.6, chalkX1 - 1.6);
  if (chalkX1 - chalkX0 > 0.8) patch('chalk', chalkX0, chalkX1, s0 + 0.04, s1 - 0.04);
  // The mailbox at the curb on the right, the hydrant just left of the timer.
  put(mailbox, R - 2.2, s1 - 0.13, -0.12);
  put(hydrant, R - 0.35, s1 - 0.14, 0.4);

  // ---- Right: our narrow strip, the fence, the neighbour's garden ----
  const fenceX = R + FENCE_OUT;
  put(rainBarrel, houseX1 - 0.3, B + 0.35);
  // The AC unit humming for the servers inside, boxes and old monitors piled by it; then
  // a clear strip of lawn, and a bush by the front.
  put(acUnit, R + 0.6, B + 1.0, 0.15);
  // Out from the wall far enough that its top doesn't hide them.
  put(boxStack, R + 0.7, B + 1.75, -Math.PI / 2, 0);
  put(monitorStack, R + 0.68, B + 2.45, -Math.PI / 2 + 0.25, 0);
  put(bushes, R + 0.6, F - 1.1, 0.4, 0);
  patch('mown', R, fenceX, B, F, 'z');
  for (let z = B - 2.5, i = 0; z < F + APRON - 0.3; z += 1, i++)
    put(fence, fenceX, z, -Math.PI / 2, 0, 'near');
  // The neighbour's: a tidy striped lawn, a flower bed along the fence, the kennel, a tree.
  patch('mown', fenceX, R + 12, B - NEIGHBOUR_BACK, F + APRON, 'z');
  for (let z = B + 2.2, i = 0; z < F - 0.6; z += 1, i++)
    put(flowerBed, fenceX + 0.5, z, -Math.PI / 2, i, 'near');
  patch('soil', fenceX + 0.12, fenceX + 0.9, B + 1.6, Math.max(B + 2.2, F - 1.1));
  put(gnome, fenceX + 0.62, Math.max(B + 2.2, F - 0.85), -0.5, 0, 'near', 0, 1.5);
  put(kennel, fenceX + 1.0, B + 0.55, -0.35, 0);
  put(dog, fenceX + 1.25, B + 1.3, 0.6);
  put(tree, fenceX + 3.4, B + 0.4, 0.3, 0, 'far');
  put(lounger, fenceX + 2.3, B + 2.0, -0.5);
  // A path of stepping stones from the lounger down to the front.
  for (let k = 0, z = B + 3.0; z < F - 0.2; k++, z += 0.6)
    stone(fenceX + 2.25 + Math.sin(k * 0.8) * 0.22, z, 0.17);
  // A tree at the front corner, out to the side where it hides nothing.
  put(tree, fenceX + 0.95, F - 0.3, 0.9, 3, 'far');
  put(sprinkler, fenceX + 3.2, Math.max(B + 3.2, F - 2.4), 0);
  put(toys, fenceX + 1.6, F - 0.4, 0.7, 1);
  // The neighbour's house, set back.
  put(house(10, HOUSE_DEPTH, 1, [1.6, 4.4]), fenceX + 0.7 + 5, B - NEIGHBOUR_BACK, 0, 0, 'far');
  patch('patio', fenceX + 0.7, fenceX + 4, B - NEIGHBOUR_BACK, B - 0.1);
  // Watering the flowers, hose arcing over them.
  const waterZ = Math.min(B + 3.6, F - 1.6);
  people.push({
    at: gridToWorld(fenceX + 1.3, waterZ, GROUND),
    yaw: -Math.PI / 2,
    pose: 'watering',
  });
  put(hoseSpray, fenceX + 1.3, waterZ, -Math.PI / 2, 0, 'far');

  // ---- Void tiles inside the outline (a notch in the map): a little patio ----
  const voids = map.tiles.flatMap((t, i) =>
    t === 'void' ? [{ x: i % width, z: Math.floor(i / width) }] : [],
  );
  for (const v of voids) patch('patio', v.x - 0.5, v.x + 0.5, v.z - 0.5, v.z + 0.5);
  const corner = [...voids].sort((a, b) => a.z - b.z || b.x - a.x)[0];
  if (corner) put(bbq, corner.x, corner.z - 0.1, 0.3);

  return {
    ground,
    pieces,
    people,
    tufts: tufts(map, ground, pieces, { x0: hedgeX, x1: L, z0: mowerZ + 0.3, z1: yardZ1 }),
  };
}

/**
 * Tufts of long grass, on a jittered grid over the lawns: never on paving,
 * the slab or under a prop. Thick in `long`, the bit the mower hasn't done yet.
 */
function tufts(
  map: LevelMap,
  ground: readonly GroundPatch[],
  pieces: readonly ScenePiece[],
  long: { x0: number; x1: number; z0: number; z1: number },
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
      const unmown = x < long.x1 && x > long.x0 && z > long.z0 && z < long.z1;
      if (unit(gx, gz, 17) > (unmown ? TUFT_KEEP_LONG : TUFT_KEEP)) continue;
      out.push([x, z, (unmown ? 1.3 : 0.8) + unit(gx, gz, 19) * 0.5]);
    }
  }
  return out;
}
