import * as THREE from 'three';
import { type WallPiece, tileHash } from '../../mapShape';
import { type Model, ModelBuilder, type Place, tint } from '../kit';
import { FRONT_WALL_HEIGHT, SLAB_DEPTH, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, WALL_COLORS } from '../look';
import type { CounterRun } from '../rooms/counterRun';
import {
  CURTAIN_LOOKS,
  PARTITION_LOOKS,
  partitionSwap,
  solidSwap,
  THRESHOLD_FLOORS,
  TOWER_PENDANT_HALF,
  TOWER_WEAR,
  TOWER_WEAR_KINDS,
  type ThresholdFloor,
  type TowerArt,
  type MeetingPiece,
  curtainSwap,
  pierSwap,
  screenSwap,
  sillSwap,
  vinylPx,
} from '../rooms/towerRoom';
import type { StationModel } from '../stationModels';
import { framed, text } from './basement';

/**
 * YOTTA Tower's high floor (wall theme `tower`, floor theme `towerFloors`;
 * see `docs/plan/back-to-back-environment.md`), built in code: HQ glass
 * partitions on a pale plinth (a cool glass core behind clear panes, a
 * frosted manifestation band with a violet dot line, slim brushed-aluminium
 * mullions, a slim cool head track) and glass screens on the low ones; the
 * unitised curtain wall where the outside is (a dark spandrel under an
 * aluminium sill board, deep anodised mullions, sky-tinted vision glass
 * with sun-faded roller blinds half down, a transom) cut down to a sill on
 * the front, pale cladding piers where art hangs; the offices' deep slate
 * broadloom with a violet fleck and its wear, each meeting room's calmer
 * carpet, the corridor's pale terrazzo with zinc strips and a walk line,
 * thresholds in the doorways; smoked-oak counters on a charcoal plinth; the
 * stakeholder request portal over the inbox; the release hatch and THE BIG
 * RED BUTTON at the ship; what hangs on the walls (THE PLAN under a picture
 * light, the room directory, the thermostat at 29°C, a clock, booking
 * screens), the rooms' names in vinyl, the glass door portals, The
 * Garage's and Mom's own pieces and the slim linear pendants.
 */

/** `a` mixed `t` of the way toward `b`, per channel. */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * t) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

/** A face of a tile-sized block: where along it `u`, at height `y`, sits on it, and its turn. */
type Face = (u: number, y: number) => Place;
/** The four faces of a block `half` out from its middle: front, back, left, right. */
function faces(half: number): Face[] {
  return [
    (u, y) => ({ at: [u, y, half], rot: [0, 0, 0] }),
    (u, y) => ({ at: [-u, y, -half], rot: [0, Math.PI, 0] }),
    (u, y) => ({ at: [-half, y, u], rot: [0, -Math.PI / 2, 0] }),
    (u, y) => ({ at: [half, y, -u], rot: [0, Math.PI / 2, 0] }),
  ];
}

// ---- Materials ----

/** Brushed aluminium (frames, mullions, sill boards) and its darker edge. */
export const ALU = 0xb0b7be;
const ALU_DARK = 0x858d95;
/** Dark anodised aluminium: the curtain wall's mullions and head. */
export const ANODISED = 0x5c646d;
/** The partitions' pale plinth, a shade under white. */
export const PLINTH = 0xd3d6d8;
/** The partitions' cool glass core (the far side seen through two panes), never a bright slab. */
export const PARTITION_CORE = 0x8b9fae;
const PANE = 0xdbe7ee;
const FROST = 0xcdd4da;
/** The manifestation's violet dots. */
export const DOT_VIOLET = 0x7a64c4;
export const YOTTA_VIOLET = 0x6a4cc0;
/** The curtain wall: sky-tinted vision glass, the spandrel under it, the blinds' sun-faded fabric. */
export const CURTAIN_CORE = 0x6f8596;
export const SPANDREL = 0x525b66;
export const BLIND = 0xd6d0c2;
const BLIND_BAR = 0x8f949a;
/** The caps: the head track's infill seen from above (partitions), the curtain wall's head, the sill's top. */
export const PARTITION_CAP = WALL_COLORS.tower.top;
export const CURTAIN_CAP = 0x6b747d;
/** The curtain wall's glazing seen from above, catching the pale sky: cool, still under every station top. */
export const CURTAIN_SKY = 0x778b9a;
/** A partition's glass seen from above: paler, frostier than the curtain wall's. */
export const PARTITION_SKY = 0x8396a4;
export const SILL_CAP = 0x727b84;
/** The cladding of the piers between the curtain wall's units. */
const PIER = 0xc4c8cb;
const PAPER = 0xefeee8;
const INK = 0x24272c;
const SCREEN_NAVY = 0x15213a;
const STEEL = 0xa3abb2;
const STEEL_DARK = 0x5f676f;
const WHITE_VINYL = 0xf1f2f4;

// ---- The partitions ----

const PLINTH_H = 0.09;
const SHOE_H = 0.03;
const GLASS0 = PLINTH_H + SHOE_H;
const HEAD_H = 0.04;
const GLASS1 = WALL_HEIGHT - HEAD_H;
/** The manifestation band's height on a full partition (about eye height for a developer). */
const MANIFEST_Y = 0.66;

/**
 * The head track over a wall `h` tall: an aluminium lip round it a little
 * proud of the faces and the cap's infill flush in it (`cap`), so from
 * above a run reads as a slim frame round a cool grey, never a pale slab.
 */
function headTrack(b: ModelBuilder, h: number, cap: number, lip = ALU, lipH = 0.03): void {
  b.box(1.02, lipH, 1.02, lip, { at: [0, h - 0.004 - lipH / 2, 0] }, 0);
  b.box(1.016, 0.005, 1.016, tint(lip, -0.45), { at: [0, h - 0.004 - lipH - 0.0025, 0] }, 0);
  b.box(1.0, 0.012, 1.0, cap, { at: [0, h - 0.006, 0] }, 0);
}

/**
 * A wall's top seen from above as glass, not a slab: the glazing either
 * side of the wall line catching the pale sky (`sky`), the head along the
 * line's middle (`line`) and a mullion's cap across at the unit's joint.
 */
function glassTop(b: ModelBuilder, h: number, along: 'x' | 'z', sky: number, line: number): void {
  const t = framed(b, [0, h, 0], [0, along === 'z' ? Math.PI / 2 : 0, 0]);
  for (const z of [-0.25, 0.25]) t.box(0.98, 0.003, 0.36, sky, { at: [0, 0.0005, z] }, 0);
  t.box(1.0, 0.012, 0.07, line, { at: [0, 0.004, 0] }, 0);
  t.box(1.0, 0.003, 0.02, tint(line, 0.3), { at: [0, 0.011, 0] }, 0);
  t.box(0.05, 0.01, 1.0, line, { at: [-0.49, 0.003, 0] }, 0);
}

/** The frosted manifestation band on a face (`on`), its violet dot line, at height `y`. */
function manifestation(b: ModelBuilder, on: Face, y: number, w = 0.96, dots = 12): void {
  b.box(w, 0.07, 0.004, FROST, on(0, y), 0);
  b.box(w, 0.012, 0.004, FROST, on(0, y - 0.07), 0);
  for (let k = 0; k < dots; k++) {
    const u = -w / 2 + (w / dots) * (k + 0.5);
    b.box(0.024, 0.024, 0.005, DOT_VIOLET, on(u, y), 0);
  }
}

/** The pale plinth under a wall `h0` tall, its shadow gap and aluminium shoe. */
function plinth(b: ModelBuilder, top = PLINTH_H): void {
  b.box(1.012, top, 1.012, PLINTH, { at: [0, top / 2, 0] }, 0);
  b.box(1.004, 0.012, 1.004, tint(PLINTH, -0.5), { at: [0, 0.006, 0] }, 0);
  b.box(1.016, SHOE_H, 1.016, ALU_DARK, { at: [0, top + SHOE_H / 2, 0] }, 0);
}

/**
 * A full glass partition: the pale plinth and its aluminium shoe, the cool
 * glass core behind clear panes, a slim mullion at each face's −u end (so
 * a run reads framed every tile), the frosted manifestation band with its
 * violet dots, a glint on one look in three, under the slim head track.
 */
function partitionModel(look: number, along: 'x' | 'z' | null): Model {
  const b = new ModelBuilder();
  plinth(b);
  b.box(0.96, GLASS1 - GLASS0, 0.96, PARTITION_CORE, { at: [0, (GLASS0 + GLASS1) / 2, 0] }, 0);
  const outer = faces(0.506);
  const inner = faces(0.484);
  outer.forEach((on, f) => {
    b.box(0.024, GLASS1 - GLASS0, 0.014, ALU, on(-0.488, (GLASS0 + GLASS1) / 2), 0);
    manifestation(b, inner[f] ?? on, MANIFEST_Y);
    if (look === 2) {
      const g = (inner[f] ?? on)(0.16 * (f % 2 ? -1 : 1), 0.78);
      b.box(
        0.035,
        0.5,
        0.003,
        tint(PARTITION_CORE, 0.18),
        {
          at: g.at,
          rot: [0, g.rot?.[1] ?? 0, 0.6],
        },
        0,
      );
    }
  });
  for (const on of faces(0.5))
    b.pane(1, GLASS1 - GLASS0, 0.006, PANE, on(0, (GLASS0 + GLASS1) / 2));
  headTrack(b, WALL_HEIGHT, PARTITION_CAP);
  if (along) glassTop(b, WALL_HEIGHT, along, PARTITION_SKY, ALU);
  return b.build();
}

/**
 * A low partition with a frameless glass screen on top along `along`: the
 * pale plinth wall under its head track, an aluminium shoe and top channel
 * holding the glass, its frosted band and dots near the top, a slim post
 * at its −u end. The rooms read as glass boxes without hiding anyone.
 */
export const SCREEN_H = 0.4;
function screenModel(along: 'x' | 'z', look: number): Model {
  const b = new ModelBuilder();
  lowPlinth(b);
  const y0 = FRONT_WALL_HEIGHT;
  const g = framed(b, [0, 0, 0], [0, along === 'z' ? Math.PI / 2 : 0, 0]);
  g.box(1.0, 0.03, 0.05, ALU, { at: [0, y0 + 0.015, 0] }, 0.006);
  g.pane(1.0, SCREEN_H, 0.012, PANE, { at: [0, y0 + 0.03 + SCREEN_H / 2, 0] });
  g.box(1.0, 0.016, 0.026, ALU, { at: [0, y0 + 0.03 + SCREEN_H + 0.008, 0] }, 0.004);
  g.box(0.02, SCREEN_H, 0.03, ALU, { at: [-0.49, y0 + 0.03 + SCREEN_H / 2, 0] }, 0);
  const band = y0 + 0.03 + SCREEN_H * 0.86;
  for (const z of [0.008, -0.008]) {
    g.box(1.0, 0.03, 0.003, FROST, { at: [0, band, z] }, 0);
    for (let k = 0; k < 6; k++)
      g.box(0.022, 0.016, 0.004, DOT_VIOLET, { at: [-0.42 + k * 0.168, band, z * 1.2] }, 0);
  }
  if (look === 2)
    g.box(
      0.03,
      SCREEN_H * 0.8,
      0.014,
      tint(PANE, -0.25),
      {
        at: [0.18, y0 + 0.03 + SCREEN_H / 2, 0],
        rot: [0, 0, 0.6],
      },
      0,
    );
  return b.build();
}

/** The low partition's body: the pale plinth up to the front wall height under the head track. */
function lowPlinth(b: ModelBuilder): void {
  const h = FRONT_WALL_HEIGHT;
  b.box(1.0, h - 0.03, 1.0, PLINTH, { at: [0, (h - 0.03) / 2, 0] }, 0);
  b.box(1.004, 0.012, 1.004, tint(PLINTH, -0.5), { at: [0, 0.006, 0] }, 0);
  b.box(1.012, 0.022, 1.012, ALU_DARK, { at: [0, 0.07, 0] }, 0);
  headTrack(b, h, PARTITION_CAP, ALU, 0.024);
}

/** A wall in the theme's own look: a full glass partition, or a low one (left plain: the plan gives every low one its screen). */
export function towerWallModel(piece: WallPiece, look: number): Model {
  if (piece === 'wall-front') {
    const b = new ModelBuilder();
    lowPlinth(b);
    return b.build();
  }
  return partitionModel(look, null);
}

/**
 * A solid partition panel where art hangs: frosted glass gone opaque, a
 * pale panel on the plinth with a slim frame at its corners and a shadow
 * joint, under the same head track.
 */
function solidModel(along: 'x' | 'z'): Model {
  const b = new ModelBuilder();
  plinth(b);
  b.box(
    0.98,
    GLASS1 - GLASS0,
    0.98,
    mix(FROST, PLINTH, 0.5),
    { at: [0, (GLASS0 + GLASS1) / 2, 0] },
    0,
  );
  faces(0.5).forEach((on, f) => {
    b.box(0.024, GLASS1 - GLASS0, 0.012, ALU, on(-0.488, (GLASS0 + GLASS1) / 2), 0);
    b.box(
      0.006,
      GLASS1 - GLASS0 - 0.04,
      0.004,
      tint(FROST, -0.12),
      on(f % 2 ? 0.3 : -0.26, (GLASS0 + GLASS1) / 2),
      0,
    );
  });
  headTrack(b, WALL_HEIGHT, PARTITION_CAP);
  glassTop(b, WALL_HEIGHT, along, mix(PARTITION_SKY, FROST, 0.4), ALU);
  return b.build();
}

// ---- The curtain wall ----

const SPANDREL_H = 0.26;
const SILL_BOARD = 0.022;
const TRANSOM_Y = 0.92;
/** How far down each look's blinds come, from the head. */
const BLIND_DOWN = [0.38, 0.5, 0.3] as const;

/**
 * A unit of the curtain wall, full height: the dark spandrel under an
 * aluminium sill board, sky-tinted vision glass behind clear panes, a
 * transom near the top, deep anodised mullions standing proud at each
 * face's −u end, sun-faded roller blinds half down (each look its own
 * drop) with their bottom bar, under the dark anodised head.
 */
function curtainModel(look: number, along: 'x' | 'z'): Model {
  const b = new ModelBuilder();
  const top = WALL_HEIGHT - HEAD_H;
  b.box(1.0, SPANDREL_H, 1.0, SPANDREL, { at: [0, SPANDREL_H / 2, 0] }, 0);
  b.box(1.006, 0.014, 1.006, tint(SPANDREL, -0.4), { at: [0, 0.007, 0] }, 0);
  b.box(1.02, SILL_BOARD, 1.02, ALU, { at: [0, SPANDREL_H + SILL_BOARD / 2, 0] }, 0);
  const g0 = SPANDREL_H + SILL_BOARD;
  b.box(0.95, top - g0, 0.95, CURTAIN_CORE, { at: [0, (g0 + top) / 2, 0] }, 0);
  const drop = BLIND_DOWN[look % BLIND_DOWN.length] ?? 0.4;
  faces(0.5).forEach((on, f) => {
    // The spandrel's panel joint and its fixings.
    b.box(
      0.008,
      SPANDREL_H - 0.04,
      0.004,
      tint(SPANDREL, -0.3),
      on(0.1 * (f % 2 ? 1 : -1), SPANDREL_H / 2),
      0,
    );
    for (const u of [-0.3, 0.3])
      b.box(0.016, 0.016, 0.005, tint(SPANDREL, 0.25), on(u, SPANDREL_H - 0.05), 0);
    // Deep mullion, standing proud of the face.
    b.box(0.06, WALL_HEIGHT - 0.01, 0.05, ANODISED, on(-0.47, (WALL_HEIGHT - 0.01) / 2), 0);
    b.box(
      0.012,
      WALL_HEIGHT - 0.04,
      0.052,
      tint(ANODISED, 0.25),
      on(-0.452, (WALL_HEIGHT - 0.04) / 2),
      0,
    );
    // The transom.
    b.box(0.96, 0.024, 0.02, ANODISED, on(0, TRANSOM_Y), 0);
  });
  for (const on of faces(0.5)) b.pane(1, top - g0, 0.006, PANE, on(0, (g0 + top) / 2));
  // The blinds, inside the glass, and their cassette under the head.
  faces(0.508).forEach((on) => {
    b.box(0.9, 0.03, 0.02, BLIND_BAR, on(0.02, top - 0.015), 0);
    b.box(0.88, drop, 0.004, BLIND, on(0.02, top - 0.03 - drop / 2), 0);
    for (let k = 1; k < 4; k++)
      b.box(0.88, 0.003, 0.005, tint(BLIND, -0.06), on(0.02, top - 0.03 - (drop * k) / 4), 0);
    b.box(0.9, 0.016, 0.012, BLIND_BAR, on(0.02, top - 0.03 - drop - 0.008), 0);
    b.box(0.012, 0.012, 0.012, BLIND_BAR, on(0.32, top - 0.03 - drop - 0.03), 0);
  });
  headTrack(b, WALL_HEIGHT, CURTAIN_CAP, ANODISED, 0.04);
  glassTop(b, WALL_HEIGHT, along, CURTAIN_SKY, ANODISED);
  return b.build();
}

/**
 * The curtain wall cut down on the front: its spandrel under the
 * aluminium sill board and the dark head, the deep mullions' stubs standing
 * a little proud of the top, a panel joint per look.
 */
function sillModel(look: number, along: 'x' | 'z'): Model {
  const b = new ModelBuilder();
  const h = FRONT_WALL_HEIGHT;
  b.box(1.0, h - 0.03, 1.0, SPANDREL, { at: [0, (h - 0.03) / 2, 0] }, 0);
  b.box(1.006, 0.012, 1.006, tint(SPANDREL, -0.4), { at: [0, 0.006, 0] }, 0);
  faces(0.5).forEach((on, f) => {
    b.box(
      0.008,
      h - 0.06,
      0.004,
      tint(SPANDREL, -0.3),
      on(((look + f) % 3) * 0.2 - 0.2, (h - 0.03) / 2),
      0,
    );
    b.box(0.06, h + 0.05, 0.05, ANODISED, on(-0.47, (h + 0.05) / 2), 0);
    b.box(0.012, h + 0.03, 0.052, tint(ANODISED, 0.25), on(-0.452, (h + 0.03) / 2), 0);
    b.box(0.96, 0.012, 0.006, tint(SPANDREL, 0.18), on(0, h * 0.45), 0);
  });
  headTrack(b, h, SILL_CAP, ALU, 0.024);
  glassTop(b, h, along, CURTAIN_SKY, ANODISED);
  return b.build();
}

/**
 * A pier between the curtain wall's units where art hangs: pale cladding
 * full height on the dark spandrel's line, shadow gaps, the curtain wall's
 * head.
 */
function pierModel(look: number): Model {
  const b = new ModelBuilder();
  b.box(1.0, 0.06, 1.0, SPANDREL, { at: [0, 0.03, 0] }, 0);
  b.box(0.99, WALL_HEIGHT - 0.1, 0.99, PIER, { at: [0, 0.06 + (WALL_HEIGHT - 0.1) / 2, 0] }, 0);
  faces(0.497).forEach((on, f) => {
    b.box(0.96, 0.006, 0.004, tint(PIER, -0.16), on(0, 0.42 + 0.1 * ((look + f) % 2)), 0);
    b.box(0.006, WALL_HEIGHT - 0.12, 0.004, tint(PIER, -0.12), on(0.47, WALL_HEIGHT / 2), 0);
    b.box(0.006, WALL_HEIGHT - 0.12, 0.004, tint(PIER, -0.12), on(-0.47, WALL_HEIGHT / 2), 0);
  });
  headTrack(b, WALL_HEIGHT, CURTAIN_CAP, ANODISED, 0.04);
  return b.build();
}

/** Every wall swap model, by its name in the plan's `swaps`. */
export const TOWER_SWAP_MODELS: Readonly<Record<string, () => Model>> = (() => {
  const out: Record<string, () => Model> = {};
  for (const a of ['x', 'z'] as const) {
    for (let l = 0; l < CURTAIN_LOOKS; l++) {
      out[curtainSwap(l, a)] = () => curtainModel(l, a);
      out[sillSwap(l, a)] = () => sillModel(l, a);
      if (a === 'x') out[pierSwap(l)] = () => pierModel(l);
    }
    for (let l = 0; l < PARTITION_LOOKS; l++) {
      out[partitionSwap(l, a)] = () => partitionModel(l, a);
      out[screenSwap(a, l)] = () => screenModel(a, l);
    }
    out[solidSwap(a)] = () => solidModel(a);
  }
  return out;
})();

// ---- The foundation: the floor's edge over the curtain wall below ----

/** Looks the foundation comes in: where the slab's joint falls. */
export const TOWER_FOUNDATION_LOOKS = 2;
/** The slab's edge: pale stone, a shade under the plinth. */
const SLAB_STONE = 0xb3b5b1;

/**
 * Under each tile, the diorama's base: the tower's floor edge seen from
 * outside, a pale stone slab band (its joint by `look`) over the floor
 * below's dark spandrel with the curtain wall's mullions running down it,
 * the top of that floor's glass under it. No carpet line, no brown.
 */
export function towerFoundationModel(look: number): Model {
  const b = new ModelBuilder();
  const top = -0.013;
  const slabH = 0.14;
  const bottom = top - SLAB_DEPTH;
  b.box(1.004, slabH, 1.004, SLAB_STONE, { at: [0, top - slabH / 2, 0] }, 0);
  b.box(1.008, 0.01, 1.008, tint(SLAB_STONE, 0.12), { at: [0, top - 0.005, 0] }, 0);
  const spH = 0.16;
  b.box(1.0, spH, 1.0, SPANDREL, { at: [0, top - slabH - spH / 2, 0] }, 0);
  const glassTop = top - slabH - spH;
  b.box(0.99, glassTop - bottom, 0.99, CURTAIN_CORE, { at: [0, (glassTop + bottom) / 2, 0] }, 0);
  faces(0.502).forEach((on, f) => {
    b.box(
      0.006,
      slabH - 0.02,
      0.004,
      tint(SLAB_STONE, -0.18),
      on(((look + f) % 2) * 0.5 - 0.25, top - slabH / 2),
      0,
    );
    b.box(0.96, 0.008, 0.004, tint(SPANDREL, 0.2), on(0, top - slabH - 0.02), 0);
    b.box(0.06, SLAB_DEPTH - slabH, 0.04, ANODISED, on(-0.47, (top - slabH + bottom) / 2), 0);
    b.box(0.96, 0.02, 0.02, ANODISED, on(0, glassTop), 0);
    b.box(
      0.85,
      0.004,
      0.006,
      tint(CURTAIN_CORE, 0.25),
      on(0.04, (glassTop + bottom) / 2 + 0.03),
      0,
    );
  });
  return b.build();
}

// ---- The floors ----

/** Variants a tile comes in, picked by its hash. */
const VARIANTS = 3;
/** Every floor look, for the tests. */
export const TOWER_FLOOR_LOOKS = TOWER_WEAR_KINDS * VARIANTS;

/** A floor look: its wear and its variant. */
export function towerLook(x: number, y: number, wear: number): number {
  const variant = (tileHash(x + 11, y + 29) >>> 4) % VARIANTS;
  return wear * VARIANTS + variant;
}

/** A tile's brightness: ±4% per tile, picked by the tile and the level. */
export function towerTone(x: number, y: number, salt: number): number {
  const own = ((Math.imul(x + 61, 73856093) ^ Math.imul(y + 13, 19349663) ^ salt) >>> 0) % 1001;
  return 1 + (own / 1000 - 0.5) * 0.08;
}

/** The offices' deep slate broadloom, and its violet fleck. */
export const CARPET = FLOOR_COLORS.towerFloors[0];
const CARPET_ALT = FLOOR_COLORS.towerFloors[1];
const FLECK_VIOLET = 0x7e70b4;
/**
 * The meeting rooms' carpets: The Garage's sage-olive and Mom's warm taupe.
 * Under the game's violet meeting-rug tint (`WorldFx`) they show as a calm
 * grey-violet and a soft mauve, never a loud purple.
 */
export const MEETING_CARPETS = [0x6d7c5a, 0x8a7a64] as const;
/**
 * The meeting carpets as they show under the rug's tint (`WorldFx`: 0.35 of
 * 0x8e6bd8), for a threshold's half, which the tint doesn't reach.
 */
export const MEETING_BARE = MEETING_CARPETS.map((c) => mix(c, 0x8e6bd8, 0.35));
/** The corridor's pale terrazzo (darker than every station top), its chips and zinc strips. */
export const TERRAZZO = 0x878b8e;
const CHIPS = [0xc2c4c4, 0x5f6266, 0x8a84a8, 0xd0d0cc, 0x70757c] as const;
const ZINC = 0x7c8086;
/** The corridor's walk line: the terrazzo a shade darker, dulled by feet. */
export const WALK_LINE = mix(TERRAZZO, 0x6e7276, 0.55);

/** A flat mark `w` × `d` on the floor at (x, z), `y` up, turned `turn`. */
function mark(
  b: ModelBuilder,
  w: number,
  d: number,
  color: number,
  x: number,
  z: number,
  y = 0.0012,
  turn = 0,
): void {
  b.box(w, 0.002, d, color, { at: [x, y, z], rot: [0, turn, 0] }, 0);
}

/** A rectangle of the floor, x0..x1 by z0..z1. */
interface Area {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
const WHOLE: Area = { x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5 };
/** A point `(u, v)` (0..1 each) in an area, kept a little in from its edges. */
const inArea = (a: Area, u: number, v: number): [number, number] => [
  a.x0 + 0.04 + (a.x1 - a.x0 - 0.08) * u,
  a.z0 + 0.04 + (a.z1 - a.z0 - 0.08) * v,
];
/** A deterministic 0..1 from the variant and a counter. */
const rnd = (variant: number, k: number, salt: number) =>
  (tileHash(variant * 13 + k, salt) % 997) / 997;

/** Broadloom over an area: its base, the pile's faint rows, flecks (`fleck` the odd one's colour). */
function broadloom(b: ModelBuilder, a: Area, base: number, fleck: number, variant: number): void {
  const w = a.x1 - a.x0;
  const d = a.z1 - a.z0;
  b.box(w, 0.012, d, base, { at: [(a.x0 + a.x1) / 2, -0.006, (a.z0 + a.z1) / 2] }, 0);
  const row = tint(base, -0.035);
  for (let z = a.z0 + 0.0625; z < a.z1; z += 0.125)
    mark(b, w, 0.018, row, (a.x0 + a.x1) / 2, z, 0.0008);
  for (let k = 0; k < Math.round(9 * w * d); k++) {
    const [x, z] = inArea(a, rnd(variant, k, 3), rnd(variant, k, 7));
    const c = k % 3 === 0 ? fleck : k % 3 === 1 ? tint(base, 0.14) : tint(base, -0.12);
    mark(b, 0.014, 0.014, c, x, z, 0.0016);
  }
}

/** Terrazzo over an area: its base, the chips, the zinc strips at its −x and −z tile edges. */
function terrazzo(b: ModelBuilder, a: Area, variant: number, base = TERRAZZO): void {
  const w = a.x1 - a.x0;
  const d = a.z1 - a.z0;
  b.box(w, 0.012, d, base, { at: [(a.x0 + a.x1) / 2, -0.006, (a.z0 + a.z1) / 2] }, 0);
  for (let k = 0; k < Math.round(30 * w * d); k++) {
    const [x, z] = inArea(a, rnd(variant, k, 11), rnd(variant, k, 17));
    const s = 0.016 + rnd(variant, k, 23) * 0.022;
    mark(b, s, s * 0.8, CHIPS[k % CHIPS.length] ?? base, x, z, 0.0014, rnd(variant, k, 29) * 3);
  }
  if (a.x0 <= -0.5) mark(b, 0.01, d, ZINC, -0.495, (a.z0 + a.z1) / 2, 0.0022);
  if (a.z0 <= -0.5) mark(b, w, 0.01, ZINC, (a.x0 + a.x1) / 2, -0.495, 0.0022);
}

/** A threshold floor over an area. */
function surface(b: ModelBuilder, f: ThresholdFloor, a: Area, variant: number): void {
  if (f === 'terrazzo') terrazzo(b, a, variant);
  else if (f === 'carpet') broadloom(b, a, CARPET, FLECK_VIOLET, variant);
  else {
    const c = MEETING_BARE[f === 'meeting0' ? 0 : 1] ?? CARPET;
    broadloom(b, a, c, tint(c, 0.1), variant);
  }
}

/** Heel scuffs: short grey dashes, a few. */
function heelScuffs(b: ModelBuilder, variant: number, color: number): void {
  for (let k = 0; k < 5; k++) {
    const [x, z] = inArea(WHOLE, rnd(variant, k, 41), rnd(variant, k, 43));
    mark(b, 0.05 + rnd(variant, k, 47) * 0.05, 0.008, color, x, z, 0.0026, rnd(variant, k, 53) * 3);
  }
}

/**
 * A floor tile (`look` from `towerLook`): the offices' broadloom and its
 * wear, each meeting room's carpet, the corridor's terrazzo and its walk
 * line and scuffs, the thresholds (see `TOWER_WEAR`).
 */
export function towerFloorModel(look: number): Model {
  const variant = look % VARIANTS;
  const wear = Math.floor(look / VARIANTS) % TOWER_WEAR_KINDS;
  const b = new ModelBuilder();
  if (wear >= TOWER_WEAR.threshold) {
    const t = wear - TOWER_WEAR.threshold;
    const alongX = t >= 16;
    const neg = THRESHOLD_FLOORS[Math.floor((t % 16) / 4)] ?? 'carpet';
    const pos = THRESHOLD_FLOORS[t % 4] ?? 'terrazzo';
    if (alongX) {
      surface(b, neg, { x0: -0.5, x1: 0, z0: -0.5, z1: 0.5 }, variant);
      surface(b, pos, { x0: 0, x1: 0.5, z0: -0.5, z1: 0.5 }, variant + 1);
      b.box(0.07, 0.006, 1, ALU_DARK, { at: [0, 0.002, 0] }, 0);
      b.box(0.02, 0.004, 1, tint(ALU, 0.1), { at: [0, 0.0055, 0] }, 0);
    } else {
      surface(b, neg, { x0: -0.5, x1: 0.5, z0: -0.5, z1: 0 }, variant);
      surface(b, pos, { x0: -0.5, x1: 0.5, z0: 0, z1: 0.5 }, variant + 1);
      b.box(1, 0.006, 0.07, ALU_DARK, { at: [0, 0.002, 0] }, 0);
      b.box(1, 0.004, 0.02, tint(ALU, 0.1), { at: [0, 0.0055, 0] }, 0);
    }
    return b.build();
  }
  if (wear >= TOWER_WEAR.meeting && wear < TOWER_WEAR.terrazzo) {
    const base = MEETING_CARPETS[wear - TOWER_WEAR.meeting] ?? MEETING_CARPETS[0];
    broadloom(b, WHOLE, base, tint(base, 0.1), variant);
    return b.build();
  }
  if (wear >= TOWER_WEAR.terrazzo) {
    terrazzo(b, WHOLE, variant);
    const line =
      wear >= TOWER_WEAR.scuff ? [0, 1, 2][wear - TOWER_WEAR.scuff] : wear - TOWER_WEAR.terrazzo;
    // The walk line: a darker band dulled by feet along the seam with the next row.
    const band = (z: number) => {
      mark(b, 1, 0.3, WALK_LINE, 0, z, 0.0018);
      mark(b, 1, 0.06, mix(TERRAZZO, WALK_LINE, 0.5), 0, z + (z > 0 ? -0.18 : 0.18), 0.0018);
    };
    if (line === 1) band(0.35);
    else if (line === 2) band(-0.35);
    else if (line === 3) mark(b, 1, 0.3, WALK_LINE, 0, 0, 0.0018);
    if (wear >= TOWER_WEAR.scuff) heelScuffs(b, variant, mix(TERRAZZO, 0x4a4844, 0.45));
    return b.build();
  }
  broadloom(b, WHOLE, variant === 2 ? CARPET_ALT : CARPET, FLECK_VIOLET, variant);
  if (wear === TOWER_WEAR.castor) {
    // Chair castors' arcs in front of the desk, pile pressed paler.
    for (const [x, z, r] of [
      [-0.18, -0.12, 0.2],
      [0.16, -0.18, 0.16],
      [0.02, 0.05, 0.24],
    ] as const)
      b.torus(
        r,
        0.007,
        tint(CARPET, 0.14),
        { at: [x, 0.0016, z], rot: [Math.PI / 2, 0, 0.4 + x * 3] },
        Math.PI * 0.7,
      );
  } else if (wear === TOWER_WEAR.walk) {
    mark(b, 0.36, 1, tint(CARPET, 0.06), 0, 0, 0.0018);
    mark(b, 0.2, 1, tint(CARPET, 0.09), 0, 0, 0.002);
  } else if (wear === TOWER_WEAR.doorScuff) {
    heelScuffs(b, variant, tint(CARPET, 0.12));
  }
  return b.build();
}

// ---- Counters ----

/** The counters' smoked oak top (darker than every station top), its edge, the charcoal plinth body. */
export const COUNTER_TOP = 0x6e5b47;
const COUNTER_EDGE = 0x4d3f31;
const COUNTER_BODY = 0x464c54;

/**
 * A counter as an HQ credenza (the hatch counters in the partitions, the
 * meeting tables): a smoked oak top with its darker edge over a recessed
 * charcoal body on a dark kick, a brushed steel line under the top, a
 * shadow gap between its doors; the same model in a run, its ends closed.
 */
export function towerCounter(run: CounterRun): StationModel {
  const b = new ModelBuilder();
  const h = STATION_HEIGHT;
  const top = 0.045;
  b.box(0.9, 0.06, 0.8, 0x2c3036, { at: [0, 0.03, 0] }, 0);
  b.box(
    0.94,
    h - top - 0.06,
    0.86,
    COUNTER_BODY,
    { at: [0, 0.06 + (h - top - 0.06) / 2, 0] },
    0.01,
  );
  b.box(1.0, top, 0.98, COUNTER_TOP, { at: [0, h - top / 2, 0] }, 0.012);
  b.box(1.0, 0.012, 0.012, COUNTER_EDGE, { at: [0, h - top + 0.006, 0.49] }, 0);
  b.box(0.94, 0.008, 0.01, ALU, { at: [0, h - top - 0.012, 0.432] }, 0);
  b.box(
    0.006,
    h - top - 0.1,
    0.004,
    tint(COUNTER_BODY, -0.35),
    { at: [0, 0.06 + (h - top - 0.08) / 2, 0.431] },
    0,
  );
  for (const s of [-1, 1])
    b.box(0.012, 0.1, 0.012, ALU, { at: [s * 0.05, h - top - 0.1, 0.438] }, 0.003);
  // The grain: faint streaks along the top.
  for (const [z, w] of [
    [-0.3, 0.7],
    [-0.08, 0.5],
    [0.18, 0.8],
    [0.36, 0.4],
  ] as const)
    b.box(w, 0.002, 0.008, tint(COUNTER_TOP, -0.12), { at: [0.05, h + 0.0005, z] }, 0);
  if (run.minusEnd)
    b.box(
      0.006,
      h - top - 0.08,
      0.84,
      tint(COUNTER_BODY, -0.3),
      { at: [-0.471, 0.06 + (h - top - 0.06) / 2, 0] },
      0,
    );
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

// ---- The request portal and the release hatch ----

/** Draws a "+" `s` wide centred on (x, y) at depth z. */
function plus(b: ModelBuilder, x: number, y: number, z: number, s: number, color: number): void {
  b.box(s, s * 0.28, 0.003, color, { at: [x, y, z] }, 0);
  b.box(s * 0.28, s, 0.003, color, { at: [x, y, z] }, 0);
}

/** How tall the request portal's screen stands (its top), over the inbox. */
export const PORTAL_TOP = WALL_HEIGHT - 0.01;
/** How far the portal's screen leans back. */
const PORTAL_TILT = 0.45;

/**
 * The stakeholder request portal over the inbox (`span` tiles, built with
 * its back to the outside, −z): a slim-framed wall screen on two steel
 * posts behind the station, a violet REQUESTS header with a red badge, a
 * queue of request cards, and the "+ NEW REQUEST" button.
 */
export function requestPortalModel(span: number): Model {
  const b = new ModelBuilder();
  const w = span - 0.16;
  const z = -0.47;
  const y0 = STATION_HEIGHT + 0.06;
  const y1 = PORTAL_TOP;
  const cy = (y0 + y1) / 2;
  for (const s of [-1, 1])
    b.box(0.04, y0, 0.03, STEEL_DARK, { at: [s * (w / 2 - 0.12), y0 / 2, z - 0.01] }, 0);
  // Leaned back, so it shows its face to the camera over the station.
  const q = new THREE.Vector3(0, y0, z).applyMatrix4(
    new THREE.Matrix4().makeRotationX(-PORTAL_TILT),
  );
  const g = framed(b, [0, y0 - q.y, z - q.z], [-PORTAL_TILT, 0, 0]);
  g.box(w, y1 - y0, 0.035, 0x262a31, { at: [0, cy, z] }, 0.008);
  const f = z + 0.018;
  g.screen(w - 0.04, y1 - y0 - 0.04, SCREEN_NAVY, { at: [0, cy, f] });
  // The header.
  const hy = y1 - 0.1;
  g.screen(w - 0.06, 0.13, 0x4a34a0, { at: [0, hy, f + 0.001] });
  text(g, 'REQUESTS', -0.08 * span, hy, f + 0.002, 0.022, 0xffffff);
  g.screen(0.11, 0.08, 0xd83a32, { at: [w / 2 - 0.12, hy, f + 0.002] });
  text(g, '99', w / 2 - 0.12, hy, f + 0.003, 0.011, 0xffffff);
  // The queue: cards in rows, each a coloured tag and two lines.
  const cols = Math.max(2, span * 2);
  const cw = (w - 0.1) / cols;
  const tags = [0xe0b44f, 0x6cc070, 0xe05a5a, 0x4fa3e0];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + 0.05 + cw * (c + 0.5);
      const y = hy - 0.15 - r * 0.115;
      g.screen(cw - 0.03, 0.095, 0x2a3d5e, { at: [x, y, f + 0.001] });
      g.box(
        0.022,
        0.07,
        0.003,
        tags[(r * cols + c) % tags.length] ?? 0xffffff,
        { at: [x - cw / 2 + 0.03, y, f + 0.002] },
        0,
      );
      g.box(cw * 0.55, 0.012, 0.003, 0xdfe6f0, { at: [x + 0.01, y + 0.02, f + 0.002] }, 0);
      g.box(cw * 0.4, 0.01, 0.003, 0x8a9ab8, { at: [x - 0.02, y - 0.015, f + 0.002] }, 0);
    }
  // + NEW REQUEST.
  const by = y0 + 0.07;
  g.screen(0.78, 0.085, 0x7a5ce0, { at: [0, by, f + 0.001] });
  plus(g, -0.3, by, f + 0.003, 0.04, 0xffffff);
  text(g, 'NEW REQUEST', 0.04, by, f + 0.002, 0.012, 0xffffff);
  return b.build();
}

/** How far out onto the terrace the big red button's pedestal stands, past the wall line. */
export const BUTTON_OUT = 0.42;
/** Its height at most: about the front strip's 0.6. */
export const RELEASE_MAX_H = 0.6;

/**
 * The release hatch at the ship (`span` tiles, built with its +z to the
 * outside): steel jambs either side of the opening, a hazard-striped steel
 * sill under it, and beside it on the terrace THE BIG RED BUTTON on its
 * pedestal: a sloped console with a mushroom button under a flip cover
 * propped open, a RELEASE plate and a green SHIPPED lamp.
 */
export function releaseHatchModel(span: number): Model {
  const b = new ModelBuilder();
  const hx = span / 2;
  for (const s of [-1, 1]) {
    b.box(0.07, 0.46, 0.07, STEEL_DARK, { at: [s * hx, 0.23, 0.52] }, 0.01);
    b.box(0.03, 0.4, 0.074, 0xd8b23a, { at: [s * hx, 0.22, 0.52] }, 0);
  }
  b.box(span, 0.05, 0.1, STEEL_DARK, { at: [0, 0.025, 0.56] }, 0.008);
  for (let k = 0; k < span * 6; k++)
    b.box(
      0.07,
      0.004,
      0.1,
      k % 2 ? 0x1e2126 : 0xe3b52c,
      {
        at: [-hx + 0.083 * (k + 0.5), 0.052, 0.56],
        rot: [0, 0.5, 0],
      },
      0,
    );
  // The pedestal, beside the hatch.
  const px = hx - 0.34;
  const pz = 0.5 + BUTTON_OUT;
  b.box(0.3, 0.025, 0.3, STEEL_DARK, { at: [px, 0.0125, pz] }, 0.006);
  b.box(0.15, 0.3, 0.15, STEEL, { at: [px, 0.025 + 0.15, pz] }, 0.012);
  b.box(0.12, 0.004, 0.152, tint(STEEL, 0.2), { at: [px, 0.2, pz] }, 0);
  const g = framed(b, [px, 0.36, pz], [-0.42, 0, 0], 1.45);
  g.box(0.3, 0.06, 0.22, 0x2e3238, { at: [0, 0, 0] }, 0.012);
  g.cylinder(0.07, 0.07, 0.008, 0xe3b52c, { at: [0, 0.034, 0.01] }, 20);
  for (let k = 0; k < 6; k++)
    g.box(
      0.016,
      0.009,
      0.05,
      0x1e2126,
      { at: [Math.cos(k) * 0.05, 0.035, 0.01 + Math.sin(k) * 0.05], rot: [0, -k, 0] },
      0,
    );
  g.cylinder(0.034, 0.038, 0.035, 0x8a1a16, { at: [0, 0.055, 0.01] }, 16);
  g.sphere(0.056, 0xd8261e, { at: [0, 0.075, 0.01] }, [1, 0.5, 1]);
  // The flip cover, propped open on its hinge at the back.
  g.box(0.13, 0.006, 0.014, 0xd8261e, { at: [0, 0.07, -0.075] }, 0);
  g.pane(0.13, 0.13, 0.006, 0xf0d0c8, { at: [0, 0.135, -0.085], rot: [-0.25, 0, 0] });
  g.box(0.13, 0.012, 0.012, 0xd8261e, { at: [0, 0.2, -0.1] }, 0);
  // RELEASE on the console's front, the SHIPPED lamp at its corner.
  g.box(0.22, 0.04, 0.004, 0x15171b, { at: [0, -0.005, 0.112] }, 0);
  text(g, 'RELEASE', 0, -0.005, 0.114, 0.0062, 0xffffff);
  g.box(0.03, 0.05, 0.03, 0x2e3238, { at: [0.12, 0.05, -0.08] }, 0.006);
  g.led(0.022, 0x3ee06a, { at: [0.12, 0.09, -0.08] });
  return b.build();
}

// ---- What hangs on the walls ----

/** A face's front (the wall's +z face) and a small standoff. */
const FACE = 0.506;

/** THE PLAN, framed like art in a gallery frame under a brass picture light, with its museum label. */
function planModel(): Model {
  const outer = new ModelBuilder();
  const b = framed(outer, [0, 0.68 * (1 - 1.25), FACE * (1 - 1.25)], [0, 0, 0], 1.25);
  const cy = 0.68;
  b.box(0.6, 0.44, 0.03, 0x1b1d21, { at: [0, cy, FACE + 0.015] }, 0.006);
  b.box(0.54, 0.38, 0.004, 0xf2efe7, { at: [0, cy, FACE + 0.031] }, 0);
  b.box(0.4, 0.26, 0.003, PAPER, { at: [0, cy, FACE + 0.034] }, 0);
  const f = FACE + 0.036;
  text(b, '1. BUILD IT', 0, cy + 0.075, f, 0.0085, INK);
  text(b, '2. ???', -0.06, cy, f, 0.0085, INK);
  text(b, '3. PROFIT', -0.02, cy - 0.075, f, 0.0085, INK);
  // The picture light: a brass arm and a slim lamp over the frame, its glow on the art.
  const ly = cy + 0.28;
  b.box(0.02, 0.06, 0.02, 0xb08a4a, { at: [0, ly - 0.02, FACE + 0.02] }, 0.004);
  b.box(0.02, 0.02, 0.1, 0xb08a4a, { at: [0, ly, FACE + 0.06] }, 0.004);
  b.cylinder(
    0.022,
    0.022,
    0.36,
    0xb08a4a,
    { at: [0, ly, FACE + 0.11], rot: [0, 0, Math.PI / 2] },
    12,
  );
  b.screen(0.32, 0.012, 0xffe2a8, { at: [0, ly - 0.022, FACE + 0.115], rot: [-Math.PI / 2, 0, 0] });
  b.screen(0.5, 0.12, 0x3a3226, { at: [0, cy + 0.16, FACE + 0.0355] });
  // The museum label.
  b.box(0.1, 0.05, 0.004, 0xe8e6de, { at: [0.33, cy - 0.15, FACE + 0.002] }, 0);
  b.box(0.07, 0.006, 0.002, INK, { at: [0.33, cy - 0.14, FACE + 0.005] }, 0);
  b.box(0.05, 0.005, 0.002, 0x8a8a86, { at: [0.325, cy - 0.16, FACE + 0.005] }, 0);
  return outer.build();
}

/** The room directory by the corridor: every room's name, each named after where YOTTA's been. */
function directoryModel(names: readonly string[]): Model {
  const b = new ModelBuilder();
  const cy = 0.68;
  const h = 0.12 + names.length * 0.07;
  b.box(0.62, h, 0.02, 0x2c3138, { at: [0, cy, FACE + 0.01] }, 0.006);
  const f = FACE + 0.021;
  b.box(0.58, 0.05, 0.003, YOTTA_VIOLET, { at: [0, cy + h / 2 - 0.045, f] }, 0);
  text(b, 'FLOOR 38', 0, cy + h / 2 - 0.045, f + 0.002, 0.008, 0xffffff);
  names.forEach((n, i) => {
    const y = cy + h / 2 - 0.115 - i * 0.07;
    b.box(0.018, 0.018, 0.003, i % 2 ? 0x9a86e8 : 0x3ec7a0, { at: [-0.25, y, f] }, 0);
    text(b, n, -0.22 + ((n.length * 4 - 1) * 0.0085) / 2, y, f, 0.0085, 0xe6e9ee);
  });
  return b.build();
}

/** The thermostat at 29°C, its DO NOT TOUCH – FACILITIES sticker under it. */
function thermostatModel(): Model {
  const b = new ModelBuilder();
  const cy = 0.74;
  b.box(0.22, 0.17, 0.03, 0xe8e9e6, { at: [0, cy, FACE + 0.015] }, 0.012);
  b.screen(0.17, 0.08, 0xff9a3c, { at: [0, cy + 0.02, FACE + 0.031] });
  text(b, '29°C', 0, cy + 0.02, FACE + 0.032, 0.012, 0x2a1408);
  b.box(0.04, 0.02, 0.006, 0xb8bab6, { at: [-0.05, cy - 0.055, FACE + 0.031] }, 0.003);
  b.box(0.04, 0.02, 0.006, 0xb8bab6, { at: [0.05, cy - 0.055, FACE + 0.031] }, 0.003);
  b.box(0.36, 0.13, 0.003, 0xf2d33a, { at: [0, cy - 0.18, FACE + 0.002], rot: [0, 0, -0.04] }, 0);
  const s = framed(b, [0, cy - 0.18, FACE + 0.004], [0, 0, -0.04]);
  text(s, 'DO NOT TOUCH', 0, 0.025, 0, 0.0068, 0xc0201a);
  text(s, 'FACILITIES', 0, -0.025, 0, 0.0068, INK);
  return b.build();
}

/** A round wall clock at ten past nine (back-to-back since 9:00). */
function clockModel(): Model {
  const b = new ModelBuilder();
  const cy = 0.82;
  b.cylinder(
    0.14,
    0.14,
    0.03,
    0x2c3036,
    { at: [0, cy, FACE + 0.015], rot: [Math.PI / 2, 0, 0] },
    28,
  );
  b.cylinder(
    0.125,
    0.125,
    0.004,
    0xf2f2ee,
    { at: [0, cy, FACE + 0.032], rot: [Math.PI / 2, 0, 0] },
    28,
  );
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.box(
      0.008,
      k % 3 ? 0.014 : 0.026,
      0.003,
      INK,
      { at: [Math.sin(a) * 0.105, cy + Math.cos(a) * 0.105, FACE + 0.035], rot: [0, 0, -a] },
      0,
    );
  }
  const hand = (len: number, a: number, w: number, c: number) =>
    b.box(
      w,
      len,
      0.003,
      c,
      {
        at: [Math.sin(a) * len * 0.5, cy + Math.cos(a) * len * 0.5, FACE + 0.037],
        rot: [0, 0, -a],
      },
      0,
    );
  hand(0.06, ((9 + 10 / 60) / 12) * Math.PI * 2, 0.012, INK);
  hand(0.095, (10 / 60) * Math.PI * 2, 0.008, INK);
  hand(0.1, 0.3, 0.003, 0xc0302a);
  return b.build();
}

/** A booking screen's face: a red BOOKED strip and the morning's back-to-back slots, centred on (x, y) at depth z. */
function bookingFace(b: ModelBuilder, x: number, y: number, z: number): void {
  b.box(0.22, 0.16, 0.018, 0x1e2226, { at: [x, y, z + 0.009] }, 0.006);
  b.screen(0.19, 0.13, 0x14202e, { at: [x, y, z + 0.019] });
  b.screen(0.19, 0.03, 0xc0302a, { at: [x, y + 0.05, z + 0.02] });
  text(b, 'BOOKED', x, y + 0.05, z + 0.021, 0.0045, 0xffffff);
  for (const [k, t] of ['09:00 SYNC', '09:30 SYNC', '10:00 SYNC'].entries())
    text(b, t, x, y + 0.012 - k * 0.032, z + 0.021, 0.0036, k === 0 ? 0xffd27a : 0xc9d4e0);
}

/**
 * Every wall art model, by its name in the plan. The low booking screens
 * stand on the glass of a low wall at the end by the door.
 */
export function towerArtModels(names: readonly string[]): Readonly<Record<TowerArt, () => Model>> {
  return {
    plan: planModel,
    directory: () => directoryModel(names),
    thermostat: thermostatModel,
    clock: clockModel,
    bookingHigh: () => {
      const b = new ModelBuilder();
      bookingFace(b, 0, 0.78, FACE - 0.004);
      return b.build();
    },
    bookingLowLeft: () => lowBooking(-1),
    bookingLowRight: () => lowBooking(1),
  };
}

/** A booking screen on a low wall's glass at its `side` end (−1 −x), on a slim post. */
function lowBooking(side: number): Model {
  const b = new ModelBuilder();
  const x = side * 0.36;
  const y = FRONT_WALL_HEIGHT + 0.25;
  b.box(0.03, 0.2, 0.02, ALU_DARK, { at: [x, FRONT_WALL_HEIGHT + 0.1, 0.02] }, 0);
  bookingFace(b, x, y, 0.012);
  return b.build();
}

// ---- The rooms' names in vinyl, the door portals ----

/** A room's name in white vinyl on the glass screens of its partition (`width` wide), front face. */
export function vinylModel(name: string, width: number): Model {
  const b = new ModelBuilder();
  const px = vinylPx(name, width);
  const y = FRONT_WALL_HEIGHT + 0.03 + SCREEN_H * 0.42;
  text(b, name, 0, y, 0.0075, px, WHITE_VINYL, 0.003);
  // A thin violet rule under it.
  const w = (name.length * 4 - 1) * px;
  b.box(w, Math.max(0.008, px * 0.35), 0.003, YOTTA_VIOLET, { at: [0, y - px * 3.6, 0.009] }, 0);
  return b.build();
}

/** How high the tall door portal's head sits: under the door light (`Mechanics`, 1.25). */
export const PORTAL_HEAD = 1.1;

/**
 * A slim aluminium door portal round a meeting door, built for a wall line
 * along z (turn it a quarter for one along x): a post at each end of the
 * tile and, when `tall`, a slim head between them under the door light and
 * a glass sliding leaf parked open over the wall behind it (−z), with its
 * frosted band and pull handle; low, just the posts to the screens' top.
 */
export function doorPortalModel(tall: boolean): Model {
  const b = new ModelBuilder();
  const h = tall ? PORTAL_HEAD : FRONT_WALL_HEIGHT + 0.03 + SCREEN_H + 0.016;
  for (const s of [-1, 1]) b.box(0.07, h, 0.05, ALU, { at: [0, h / 2, s * 0.5] }, 0.006);
  if (!tall) return b.build();
  b.box(0.06, 0.04, 1.04, ALU, { at: [0, h - 0.02, 0] }, 0.006);
  // The sliding leaf, parked open beside the wall behind it.
  const lz = -0.98;
  const lh = h - 0.1;
  b.pane(0.012, lh, 0.92, PANE, { at: [0.08, 0.04 + lh / 2, lz] });
  b.box(0.02, 0.03, 0.94, ALU, { at: [0.08, 0.05, lz] }, 0);
  b.box(0.02, 0.03, 0.94, ALU, { at: [0.08, 0.04 + lh, lz] }, 0);
  b.box(0.016, 0.06, 0.9, FROST, { at: [0.08, MANIFEST_Y, lz] }, 0);
  for (let k = 0; k < 8; k++)
    b.box(0.018, 0.022, 0.022, DOT_VIOLET, { at: [0.08, MANIFEST_Y, lz - 0.4 + k * 0.115] }, 0);
  b.box(0.05, 0.4, 0.02, STEEL_DARK, { at: [0.1, 0.55, lz + 0.4] }, 0.006);
  return b.build();
}

// ---- The meeting rooms' own pieces ----

/** Where a meeting piece stands on its low wall's top: toward the room (+z). */
const LEDGE_Z = 0.28;

/** Mom's portrait in a gilt frame and her first angel cheque, framed, on a picture ledge. */
function momPortraitModel(): Model {
  const b = new ModelBuilder();
  const y0 = FRONT_WALL_HEIGHT;
  b.box(0.7, 0.02, 0.08, 0x3a3f46, { at: [0.12, y0 + 0.01, LEDGE_Z] }, 0.004);
  // The portrait.
  const p = framed(b, [0.0, y0 + 0.02, LEDGE_Z - 0.01], [-0.14, 0, 0]);
  p.box(0.27, 0.33, 0.03, 0xb8954a, { at: [0, 0.165, 0] }, 0.008);
  p.box(0.22, 0.28, 0.004, 0x35503f, { at: [0, 0.165, 0.016] }, 0);
  p.cylinder(0.08, 0.08, 0.004, 0x1f2f26, { at: [0, 0.2, 0.0175], rot: [Math.PI / 2, 0, 0] }, 20);
  p.box(0.11, 0.08, 0.004, 0x6a4a7a, { at: [0, 0.07, 0.019] }, 0.02);
  p.cylinder(
    0.042,
    0.042,
    0.004,
    0xe2b896,
    { at: [0, 0.19, 0.0195], rot: [Math.PI / 2, 0, 0] },
    16,
  );
  p.cylinder(0.05, 0.05, 0.003, 0xc9c6c2, { at: [0, 0.215, 0.018], rot: [Math.PI / 2, 0, 0] }, 16);
  p.cylinder(
    0.026,
    0.026,
    0.004,
    0xc9c6c2,
    { at: [0, 0.27, 0.0185], rot: [Math.PI / 2, 0, 0] },
    12,
  );
  for (let k = 0; k < 7; k++)
    p.led(0.006, 0xfff6ea, {
      at: [-0.03 + k * 0.01, 0.125 - Math.sin((k / 6) * Math.PI) * 0.012, 0.022],
    });
  // Her first cheque.
  const c = framed(b, [0.31, y0 + 0.02, LEDGE_Z - 0.005], [-0.14, 0, 0.02]);
  c.box(0.3, 0.16, 0.022, 0x1b1d21, { at: [0, 0.08, 0] }, 0.005);
  c.box(0.27, 0.13, 0.004, 0xf3f1ea, { at: [0, 0.08, 0.012] }, 0);
  c.box(0.23, 0.08, 0.003, 0xd8e7cc, { at: [0, 0.08, 0.0145] }, 0);
  text(c, 'PAY YOTTA', -0.03, 0.105, 0.016, 0.0042, INK);
  text(c, '25000', 0.07, 0.07, 0.016, 0.005, INK);
  c.box(0.08, 0.004, 0.002, 0x2f5aa8, { at: [-0.04, 0.06, 0.0165], rot: [0, 0, 0.2] }, 0);
  c.box(0.03, 0.03, 0.003, 0xc0302a, { at: [0.09, 0.115, 0.0165], rot: [0, 0, 0.4] }, 0);
  return b.build();
}

/** A jug of water and glasses on a tray (it's 38° out), on the low wall's top. */
function waterTrayModel(): Model {
  const b = new ModelBuilder();
  const y0 = FRONT_WALL_HEIGHT;
  const x = -0.12;
  b.box(0.36, 0.014, 0.18, 0x4d3f31, { at: [x, y0 + 0.007, LEDGE_Z] }, 0.004);
  b.cylinder(0.042, 0.048, 0.06, 0x9fcbe2, { at: [x - 0.08, y0 + 0.044, LEDGE_Z] }, 16);
  b.add(
    new THREE.CylinderGeometry(0.05, 0.056, 0.17, 16),
    0xe8f4fa,
    { at: [x - 0.08, y0 + 0.1, LEDGE_Z] },
    'glass',
  );
  b.torus(
    0.03,
    0.007,
    0xd6e6ee,
    { at: [x - 0.03, y0 + 0.11, LEDGE_Z], rot: [0, 0, Math.PI / 2] },
    Math.PI,
  );
  for (const [gx, gz] of [
    [0.02, -0.04],
    [0.08, 0.03],
    [0.13, -0.03],
  ] as const) {
    b.cylinder(0.022, 0.022, 0.03, 0xa9d2e6, { at: [x + gx, y0 + 0.03, LEDGE_Z + gz] }, 12);
    b.add(
      new THREE.CylinderGeometry(0.026, 0.024, 0.08, 12),
      0xeef7fb,
      { at: [x + gx, y0 + 0.054, LEDGE_Z + gz] },
      'glass',
    );
  }
  return b.build();
}

/** A framed photo of Mom's garage on a little easel (where it started). */
function garagePhotoModel(): Model {
  const b = new ModelBuilder();
  const y0 = FRONT_WALL_HEIGHT;
  const p = framed(b, [0.05, y0, LEDGE_Z], [-0.18, 0.15, 0]);
  p.box(0.34, 0.26, 0.024, 0x5a4532, { at: [0, 0.15, 0] }, 0.006);
  p.box(0.29, 0.21, 0.004, 0xa8c4d8, { at: [0, 0.15, 0.013] }, 0);
  p.box(0.29, 0.05, 0.003, 0x7a8c66, { at: [0, 0.065, 0.0155] }, 0);
  p.box(0.2, 0.13, 0.003, 0xd8c9a4, { at: [0, 0.135, 0.0158] }, 0);
  p.box(0.22, 0.03, 0.003, 0x8a4a3a, { at: [0, 0.205, 0.0162] }, 0);
  p.box(0.13, 0.09, 0.003, 0x9aa0a6, { at: [-0.01, 0.115, 0.0164] }, 0);
  for (let k = 0; k < 4; k++)
    p.box(0.13, 0.004, 0.002, 0x7a8086, { at: [-0.01, 0.08 + k * 0.022, 0.0168] }, 0);
  p.box(0.035, 0.035, 0.003, 0xf2e6a8, { at: [0.08, 0.16, 0.0164] }, 0);
  b.box(
    0.02,
    0.2,
    0.02,
    0x5a4532,
    { at: [0.05, y0 + 0.1, LEDGE_Z - 0.09], rot: [0.5, 0, 0] },
    0.004,
  );
  return b.build();
}

/** The heritage lawnmower in a glass case on a plinth, with its plaque. */
function mowerCaseModel(): Model {
  const b = new ModelBuilder();
  const y0 = FRONT_WALL_HEIGHT;
  const x = 0.05;
  b.box(0.34, 0.1, 0.3, 0xe6e6e2, { at: [x, y0 + 0.05, LEDGE_Z - 0.04] }, 0.008);
  b.box(0.12, 0.03, 0.004, 0xb08a4a, { at: [x, y0 + 0.05, LEDGE_Z + 0.112] }, 0);
  b.box(0.08, 0.005, 0.002, INK, { at: [x, y0 + 0.05, LEDGE_Z + 0.115] }, 0);
  const m = y0 + 0.1;
  b.box(0.18, 0.06, 0.12, 0xc8342a, { at: [x, m + 0.05, LEDGE_Z - 0.04] }, 0.02);
  b.cylinder(0.035, 0.035, 0.05, 0x2a2d33, { at: [x, m + 0.09, LEDGE_Z - 0.04] }, 12);
  for (const [dx, dz] of [
    [-0.08, 0.04],
    [0.08, 0.04],
    [-0.08, -0.12],
    [0.08, -0.12],
  ] as const)
    b.cylinder(
      0.025,
      0.025,
      0.02,
      0x1e2126,
      { at: [x + dx, m + 0.025, LEDGE_Z + dz], rot: [0, 0, Math.PI / 2] },
      12,
    );
  for (const s of [-1, 1])
    b.box(
      0.012,
      0.012,
      0.16,
      0x9aa0a6,
      { at: [x + s * 0.06, m + 0.14, LEDGE_Z - 0.15], rot: [0.9, 0, 0] },
      0,
    );
  b.pane(0.32, 0.26, 0.28, 0xeef6fa, { at: [x, m + 0.13, LEDGE_Z - 0.04] });
  b.box(0.33, 0.012, 0.29, ALU, { at: [x, m + 0.266, LEDGE_Z - 0.04] }, 0);
  return b.build();
}

/** A roll-up garage door printed on the screen's glass, both faces. */
function rollUpModel(): Model {
  const b = new ModelBuilder();
  const y0 = FRONT_WALL_HEIGHT + 0.03;
  const h = SCREEN_H * 0.8;
  for (const z of [0.008, -0.008]) {
    b.box(1.0, h, 0.003, 0xa7adb2, { at: [0, y0 + h / 2, z] }, 0);
    for (let k = 1; k < 9; k++)
      b.box(1.0, 0.006, 0.004, 0x7f868d, { at: [0, y0 + (h * k) / 9, z * 1.15] }, 0);
    b.box(0.16, 0.014, 0.005, 0x4c5259, { at: [0, y0 + 0.03, z * 1.3] }, 0);
  }
  return b.build();
}

/** Every meeting piece, by name. */
export const MEETING_PIECE_MODELS: Readonly<Record<MeetingPiece, () => Model>> = {
  garagePhoto: garagePhotoModel,
  mowerCase: mowerCaseModel,
  rollUp: rollUpModel,
  momPortrait: momPortraitModel,
  waterTray: waterTrayModel,
};

/** A conference speaker puck on a meeting table, at its back corner. */
export function speakerPuckModel(): Model {
  const b = new ModelBuilder();
  const y = STATION_HEIGHT;
  b.cylinder(0.075, 0.085, 0.022, 0x2a2e34, { at: [0.3, y + 0.011, -0.3] }, 20);
  b.cylinder(0.05, 0.05, 0.004, 0x3a3f46, { at: [0.3, y + 0.024, -0.3] }, 20);
  b.led(0.008, 0x3ee06a, { at: [0.3, y + 0.026, -0.245] });
  return b.build();
}

// ---- The pendants ----

/** A slim linear pendant: an anodised body, its warm-white diffuser underneath, two fine wires up. */
export function towerPendantModel(): Model {
  const b = new ModelBuilder();
  const len = TOWER_PENDANT_HALF * 2;
  b.box(len, 0.03, 0.045, 0xc9ced3, { at: [0, 0, 0] }, 0.008);
  b.box(len - 0.02, 0.004, 0.046, tint(ANODISED, 0.35), { at: [0, 0.015, 0] }, 0);
  b.add(new THREE.BoxGeometry(len - 0.03, 0.006, 0.032), 0xfff2dc, { at: [0, -0.016, 0] }, 'glow');
  for (const s of [-1, 1]) {
    b.box(0.004, 0.3, 0.004, 0x2a2d33, { at: [s * (len / 2 - 0.08), 0.165, 0] }, 0);
    b.box(0.02, 0.012, 0.014, 0x2a2d33, { at: [s * (len / 2 - 0.08), 0.31, 0] }, 0.004);
  }
  return b.build();
}
