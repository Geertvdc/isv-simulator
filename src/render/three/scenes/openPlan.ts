import type { LevelMap } from '../../../sim/level';
import { firstGroup, tileHash } from '../../mapShape';
import { gridToWorld } from '../../projection';
import { tint } from '../kit';
import {
  ashPost,
  bikeRack,
  bottleCage,
  type BlockUnit,
  cardboardBale,
  carriedParcel,
  commercialBin,
  cone,
  corporateShrub,
  courierVan,
  gritBin,
  lampPost,
  leasedHatchback,
  pallet,
  parkBlock,
  parkHedge,
  parkedCar,
  signTotem,
  smokingShelter,
  verjeTree,
  wheelStop,
} from '../setDressing/businessPark';
import { GAME_TITLE } from '../../../sim/content';
import type { SetPiece } from '../setDressing/shared';
import { GROUND_TOPS, shade, slabs } from './ground';
import {
  GROUND,
  type GroundPainter,
  type GroundPatch,
  type Scene,
  type ScenePerson,
  type ScenePiece,
} from './types';

/**
 * The Open Plan Office level's own world (level 1-2, scene `open-plan`):
 * Unit 4 of a tired 1990s business park on the ring road, Monday morning.
 * The block's wall is the level's back wall (Kwik Print and a dental lab
 * carrying on left and right); in front a thin strip of car park with the
 * courier's van backed up to the ship door; the bin store and smoking
 * shelter on the left; parked cars, the verge, the sign and the lamp post on
 * the right. Everything is placed from the level's outline and its ship and
 * inbox tiles, so it fits any open-plan map. Pure data: the models are
 * built by `Surroundings`. See `docs/plan/open-plan-environment.md`.
 */

/** The car park's asphalt, out to the horizon: a pale, cool blue-grey in the morning light. */
export const ASPHALT = 0x767b82;
const LINE = 0xd8d8cc;
const YELLOW = 0xc8b048;
const FLAGS = 0xaeaaa2;
const KERB = 0xbcbab2;
const MULCH = 0x5a4434;
const GRASS = 0x6a7e58;

/** The block's front stands this far behind our back wall: hidden behind it. */
const BLOCK_GAP = 0.06;
/** How far the block runs out past our stretch, each side. */
const BLOCK_RUN = 16;
/** Neighbours' units, out from ours: how wide each is. */
const UNIT_W = 7;
/** In front: the paved walk along the front, the kerb, then the car park. */
const WALK = 0.3;
const KERB_W = 0.1;
/** The van's back stands this far out from the level's edge: past the visible strip. */
const VAN_BACK = 1.32;
/** Half the van's length (`courierVan` is 3.4 long, its middle at its origin). */
const VAN_HALF = 1.7;
/** How far off the door's middle it stands. */
const VAN_OFF = 0.45;
/** Parking bays: this wide, this long. */
const BAY_W = 1.6;
const BAY_L = 3.0;
/** The verge along the right wall. */
const VERGE = 0.85;
/** Scene people hold a carried parcel this far in front and this high. */
const CARRY = { reach: 0.34, lift: 0.52 } as const;

const top = (k: number) => GROUND_TOPS.road + k * 0.004;

/** The scene's own ground: asphalt with bays, paving flags, a kerb, mulch, grass. */
const PAINTERS: Readonly<Record<string, GroundPainter>> = {
  // Asphalt with tar patches and oil spots; lines for bays every BAY_W along `stripes`.
  asphalt: (b, g, salt) => {
    const t = top(0);
    const w = g.x1 - g.x0;
    const d = g.z1 - g.z0;
    b.box(w, t, d, ASPHALT, { at: [(g.x0 + g.x1) / 2, t / 2, (g.z0 + g.z1) / 2] }, 0);
    const n = Math.floor((w * d) / 6);
    for (let i = 0; i < n; i++) {
      const x = g.x0 + shade(i, 1, salt) * w;
      const z = g.z0 + shade(i, 2, salt) * d;
      const s = 0.3 + shade(i, 3, salt) * 0.7;
      if (shade(i, 4, salt) < 0.4)
        b.cylinder(s * 0.45, s * 0.45, 0.003, tint(ASPHALT, -0.12), { at: [x, t + 0.001, z] }, 10);
      else
        b.box(
          s * 1.6,
          0.002,
          s,
          tint(ASPHALT, shade(i, 5, salt) < 0.5 ? -0.07 : 0.06),
          {
            at: [x, t + 0.001, z],
            rot: [0, shade(i, 6, salt), 0],
          },
          0,
        );
    }
  },
  // Bay lines: white lines across the patch every BAY_W, along `stripes` (z: lines run along z).
  bays: (b, g) => {
    const t = top(1);
    const along = g.stripes ?? 'z';
    if (along === 'z') {
      for (let x = g.x0; x <= g.x1 + 0.01; x += BAY_W)
        b.box(0.06, 0.003, g.z1 - g.z0, LINE, { at: [x, t, (g.z0 + g.z1) / 2] }, 0);
    } else {
      for (let z = g.z0; z <= g.z1 + 0.01; z += BAY_W)
        b.box(g.x1 - g.x0, 0.003, 0.06, LINE, { at: [(g.x0 + g.x1) / 2, t, z] }, 0);
    }
  },
  // A painted line along the patch's long edge (an aisle edge).
  line: (b, g) => {
    b.box(
      g.x1 - g.x0,
      0.003,
      g.z1 - g.z0,
      LINE,
      {
        at: [(g.x0 + g.x1) / 2, top(1), (g.z0 + g.z1) / 2],
      },
      0,
    );
  },
  // Yellow hatching: keep clear, in front of a door.
  hatch: (b, g) => {
    const t = top(2);
    const w = g.x1 - g.x0;
    const d = g.z1 - g.z0;
    const cx = (g.x0 + g.x1) / 2;
    const cz = (g.z0 + g.z1) / 2;
    for (const [x, z, ww, dd] of [
      [cx, g.z0 + 0.03, w, 0.05],
      [cx, g.z1 - 0.03, w, 0.05],
      [g.x0 + 0.03, cz, 0.05, d],
      [g.x1 - 0.03, cz, 0.05, d],
    ] as const)
      b.box(ww, 0.003, dd, YELLOW, { at: [x, t, z] }, 0);
    for (let x = g.x0 + 0.2; x < g.x1 - 0.1; x += 0.32)
      b.box(0.05, 0.003, d * 1.1, YELLOW, { at: [x, t, cz], rot: [0, 0.6, 0] }, 0);
  },
  flags: (b, g, salt) => {
    slabs(b, g, GROUND_TOPS.sidewalk, FLAGS, [0.6, 0.6], 0.025, 0.1, salt);
  },
  kerb: (b, g) => {
    const t = GROUND_TOPS.curb;
    b.box(
      g.x1 - g.x0,
      t,
      g.z1 - g.z0,
      KERB,
      {
        at: [(g.x0 + g.x1) / 2, t / 2, (g.z0 + g.z1) / 2],
      },
      0,
    );
  },
  // Bark mulch over the verge, flecked, inside a kerb edge.
  mulch: (b, g, salt) => {
    const t = GROUND_TOPS.soil + 0.01;
    const w = g.x1 - g.x0;
    const d = g.z1 - g.z0;
    b.box(w, t, d, MULCH, { at: [(g.x0 + g.x1) / 2, t / 2, (g.z0 + g.z1) / 2] }, 0);
    const n = Math.floor(w * d * 14);
    for (let i = 0; i < n; i++)
      b.box(
        0.07,
        0.006,
        0.035,
        tint(MULCH, shade(i, 7, salt) < 0.5 ? 0.18 : -0.15),
        {
          at: [g.x0 + shade(i, 8, salt) * w, t + 0.002, g.z0 + shade(i, 9, salt) * d],
          rot: [0, shade(i, 10, salt) * 3, 0],
        },
        0,
      );
  },
  grass: (b, g) => {
    const t = GROUND_TOPS.mown;
    b.box(
      g.x1 - g.x0,
      t,
      g.z1 - g.z0,
      GRASS,
      {
        at: [(g.x0 + g.x1) / 2, t / 2, (g.z0 + g.z1) / 2],
      },
      0,
    );
  },
  // The bin store's concrete pad.
  pad: (b, g, salt) => {
    slabs(b, g, GROUND_TOPS.concrete, 0x9e9a92, [1.2, 1.2], 0.03, 0.12, salt);
  },
};

/** A number from 0 to 1 for point (a, b) with `salt`, stirred so nearby points differ. */
function unit(a: number, b: number, salt: number): number {
  let h = tileHash(Math.round(a * 97) + salt * 7919, Math.round(b * 89) - salt * 31);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}

/** Which edge of the level a tile group sits on. */
function edgeOf(
  map: LevelMap,
  ps: readonly { x: number; y: number }[],
): 'back' | 'front' | 'left' | 'right' {
  const p = ps[0];
  if (!p) return 'front';
  if (p.y === map.height - 1) return 'front';
  if (p.x === map.width - 1) return 'right';
  if (p.x === 0) return 'left';
  if (p.y === 0) return 'back';
  // Inside a notch: the nearest edge.
  const d = { front: map.height - 1 - p.y, right: map.width - 1 - p.x, left: p.x, back: p.y };
  return (Object.entries(d).sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'front') as 'front';
}

/** The scene round `map`: pure and deterministic. */
export function openPlanScene(map: LevelMap): Scene {
  const { width, height } = map;
  const L = -0.5;
  const R = width - 0.5;
  const B = -0.5;
  const F = height - 0.5;
  const ship = firstGroup(map, 'ship');
  const inbox = firstGroup(map, 'inbox');
  const shipEdge = edgeOf(map, ship);
  const mid = (ps: readonly { x: number; y: number }[], k: 'x' | 'y', d: number) =>
    ps.length > 0 ? ps.reduce((s, p) => s + p[k], 0) / ps.length : d;
  const shipX = mid(ship, 'x', (width - 1) / 2);
  const shipZ = mid(ship, 'y', (height - 1) / 2);

  const pieces: ScenePiece[] = [];
  const ground: GroundPatch[] = [];
  const people: ScenePerson[] = [];
  let n = 0;
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
    const bright = 0.92 + unit(i, 1, 3) * 0.1;
    const cool = (unit(i, 2, 5) * 2 - 1) * 0.03;
    pieces.push({
      piece,
      variant: variant % (piece.variants ?? 1),
      at: gridToWorld(x, z, GROUND + lift),
      yaw,
      scale: [size, size, size],
      // A touch cool: the morning light.
      tint: [bright * (1 - cool - 0.02), bright, bright * (1 + cool + 0.02)],
      row,
    });
  };
  const patch = (
    kind: string,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    stripes?: 'x' | 'z',
  ) => ground.push({ kind, x0, x1, z0, z1, ...(stripes ? { stripes } : {}) });

  // ---- The car park everywhere: asphalt out past the frame ----
  patch('asphalt', L - 30, R + 30, B - 0.1, F + 12);

  // ---- Back: the block, its wall right behind ours ----
  const units: BlockUnit[] = [
    { x0: L - BLOCK_RUN, x1: L - UNIT_W * 1.5, kind: 'tyres' },
    { x0: L - UNIT_W * 1.5, x1: L - UNIT_W * 0.8, kind: 'toLet' },
    { x0: L - UNIT_W * 0.8, x1: L, kind: 'print' },
    { x0: L, x1: R, kind: 'ours' },
    { x0: R, x1: R + UNIT_W, kind: 'dental' },
    { x0: R + UNIT_W, x1: R + BLOCK_RUN, kind: 'toLet' },
  ];
  const lobby =
    inbox.length > 0 && inbox.every((p) => p.y === 0)
      ? { x: mid(inbox, 'x', 0), width: inbox.length + 0.1 }
      : undefined;
  put(parkBlock(units, GAME_TITLE.toUpperCase(), lobby), 0, B - BLOCK_GAP, 0, 0, 'far');
  // The paved walk along the block's front, out past our stretch.
  patch('flags', L - BLOCK_RUN, L, B - 0.06, B + 0.7);
  patch('flags', R, R + BLOCK_RUN, B - 0.06, B + 0.7);
  patch('kerb', L - BLOCK_RUN, L - 4.2, B + 0.7, B + 0.8);
  patch('kerb', R + 0.9, R + BLOCK_RUN, B + 0.7, B + 0.8);

  const inboxFront = inbox.length > 0 && edgeOf(map, inbox) === 'front';
  const inboxX = mid(inbox, 'x', 0);
  // ---- Front: the walk, the kerb, the car park strip and the courier's van ----
  patch('flags', L - 4.2, R + 0.9, F, F + WALK);
  patch('kerb', L - 4.2, R + 30, F + WALK, F + WALK + KERB_W);
  const parkZ = F + WALK + KERB_W;
  // The front bays line up on the ship door when it's at the front.
  const bayX0 = (shipEdge === 'front' ? shipX : (width - 1) / 2) - BAY_W / 2;
  const bayStart = bayX0 - Math.ceil((bayX0 - (L - 8)) / BAY_W) * BAY_W;
  patch(
    'bays',
    bayStart,
    bayStart + Math.ceil((R + 8 - bayStart) / BAY_W) * BAY_W,
    parkZ,
    parkZ + BAY_L,
    'z',
  );
  patch('line', L - 30, R + 30, parkZ + BAY_L, parkZ + BAY_L + 0.06);
  for (let x = bayStart + BAY_W / 2, k = 0; x < R + 8; x += BAY_W, k++) {
    if (shipEdge === 'front' && Math.abs(x - shipX) < 0.2) continue;
    // The lobby door on the front (a front-edge inbox) stays clear too.
    if (inboxFront && Math.abs(x - inboxX) < 1.2) continue;
    if (x < L + 1.6 || x > R - 1.6) continue;
    // Clear of the pause hint, bottom centre.
    if (Math.abs(x - (width - 1) / 2) < 2.4) continue;
    put(wheelStop, x, parkZ + 0.32, 0, 0);
  }

  // Where the van stands: its back to the ship door, on whichever edge that is.
  const vanAt: Record<string, [number, number, number]> = {
    // Pulled up a little off the door's middle, away from the pause hint at the bottom centre.
    front: [shipX + Math.sign(shipX - (width - 1) / 2) * VAN_OFF, F + VAN_BACK + VAN_HALF, 0],
    right: [R + VAN_BACK + VAN_HALF, shipZ, Math.PI / 2],
    left: [L - VAN_BACK - VAN_HALF, shipZ, -Math.PI / 2],
    back: [shipX, B - VAN_BACK - VAN_HALF, Math.PI],
  };
  const [vx, vz, vyaw] = vanAt[shipEdge] ?? [shipX, F + VAN_BACK + VAN_HALF, 0];
  put(courierVan, vx, vz, vyaw);
  if (shipEdge === 'front') {
    // Keep clear: hatching in front of the door, a cone by it.
    patch(
      'hatch',
      shipX - (ship.length + 0.2) / 2,
      shipX + (ship.length + 0.2) / 2,
      parkZ + 0.05,
      F + VAN_BACK - 0.08,
    );
    put(cone, shipX + ship.length / 2 + 0.45, parkZ + 0.4, 0);
  }
  if (inboxFront) {
    // Keep clear in front of the lobby door too: the post comes in that way.
    const hw = (inbox.length + 0.2) / 2;
    patch('hatch', inboxX - hw, inboxX + hw, parkZ + 0.05, parkZ + 1.2);
  }
  // The courier: on the side nearest the door, a tile out, a parcel in both hands, heading for the van.
  const courierRight = shipEdge === 'right' || (shipEdge !== 'left' && shipX > (width - 1) / 2);
  const cx = courierRight ? R + 1.05 : L - 1.05;
  const cz = shipEdge === 'front' ? F - 0.45 : shipZ - 1.4;
  const cyaw =
    shipEdge === 'front'
      ? courierRight
        ? -Math.PI / 2 + 0.5
        : Math.PI / 2 - 0.5
      : courierRight
        ? Math.PI / 2
        : -Math.PI / 2;
  people.push({ at: gridToWorld(cx, cz, GROUND), yaw: cyaw, pose: 'carrying' });
  put(
    carriedParcel,
    cx + Math.sin(cyaw) * CARRY.reach,
    cz + Math.cos(cyaw) * CARRY.reach,
    cyaw,
    0,
    'near',
    CARRY.lift,
  );

  // ---- Left: the bin store, the smoking shelter, the bike rack ----
  patch('pad', L - 4.2, L, B + 0.7, B + 2.3);
  put(commercialBin, L - 0.92, B + 1.15, 0.05, 0);
  put(commercialBin, L - 2.15, B + 1.2, -0.08, 1);
  put(commercialBin, L - 3.38, B + 1.1, 0.1, 2);
  put(cardboardBale, L - 0.68, B + 2.0, Math.PI / 2 + 0.1, 1);
  put(cardboardBale, L - 1.45, B + 2.05, 0.2, 0);
  put(pallet, L - 2.55, B + 2.05, -0.1, 1);
  for (let z = B + 0.9, i = 0; z < B + 2.4; z += 1, i++)
    put(parkHedge, L - 4.45, z, Math.PI / 2, i);
  // The smoking shelter, its bench facing the room; the ash post outside it.
  const shelterZ = B + 3.55;
  put(smokingShelter, L - 2.35, shelterZ, 0.12);
  put(ashPost, L - 1.15, shelterZ + 0.45);
  // The print-shop guy on the phone by the ash post; a dental tech with a coffee in the shelter.
  people.push({
    at: gridToWorld(L - 1.45, shelterZ + 1.0, GROUND),
    yaw: Math.PI / 2 + 0.6,
    pose: 'phoning',
  });
  people.push({ at: gridToWorld(L - 2.6, shelterZ + 0.05, GROUND), yaw: 0.4, pose: 'sipping' });
  // The bike rack down the wall, then the left car park.
  put(bikeRack, L - 1.0, shelterZ + 2.4, 0);
  patch('bays', L - 30, L - 1.4, shelterZ + 1.4, F + WALK, 'x');
  put(parkedCar, L - 3.1, shelterZ + 2.2, Math.PI / 2, 0);
  put(gritBin, L - 1.9, shelterZ + 1.25, 0.2);
  // Out past the frame: the hedge round the park, more cars, a tree.
  for (let z = B + 2.6, i = 0; z < F + 6; z += 1, i++)
    put(parkHedge, L - 6.4, z, Math.PI / 2, i, 'far');
  put(parkedCar, L - 5.2, B + 1.6, -Math.PI / 2, 1, 'far');
  put(verjeTree, L - 7.2, B + 4, 0.3, 0, 'far');
  put(lampPost, L - 4.4, B + 4.9, Math.PI, 0, 'far');

  // ---- Right: the verge, the bays with the founders' hatchback, the sign and the lamp ----
  const vx0 = R + 0.05;
  const vx1 = R + VERGE;
  patch('kerb', vx1, vx1 + 0.08, B + 1.3, F + WALK);
  patch('mulch', vx0, vx1, B + 1.3, F + WALK);
  for (let z = B + 1.8, k = 0; z < F - 0.2; z += 1.15, k++) {
    if (k % 3 === 1) continue;
    put(corporateShrub, R + 0.45, z + (unit(k, 0, 21) - 0.5) * 0.2, k * 1.3, k);
  }
  put(verjeTree, R + 0.5, B + 3.0, 0.4, 0);
  put(lampPost, R + 0.45, B + 5.4, 0, 0);
  put(signTotem, R + 0.5, F - 1.3, -Math.PI / 2 + 0.25);
  // The bays: two columns of lines along z, cars nose in to the block or to the verge.
  const bx0 = R + 1.0;
  patch('bays', bx0, bx0 + BAY_W * 4, B + 0.9, B + 0.9 + BAY_L, 'z');
  patch('bays', bx0, bx0 + BAY_W * 4, B + 0.9 + BAY_L + 0.1, B + 0.9 + BAY_L * 2 + 0.1, 'z');
  put(leasedHatchback, bx0 + BAY_W * 0.5, B + 0.9 + BAY_L / 2, Math.PI + 0.03);
  put(parkedCar, bx0 + BAY_W * 1.5, B + 0.9 + BAY_L / 2 + 0.1, Math.PI - 0.04, 0);
  put(parkedCar, bx0 + BAY_W * 2.5, B + 0.9 + BAY_L / 2, Math.PI, 5, 'far');
  put(parkedCar, bx0 + BAY_W * 1.5, B + 1.0 + BAY_L * 1.5, 0.05, 1);
  put(parkedCar, bx0 + BAY_W * 3.5, B + 1.0 + BAY_L * 1.5, -0.03, 3, 'far');
  // Further out: more of the car park, the park's hedge, trees.
  put(parkedCar, bx0 + BAY_W * 4.6, B + 6.5, Math.PI / 2, 2, 'far');
  for (let z = B + 1.2, i = 0; z < F + 6; z += 1, i++)
    put(parkHedge, R + 8.2, z, -Math.PI / 2, i, 'far');
  put(verjeTree, R + 7.4, B + 2.2, 1.1, 1, 'far');
  put(verjeTree, R + 7.6, B + 7.0, 0.2, 0, 'far');
  put(lampPost, R + 5.6, B + 3.5, Math.PI, 0, 'far');

  // The water-cooler bottles by our side door, unless a notch's service yard has them.
  if (!map.tiles.includes('void')) put(bottleCage, R + 0.5, B + 0.75, -0.1);

  // ---- Void tiles inside the outline (a notch in the map): a service yard ----
  const voids = map.tiles.flatMap((t, i) =>
    t === 'void' ? [{ x: i % width, z: Math.floor(i / width) }] : [],
  );
  if (voids.length > 0) {
    const vxs = voids.map((v) => v.x);
    const vzs = voids.map((v) => v.z);
    const x0 = Math.min(...vxs) - 0.5;
    const x1 = Math.max(...vxs) + 0.5;
    const z0 = Math.min(...vzs) - 0.5;
    const z1 = Math.max(...vzs) + 0.5;
    patch('pad', x0, x1, B + 0.7, z1);
    // Pallets and the water-cooler bottles against the block, clear of the room's walls.
    put(pallet, x0 + 0.7, z0 + 0.65, 0.1, 1);
    put(pallet, x0 + 0.75, z0 + 0.62, 0.3, 0, 'near', 0.12);
    put(bottleCage, x0 + 1.9, z0 + 0.6, 0.05);
    put(commercialBin, x1 - 0.85, z0 + 0.7, -0.1, 1);
  }

  return { horizon: ASPHALT, ground, painters: PAINTERS, pieces, people, tufts: [] };
}
