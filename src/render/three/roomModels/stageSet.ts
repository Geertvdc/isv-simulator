import * as THREE from 'three';
import { type WallPiece, tileHash } from '../../mapShape';
import { type Model, ModelBuilder, type Place, tint } from '../kit';
import { FRONT_WALL_HEIGHT, SLAB_DEPTH, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, WALL_COLORS } from '../look';
import type { CounterRun } from '../rooms/counterRun';
import {
  CABLE_PARTS,
  DECK_WEAR,
  DECK_WEAR_KINDS,
  STAGE_ART_HALF,
  type Truss,
} from '../rooms/stageSetRoom';
import { lettering } from '../setDressing/businessPark';
import type { StationModel } from '../stationModels';

/**
 * YOTTA's demo set on the Demo Day stage (wall theme `stageSet`, floor
 * theme `stageDeck`), built in code: low modular stage-set walls of matte
 * charcoal scenery flats with a slim violet LED strip and a dark kick
 * plinth under brushed aluminium extrusion caps, the stage's black pleated
 * fascia with its warm LED edge line, painted stage decks with their tape
 * and cables, black flight cases for counters, the stage door from the
 * wings, the live demo consoles, what hangs on the back wall, and the
 * lighting truss with its par cans, moving heads and the mirror ball.
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
    (u, y) => ({ at: [u, y, -half], rot: [0, 0, 0] }),
    (u, y) => ({ at: [-half, y, u], rot: [0, Math.PI / 2, 0] }),
    (u, y) => ({ at: [half, y, u], rot: [0, Math.PI / 2, 0] }),
  ];
}

/** A glowing box (an LED strip, a lit sign face), in the glow layer. */
function glowBox(
  b: ModelBuilder,
  w: number,
  h: number,
  d: number,
  color: number,
  place: Place,
): void {
  b.add(new THREE.BoxGeometry(w, h, d), color, place, 'glow');
}

/**
 * A builder that draws into `parent` through a frame (a turn and a move):
 * whatever is built on it lands in the parent placed by `frame`, so a
 * group of pieces (a tablet, a taped sheet) can be tilted as one.
 */
class Framed extends ModelBuilder {
  constructor(
    private readonly parent: ModelBuilder,
    private readonly frame: THREE.Matrix4,
  ) {
    super();
  }

  override add(
    geometry: THREE.BufferGeometry,
    color: number,
    place: Place,
    layer: 'body' | 'glow' | 'glass' = 'body',
  ): this {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(place.at ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(place.rot ?? [0, 0, 0]))),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(m).applyMatrix4(this.frame);
    this.parent.add(geometry, color, {}, layer);
    return this;
  }
}

/** A builder drawing into `b` at `at`, turned by `rot`, grown by `scale`. */
function framed(
  b: ModelBuilder,
  at: [number, number, number],
  rot: [number, number, number],
  scale = 1,
): ModelBuilder {
  return new Framed(
    b,
    new THREE.Matrix4().compose(
      new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(scale, scale, scale),
    ),
  );
}

// ---- Materials ----

/** The flats' dark kick plinth and the black of the set's trim. */
const KICK = 0x222328;
const BLACK = 0x1b1c20;
/** Brushed aluminium: the caps' rails, the flight cases' edging, the truss. */
export const ALU = 0xa3a9b1;
const ALU_LIGHT = 0xc6cbd1;
const ALU_DARK = 0x60656d;
/** YOTTA's violet as an LED (glow, boosted on screen: keep it dim). */
export const YOTTA_GLOW = 0x45288c;
/** The flight cases: black laminate, a lid a shade off, the stencils' grey-white. */
const CASE_BLACK = 0x27282d;
/** The lids: the darkest top in the room, darker than every station top. */
export const CASE_LID = 0x2e3036;
const STENCIL = 0xa6a8ae;
/** Black cable and the gaffer tape over it (a grey that reads on black and on the decks). */
const CABLE = 0x18191c;
const GAFFER = 0x3c3d43;
/** The stage's black fascia and the warm LED line round its top. */
const FASCIA = 0x18191d;
const WARM_LED = 0x6a4416;
/** Spike tape: white, fluorescent yellow and pink; glow tape (a dim glow). */
const SPIKE = [0xd6d6d2, 0xd2dc48, 0xe0609a] as const;
const GLOW_TAPE = 0x334022;
/** The red LIVE tally and a screen's dark backlight. */
const TALLY = 0x8c1414;
const SCREEN_DARK = 0x16142c;

// ---- Walls ----

/** Heights on a flat: the kick plinth, a course of the panelling. */
const KICK_H = 0.09;
const COURSE = 0.21;
/**
 * The cap: a dark top `CAP` thick; under it a brushed aluminium band `BAND`
 * tall, `CAP_LIP` proud of the faces, its top `BAND_SINK` under the cap's.
 */
const CAP = 0.04;
const CAP_LIP = 0.032;
const BAND = 0.034;
const BAND_SINK = 0.004;
/** The band's brushed aluminium, a touch duller than the trim's. */
const CAP_ALU = 0x9ea4ae;
/** Where YOTTA's violet strip runs: just under the band. */
const LED_DROP = BAND + BAND_SINK + 0.016;
/** Looks a flat comes in: plain, a YOTTA stencil, a taped cable, a patched panel, a power port. */
export const STAGE_WALL_LOOKS = 5;

/**
 * The cap on top of a wall `h` tall: one dark top over the whole tile (no
 * panels, no rim on it), and round it a brushed aluminium band a little
 * proud of the faces whose top sits just under the cap's. Where the next
 * wall carries on, the band is buried in that wall's cap, so the light lip
 * only shows along the run's open edges, never as a grid of tiles.
 */
function cap(b: ModelBuilder, h: number): void {
  const { top } = WALL_COLORS.stageSet;
  const lip = 1 + CAP_LIP * 2;
  const bandY = h - BAND_SINK - BAND / 2;
  b.box(lip, BAND, lip, CAP_ALU, { at: [0, bandY, 0] }, 0);
  // The band's dark underside line, where it overhangs the flat.
  b.box(lip - 0.004, 0.006, lip - 0.004, tint(CAP_ALU, -0.45), {
    at: [0, bandY - BAND / 2 - 0.003, 0],
  });
  b.box(1, CAP, 1, top, { at: [0, h - CAP / 2, 0] }, 0);
}

/**
 * The scenery flats' panelling on a face from `y0` to `y1`: a groove every
 * course, the panels' joints staggered course to course, a panel a shade
 * off here and there.
 */
function panelling(b: ModelBuilder, on: Face, y0: number, y1: number, seed: number): void {
  const face = WALL_COLORS.stageSet.face;
  const groove = tint(face, -0.22);
  const courses = Math.max(1, Math.round((y1 - y0) / COURSE));
  const hh = (y1 - y0) / courses;
  for (let i = 0; i < courses; i++) {
    const c0 = y0 + i * hh;
    if (i > 0) b.box(1, 0.008, 0.004, groove, on(0, c0), 0);
    const shift = i % 2 ? 0.25 : 0;
    for (const u of [-0.25 + shift, 0.25 + shift])
      if (u > -0.49 && u < 0.49) b.box(0.008, hh - 0.008, 0.004, groove, on(u, c0 + hh / 2), 0);
    const h = tileHash(i + seed * 7, seed + 13);
    if (h % 4 === 0) {
      const u = -0.25 + shift + 0.5 * ((h >> 3) % 2) - (shift > 0 && (h >> 3) % 2 ? 0.5 : 0);
      if (Math.abs(u) < 0.3)
        b.box(0.47, hh - 0.02, 0.005, tint(face, h % 8 ? 0.06 : -0.05), on(u, c0 + hh / 2), 0);
    }
  }
}

/** The LED channel near the top of a face: a dark recess with YOTTA's violet strip in it. */
function ledStrip(b: ModelBuilder, on: Face, y: number): void {
  b.box(1, 0.036, 0.006, 0x141519, on(0, y), 0);
  const p = on(0, y);
  const [x, yy, z] = p.at ?? [0, 0, 0];
  // Pushed out a hair past the recess, along the face.
  const turned = (p.rot?.[1] ?? 0) !== 0;
  glowBox(b, turned ? 0.008 : 1, 0.016, turned ? 1 : 0.008, YOTTA_GLOW, {
    at: [x + (turned ? Math.sign(x) * 0.003 : 0), yy, z + (turned ? 0 : Math.sign(z) * 0.003)],
  });
}

/**
 * A wall of the demo set: matte charcoal scenery flats, panelled, on a dark
 * kick plinth, YOTTA's violet LED strip in a channel under the brushed
 * aluminium cap. All four faces carry it; `look` adds a stencil, a taped
 * cable, a patched panel or a power port on the faces along the run. The
 * low front wall is a riser in the same flats, its strip and cap.
 */
export function stageWallModel(piece: WallPiece, look: number): Model {
  const { face } = WALL_COLORS.stageSet;
  const b = new ModelBuilder();
  if (piece === 'wall-front') {
    const h = FRONT_WALL_HEIGHT;
    const body = h - CAP;
    b.box(1, body, 1, face, { at: [0, body / 2, 0] }, 0);
    b.box(1.012, 0.045, 1.012, KICK, { at: [0, 0.0225, 0] }, 0);
    for (const on of faces(0.503)) {
      ledStrip(b, on, h - LED_DROP);
      b.box(0.008, body - 0.1, 0.005, tint(face, -0.22), on(-0.5 + 0.5 * (look % 2), 0.075), 0);
    }
    cap(b, h);
    return b.build();
  }
  const h = WALL_HEIGHT;
  const body = h - CAP;
  const stripY = h - LED_DROP;
  b.box(1, body, 1, face, { at: [0, body / 2, 0] }, 0);
  b.box(1.016, KICK_H, 1.016, KICK, { at: [0, KICK_H / 2, 0] }, 0.004);
  b.box(1.02, 0.008, 1.02, tint(KICK, 0.25), { at: [0, KICK_H, 0] }, 0);
  faces(0.503).forEach((on, f) => {
    panelling(b, on, KICK_H, stripY - 0.03, look * 4 + f);
    ledStrip(b, on, stripY);
    if (f >= 2) return;
    const mark = (w: number, hh: number, color: number, u: number, y: number, turn = 0) => {
      const p = on(u, y);
      b.box(w, hh, 0.007, color, { at: p.at, rot: [0, p.rot?.[1] ?? 0, turn] }, 0);
    };
    if (look === 1) {
      // The set's own stencil: YOTTA and the flat's number, sprayed on.
      const p = on(0.12, 0.42);
      const [x, y, z] = p.at ?? [0, 0, 0];
      if (f === 0) {
        lettering(b, 'YOTTA', x, y, z, 0.013, STENCIL, 0.002);
        lettering(b, 'F-07', x, y - 0.1, z, 0.01, tint(STENCIL, -0.2), 0.002);
      }
    } else if (look === 2) {
      // A cable down from the LED channel to the plinth, gaffer-taped flat.
      mark(0.022, stripY - KICK_H - 0.04, CABLE, 0.34, (stripY + KICK_H) / 2 - 0.01);
      for (const y of [stripY - 0.12, (stripY + KICK_H) / 2, KICK_H + 0.1])
        mark(0.09, 0.035, GAFFER, 0.34, y, 0.05);
    } else if (look === 3) {
      // Scuffs where flight cases bumped it, a strip of tape over a ding.
      for (const [u, y, w, r] of [
        [-0.28, KICK_H + 0.07, 0.18, 0.06],
        [-0.12, KICK_H + 0.04, 0.1, -0.04],
        [0.24, KICK_H + 0.11, 0.08, 0.1],
      ] as const)
        mark(w, 0.016, tint(face, 0.16), u, y, r);
      mark(0.12, 0.035, GAFFER, 0.2, 0.62, -0.08);
    } else if (look === 4) {
      // A power and DMX port on the plinth, its LED on.
      mark(0.16, 0.07, 0x3a3c42, -0.3, KICK_H + 0.05);
      for (const u of [-0.34, -0.26]) mark(0.03, 0.03, 0x15161a, u, KICK_H + 0.05);
      const p = on(-0.24, KICK_H + 0.07);
      b.led(0.006, 0x2ea05a, p);
    }
  });
  cap(b, h);
  return b.build();
}

// ---- The stage's fascia under the room ----

/** Looks the fascia comes in: plain pleats, a footlight, a tape label. */
export const STAGE_FASCIA_LOOKS = 3;

/**
 * The stage itself under each tile, the diorama's base: a black pleated
 * skirt hung from a black nosing, a thin warm LED line round the deck's
 * edge, and by `look` a small footlight or a tape label on it.
 */
export function stageFasciaModel(look: number): Model {
  const b = new ModelBuilder();
  const top = -0.013;
  const bottom = top - SLAB_DEPTH;
  b.box(1.002, SLAB_DEPTH, 1.002, FASCIA, { at: [0, top - SLAB_DEPTH / 2, 0] }, 0);
  b.box(1.012, 0.028, 1.012, 0x2a2b30, { at: [0, top - 0.014, 0] }, 0);
  // A white nosing line along the deck's edge, like the stage lip's out front.
  b.box(1.014, 0.008, 1.014, 0xc8c8c4, { at: [0, top - 0.006, 0] }, 0);
  faces(0.506).forEach((on, f) => {
    const p = on(0, top - 0.04);
    const [x, y, z] = p.at ?? [0, 0, 0];
    const turned = f >= 2;
    glowBox(b, turned ? 0.004 : 1, 0.01, turned ? 1 : 0.004, WARM_LED, { at: [x, y, z] });
    // The skirt's pleats: lighter folds catching the wash, darker between.
    const skirt = SLAB_DEPTH - 0.08;
    for (let k = 0; k < 10; k++)
      b.box(
        0.045,
        skirt,
        0.004,
        tint(FASCIA, k % 2 ? 0.22 : -0.15),
        on(-0.45 + k * 0.1, top - 0.055 - skirt / 2),
        0,
      );
    if (look === 1 && f < 2) {
      // A footlight: a little black hood on the nosing, its warm lens lit.
      b.box(0.16, 0.05, 0.05, BLACK, on(0.2, top - 0.075), 0.01);
      const lens = on(0.2, top - 0.08);
      const [lx, ly, lz] = lens.at ?? [0, 0, 0];
      glowBox(b, 0.12, 0.022, 0.004, 0x7a5420, { at: [lx, ly, lz + Math.sign(lz) * 0.026] });
    } else if (look === 2 && f < 2) {
      // A strip of white tape with a scrawled label.
      b.box(0.15, 0.035, 0.004, 0xbcbcb6, on(-0.28, top - 0.12), 0);
      b.box(0.1, 0.006, 0.005, 0x3a3b40, on(-0.29, top - 0.118), 0);
    }
    b.box(1.004, 0.03, 0.005, 0x0f1012, on(0, bottom + 0.015), 0);
  });
  return b.build();
}

// ---- Stage decks ----

/** Variants a deck tile comes in (spike mark shape and turn, paint wear), picked by its hash. */
const DECK_VARIANTS = 8;

/** Whether tile (x, y) starts a deck: decks two tiles long across, each row staggered by one. */
function deckStart(x: number, y: number): boolean {
  return (((x + (y & 1)) % 2) + 2) % 2 === 0;
}

/** A floor look: its wear, its variant, whether a deck joint runs along its −x edge. */
export function deckLook(x: number, y: number, wear: number): number {
  const variant = (tileHash(x + 5, y + 9) >>> 3) % DECK_VARIANTS;
  return ((wear * DECK_VARIANTS + variant) << 1) | (deckStart(x, y) ? 1 : 0);
}

/** A tile's brightness: ±5% per deck (each a sheet painted on its own), a touch per tile. */
export function deckTone(x: number, y: number, salt: number): number {
  const dx = Math.floor((x + (y & 1)) / 2);
  const deck = ((Math.imul(dx + 41, 73856093) ^ Math.imul(y + 7, 19349663) ^ salt) >>> 0) % 1001;
  const own = (tileHash(x + 3, y + 5) ^ salt) % 101;
  return 1 + (deck / 1000 - 0.5) * 0.1 + (own / 100 - 0.5) * 0.006;
}

/**
 * A floor tile of painted stage deck (`look` from `deckLook`): dark grey
 * paint, thin lighter joints where decks meet (and screws along them),
 * flecks of old tape residue and paint, and its wear (see `DECK_WEAR`).
 */
export function deckFloorModel(look: number): Model {
  const [base, joint] = FLOOR_COLORS.stageDeck;
  const jx = (look & 1) === 1;
  const variant = (look >> 1) % DECK_VARIANTS;
  const wear = Math.floor((look >> 1) / DECK_VARIANTS) % DECK_WEAR_KINDS;
  const b = new ModelBuilder();
  b.box(1, 0.012, 1, base, { at: [0, -0.006, 0] }, 0);
  const mark = (w: number, d: number, color: number, x: number, z: number, y = 0.0012, turn = 0) =>
    b.box(w, 0.002, d, color, { at: [x, y, z], rot: [0, turn, 0] }, 0);
  // The joints: every row starts its decks, each deck two tiles long.
  mark(1, 0.012, joint, 0, -0.494, 0.0016);
  mark(1, 0.006, tint(base, -0.18), 0, -0.484, 0.0016);
  if (jx) {
    mark(0.012, 1, joint, -0.494, 0, 0.0016);
    mark(0.006, 1, tint(base, -0.18), -0.484, 0, 0.0016);
  }
  // Screws along the deck's edges, faint.
  const screw = tint(base, -0.14);
  for (const u of [-0.3, 0.2]) mark(0.014, 0.014, screw, u, -0.465, 0.0018);
  if (jx) for (const u of [-0.25, 0.25]) mark(0.014, 0.014, screw, -0.465, u, 0.0018);
  // Now and then a fleck of old tape residue, dull (no light speckle over the play area).
  if (variant % 4 === 0) {
    const k = tileHash(variant + 9, 3);
    mark(0.04, 0.022, tint(base, -0.1), ((k >> 3) % 70) / 100 - 0.35, ((k >> 9) % 70) / 100 - 0.35);
  }
  if (wear >= DECK_WEAR.cable) {
    floorCable(b, wear - DECK_WEAR.cable);
    return b.build();
  }
  switch (wear) {
    case DECK_WEAR.spikeWhite:
    case DECK_WEAR.spikeYellow:
    case DECK_WEAR.spikePink: {
      // A small T or L of spike tape near a corner, a touch see-through (mixed into the paint).
      const color = mix(base, SPIKE[wear - DECK_WEAR.spikeWhite] ?? SPIKE[0], 0.72);
      const tee = (variant & 1) === 1;
      const turn = ((variant >> 1) % 4) * (Math.PI / 2);
      const corners: readonly (readonly [number, number])[] = [
        [0.26, 0.26],
        [-0.26, 0.26],
        [-0.26, -0.24],
        [0.26, -0.24],
      ];
      const [cx, cz] = corners[(variant >> 1) % 4] ?? [0.26, 0.26];
      const at = (u: number, v: number): [number, number] => [
        cx + u * Math.cos(turn) + v * Math.sin(turn),
        cz - u * Math.sin(turn) + v * Math.cos(turn),
      ];
      const [ax, az] = at(0, 0);
      mark(0.15, 0.032, color, ax, az, 0.0024, turn);
      const [bx, bz] = tee ? at(0, 0.075) : at(-0.06, 0.06);
      mark(0.032, 0.12, color, bx, bz, 0.0026, turn);
      break;
    }
    case DECK_WEAR.glowFront: {
      // Glow tape along the lip: a dash near the front edge, glowing faintly.
      b.add(new THREE.BoxGeometry(0.34, 0.003, 0.03), GLOW_TAPE, { at: [0, 0.0016, 0.43] }, 'glow');
      break;
    }
    case DECK_WEAR.spikeX: {
      // A spike-tape X where something gets set for the next act, white, a touch see-through.
      const color = mix(base, SPIKE[0], 0.6);
      for (const r of [Math.PI / 4, -Math.PI / 4]) mark(0.32, 0.03, color, 0, 0, 0.0024, r);
      break;
    }
    case DECK_WEAR.scuffs: {
      // Black rubber scuffs where people pivot, on a duller patch.
      mark(0.6, 0.5, tint(base, 0.03), 0, 0.04, 0.0018);
      for (const [x, z, r] of [
        [-0.14, 0.12, 0.6],
        [0.16, 0.02, -0.5],
        [0.02, -0.16, 0.15],
        [-0.04, 0.24, -0.2],
      ] as const)
        mark(0.2, 0.014, tint(base, -0.3), x, z, 0.002, r);
      break;
    }
  }
  return b.build();
}

/** The floor cable's black, the grey gaffer over it, a cable ramp's yellow and black. */
const FLOOR_CABLE = 0x2a2b30;
const FLOOR_GAFFER = 0x8a8c94;
const RAMP_YELLOW = 0xd8b020;
const RAMP_BLACK = 0x1a1a1a;

/**
 * A cable taped flat along one edge of a deck tile (`kind`, see
 * `CABLE_PARTS`): hugging the edge it runs along (a wall or a door is past
 * that edge), a strip of grey gaffer every half tile, and by its part a
 * stage box where it ends or a yellow and black cable ramp over it.
 */
function floorCable(b: ModelBuilder, kind: number): void {
  const edge = Math.floor(kind / CABLE_PARTS) % 4;
  const part = kind % CABLE_PARTS;
  // Along x on the back (0) and front (1) edges, along z on the left (2) and right (3); on the
  // front a little further in, or the low wall in front of it hides it from the camera.
  const alongX = edge < 2;
  const off = [-0.42, 0.24, -0.42, 0.42][edge] ?? 0.42;
  const pos = (u: number, v: number): [number, number] => (alongX ? [u, v] : [v, u]);
  const turn = alongX ? 0 : Math.PI / 2;
  const box = part === 1 || part === 2;
  const end = part === 1 || part === 3 ? 1 : -1;
  const [u0, u1] = box ? (end > 0 ? [-0.5, 0.2] : [-0.2, 0.5]) : [-0.5, 0.5];
  const [mx, mz] = pos((u0 + u1) / 2, off);
  b.box(u1 - u0, 0.012, 0.05, FLOOR_CABLE, { at: [mx, 0.006, mz], rot: [0, turn, 0] }, 0);
  for (const u of [-0.25, 0.25]) {
    if (u < u0 || u > u1) continue;
    const [tx, tz] = pos(u, off);
    b.box(0.06, 0.004, 0.09, FLOOR_GAFFER, { at: [tx, 0.013, tz], rot: [0, turn, 0] }, 0);
  }
  if (box) {
    // The stage box at the cable's end, tight to the edge, its connectors and LED.
    const [sx, sz] = pos(end * 0.3, off + (off > 0 ? -0.04 : 0.04));
    b.box(0.22, 0.08, 0.15, CASE_BLACK, { at: [sx, 0.04, sz], rot: [0, turn, 0] }, 0.012);
    b.box(0.224, 0.012, 0.154, ALU_DARK, { at: [sx, 0.078, sz], rot: [0, turn, 0] }, 0);
    for (const k of [-0.06, 0, 0.06]) {
      const [cx, cz] = pos(end * 0.3 + k, off + (off > 0 ? -0.04 : 0.04));
      b.cylinder(0.014, 0.014, 0.006, 0x8a9098, { at: [cx, 0.087, cz] }, 10);
    }
  } else if (part >= 3) {
    // A cable ramp across it where feet cross: black, yellow chevrons on its slopes.
    const [rx, rz] = pos(end * 0.3, off + (off > 0 ? -0.03 : 0.03));
    b.box(0.26, 0.026, 0.16, RAMP_BLACK, { at: [rx, 0.013, rz], rot: [0, turn, 0] }, 0.008);
    for (const k of [-0.08, 0, 0.08]) {
      const [yx, yz] = pos(end * 0.3 + k, off + (off > 0 ? -0.03 : 0.03));
      b.box(0.045, 0.004, 0.15, RAMP_YELLOW, { at: [yx, 0.027, yz], rot: [0, turn, 0] }, 0);
    }
  }
}

// ---- Flight cases ----

/** How tall the caster board under a case stands. */
const CASTER = 0.06;
/** A case's depth across the run. */
const CASE_DEPTH = 0.9;

/**
 * A counter as a black flight case, built from where it sits in its run of
 * counters (x along the run): the run is a row of cases two tiles long
 * (a seam at the run's ends and at each `legs` tile but the last), each
 * with aluminium edging along its edges and at its seams, ball corners on
 * top, butterfly latches beside its seams, a handle dish on its middle
 * tile, on a caster board; the run's end tiles carry a YOTTA and a FRAGILE
 * stencil. The lid is the darkest top in the room.
 */
export function flightCaseCounter(run: CounterRun): StationModel {
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  const { minusEnd, plusEnd } = run;
  const seam = minusEnd || (run.legs && !plusEnd);
  const x0 = minusEnd ? -0.47 : -0.5;
  const x1 = plusEnd ? 0.47 : 0.5;
  const mid = (x0 + x1) / 2;
  const len = x1 - x0;
  const d = CASE_DEPTH;
  const h = top - CASTER;
  // The caster board and, under the case's ends, its castors.
  b.box(len, CASTER - 0.01, d - 0.08, 0x141518, { at: [mid, CASTER / 2, 0] }, 0);
  if (seam || plusEnd)
    for (const z of [-0.33, 0.33]) {
      const x = seam ? x0 + 0.12 : x1 - 0.12;
      b.cylinder(0.03, 0.03, 0.025, 0x3a3c42, { at: [x, 0.03, z], rot: [Math.PI / 2, 0, 0] }, 10);
    }
  // The case and its lid: one body along the run, the lid's line a little under the top.
  b.box(len, h - 0.07, d, CASE_BLACK, { at: [mid, CASTER + (h - 0.07) / 2, 0] }, 0);
  b.box(len, 0.07, d, CASE_LID, { at: [mid, top - 0.035, 0] }, 0);
  // Aluminium edging: along the top and bottom edges, the lid line, and up each seam.
  const edge = 0.022;
  for (const s of [-1, 1]) {
    const z = s * (d / 2 - edge / 2 + 0.003);
    b.box(len, edge, edge, ALU, { at: [mid, top - edge / 2, z] }, 0);
    b.box(len, edge, edge, ALU, { at: [mid, CASTER + edge / 2, z] }, 0);
    b.box(len, 0.012, edge, ALU_DARK, { at: [mid, top - 0.072, z] }, 0);
  }
  b.box(len, 0.004, d - 0.04, tint(CASE_LID, -0.08), { at: [mid, top + 0.001, 0] }, 0);
  const seamAt = (x: number, sx: number) => {
    for (const s of [-1, 1]) {
      const z = s * (d / 2 - edge / 2 + 0.003);
      b.box(edge, h, edge, ALU, { at: [x, CASTER + h / 2, z] }, 0);
      // The ball corner on top, the latch beside the seam on each long face.
      b.sphere(0.026, ALU_LIGHT, { at: [x, top + 0.004, z] });
      b.box(
        0.07,
        0.05,
        0.014,
        ALU,
        { at: [x + sx * 0.12, top - 0.09, s * (d / 2 + 0.006)] },
        0.006,
      );
      b.box(
        0.04,
        0.012,
        0.016,
        ALU_DARK,
        { at: [x + sx * 0.12, top - 0.075, s * (d / 2 + 0.008)] },
        0,
      );
    }
    b.box(edge, 0.006, d, ALU, { at: [x, top + 0.003, 0] }, 0);
  };
  if (seam) {
    seamAt(x0 + edge / 2, 1);
    // A strip of grey gaffer across the lid with the crew's white label on it.
    b.box(0.07, 0.004, d - 0.1, GAFFER, { at: [x0 + 0.3, top + 0.003, 0] }, 0);
    b.box(0.06, 0.005, 0.16, 0xbcbcb4, { at: [x0 + 0.3, top + 0.004, 0.22] }, 0);
    b.box(0.012, 0.006, 0.1, 0x3a3b40, { at: [x0 + 0.3, top + 0.0045, 0.22] }, 0);
  }
  if (plusEnd) seamAt(x1 - edge / 2, -1);
  if (!seam && !plusEnd)
    for (const s of [-1, 1]) {
      // The handle dish in the middle of the case's face.
      b.box(0.15, 0.08, 0.008, ALU_DARK, { at: [0, CASTER + h * 0.5, s * (d / 2 + 0.003)] }, 0);
      b.box(0.1, 0.016, 0.02, ALU, { at: [0, CASTER + h * 0.5 + 0.015, s * (d / 2 + 0.01)] }, 0);
    }
  // Stencils on the run's ends: YOTTA at one, FRAGILE at the other (and both on a lone case).
  const stencil = (text: string, x: number, px: number) => {
    lettering(b, text, x, CASTER + h * 0.45, d / 2 + 0.004, px, STENCIL, 0.002);
  };
  if (plusEnd && !minusEnd) stencil('YOTTA', -0.08, 0.018);
  if (minusEnd && !plusEnd) stencil('FRAGILE', 0.14, 0.01);
  if (minusEnd && plusEnd) stencil('YOTTA', 0, 0.016);
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

// ---- The stage door ----

/** The wings' blue working light, seen through the drape. */
const WINGS_BLUE = 0x1a2c5c;

/** A black portal with aluminium edging round an opening `span` wide (opening toward −z). */
function portal(b: ModelBuilder, span: number, top: number): void {
  const half = span / 2;
  for (const s of [-1, 1]) {
    b.box(0.1, top, 0.16, BLACK, { at: [s * (half - 0.05), top / 2, -0.36] }, 0.008);
    b.box(0.014, top - 0.01, 0.164, ALU, { at: [s * (half - 0.1), (top - 0.01) / 2, -0.36] }, 0);
  }
  b.box(span + 0.02, 0.17, 0.18, BLACK, { at: [0, top - 0.085, -0.36] }, 0.01);
  b.box(span + 0.02, 0.014, 0.184, ALU, { at: [0, top - 0.17, -0.36] }, 0);
  glowBox(b, span - 0.1, 0.011, 0.006, YOTTA_GLOW, { at: [0, top - 0.06, -0.268] });
}

/** A lightbox sign standing on a lintel at height `y`: housing, lit face, letters. */
function lightbox(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  face: number,
  px: number,
): void {
  for (const s of [-1, 1])
    b.box(0.02, 0.05, 0.02, ALU_DARK, { at: [x + s * (w / 2 - 0.06), y - h / 2 - 0.02, z] }, 0);
  b.box(w, h, 0.07, BLACK, { at: [x, y, z] }, 0.012);
  glowBox(b, w - 0.04, h - 0.04, 0.004, face, { at: [x, y, z + 0.036] });
  lettering(b, text, x, y, z + 0.038, px, 0xf6f2ff, 0.003);
}

/**
 * The stage door from the wings round the inbox (`span` tiles wide), its
 * opening toward −z: a black portal with aluminium edging and the violet
 * strip across its lintel, the black masking drape of the wings behind in
 * folds with a slit of blue working light, a lit "Q&A" lightbox on the
 * lintel (turned back by `yaw` to face the camera whatever wall it is on),
 * and on the wall beside it a tablet showing "Q&A · 12 new". On the
 * front edge, which the camera looks over, only low posts and the tablet.
 */
export function stageDoorModel(span: number, low: boolean, yaw = 0): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  if (low) {
    for (const s of [-1, 1])
      b.box(0.08, 0.36, 0.1, BLACK, { at: [s * (half + 0.04), 0.18, 0.45] }, 0.01);
    qaTablet(b, -half - 0.4, 0.3, 0.42, true);
    return b.build();
  }
  const top = WALL_HEIGHT;
  const dh = top - STATION_HEIGHT;
  // The drape: folds across the opening, a slit where two meet with the blue light through it.
  const folds = Math.round(span * 9);
  for (let i = 0; i < folds; i++) {
    const u = -half + 0.1 + ((i + 0.5) * (span - 0.2)) / folds;
    b.box(
      (span - 0.2) / folds + 0.004,
      dh,
      0.03,
      i % 2 ? 0x24252b : 0x17181c,
      { at: [u, STATION_HEIGHT + dh / 2, i % 2 ? -0.46 : -0.475] },
      0,
    );
  }
  glowBox(b, 0.035, dh - 0.04, 0.004, WINGS_BLUE, {
    at: [half * 0.3, STATION_HEIGHT + dh / 2, -0.44],
  });
  portal(b, span, top);
  // The sign turned back square to the camera (by −`yaw`, the door's own turn) on a side wall.
  const sign = framed(b, [0, top + 0.13, -0.36], [0, -yaw, 0]);
  lightbox(sign, 'Q&A', 0, 0, 0, 0.5, 0.2, 0x3a2278, 0.03);
  qaTablet(b, -half - 0.32, 0.74, 0.5, false);
  return b.build();
}

/**
 * The Q&A tablet on a wall face at z (facing +z): a dark bezel, a violet
 * header with "Q&A", "12 NEW" in big figures with a red badge, and three
 * questions waiting below. Lying back on a stand when `flat`.
 */
function qaTablet(b: ModelBuilder, x: number, y: number, z: number, flat: boolean): void {
  const g = framed(b, [x, y, z], [flat ? -0.9 : 0, 0, 0]);
  g.box(0.32, 0.23, 0.016, BLACK, { at: [0, 0, 0.008] }, 0.008);
  g.screen(0.29, 0.2, SCREEN_DARK, { at: [0, 0, 0.0165] });
  glowBox(g, 0.29, 0.045, 0.002, 0x3a2278, { at: [0, 0.077, 0.018] });
  lettering(g, 'Q&A', -0.08, 0.077, 0.019, 0.008, 0xf6f2ff, 0.002);
  lettering(g, '12 NEW', -0.02, 0.02, 0.018, 0.011, 0xf6f2ff, 0.002);
  g.add(new THREE.CircleGeometry(0.018, 14), TALLY, { at: [0.11, 0.025, 0.019] }, 'glow');
  for (let i = 0; i < 3; i++) {
    glowBox(g, 0.2 - (i % 2) * 0.05, 0.016, 0.002, 0x2a3358, {
      at: [0.01 - (i % 2) * 0.025, -0.03 - i * 0.028, 0.018],
    });
    g.add(
      new THREE.CircleGeometry(0.009, 10),
      0x4a3a88,
      { at: [-0.11, -0.03 - i * 0.028, 0.019] },
      'glow',
    );
  }
}

// ---- The live demo consoles ----

/**
 * A thick black cable snake through `points` ([x, y, z]), a second thinner
 * cable bundled along it, a band of gaffer tape every `tape` along.
 */
function cableSnake(
  b: ModelBuilder,
  points: readonly [number, number, number][],
  tape = 0.14,
): void {
  let since = tape / 2;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = new THREE.Vector3(...(points[i] ?? [0, 0, 0]));
    const c = new THREE.Vector3(...(points[i + 1] ?? [0, 0, 0]));
    const dir = c.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    const e = new THREE.Euler().setFromQuaternion(q);
    const at = (t: number, off = 0): [number, number, number] => [
      a.x + (c.x - a.x) * t,
      a.y + (c.y - a.y) * t + off,
      a.z + (c.z - a.z) * t,
    ];
    b.cylinder(0.02, 0.02, len + 0.02, CABLE, { at: at(0.5), rot: [e.x, e.y, e.z] }, 8);
    b.cylinder(0.01, 0.01, len + 0.01, 0x2a2c33, { at: at(0.5, 0.022), rot: [e.x, e.y, e.z] }, 6);
    for (let s = since; s < len; s += tape)
      b.cylinder(0.025, 0.025, 0.035, GAFFER, { at: at(s / len, 0.008), rot: [e.x, e.y, e.z] }, 8);
    since = (((since - len) % tape) + tape) % tape;
  }
}

/** How much the front console's desk is grown. */
const DESK_SCALE = 1.45;

/** The red LIVE tally box at (x, y, z) facing +z, `w` wide. */
function liveTally(b: ModelBuilder, x: number, y: number, z: number, w: number, px: number): void {
  b.box(w, w * 0.42, 0.06, BLACK, { at: [x, y, z] }, 0.01);
  glowBox(b, w - 0.03, w * 0.42 - 0.03, 0.004, TALLY, { at: [x, y, z + 0.031] });
  lettering(b, 'LIVE', x, y, z + 0.033, px, 0xffe8e0, 0.003);
}

/**
 * The live demo console at a ship hatch on the front edge: low, as
 * everything in front must be. On the wall top beside the hatch (`deskX`
 * along from its middle) the demo desk: a small flight case with
 * the demo laptop open toward the stage (YOTTA's logo lit on its lid), the
 * red LIVE tally, and the cable snake off the back of the case, over the
 * lip and down the fascia.
 */
export function liveConsoleFrontModel(deskX: number | null): Model {
  const b = new ModelBuilder();
  if (deskX === null) return b.build();
  const s = Math.sign(deskX) || 1;
  // The desk, grown so it reads from the couch, still under 0.6 with the lid up.
  const d = framed(b, [deskX, FRONT_WALL_HEIGHT, 0], [0, 0, 0], DESK_SCALE);
  d.box(0.5, 0.08, 0.4, CASE_BLACK, { at: [0, 0.04, -0.03] }, 0.012);
  for (const z of [-0.23, 0.17]) d.box(0.5, 0.014, 0.014, ALU, { at: [0, 0.074, z] }, 0);
  for (const e of [-1, 1]) d.sphere(0.016, ALU_LIGHT, { at: [e * 0.245, 0.078, 0.17] });
  // The laptop on the case, open toward the hatch, where the founder ships from.
  const lap = framed(d, [-s * 0.07, 0.08, -0.04], [0, s * (Math.PI / 2), 0]);
  lap.box(0.28, 0.014, 0.2, 0x3a3d44, { at: [0, 0.007, 0] }, 0.006);
  const lid = framed(lap, [0, 0.01, 0.1], [0.3, 0, 0]);
  lid.box(0.28, 0.17, 0.012, 0x3a3d44, { at: [0, 0.085, 0] }, 0.006);
  lid.add(
    new THREE.TorusGeometry(0.03, 0.008, 6, 18),
    YOTTA_GLOW,
    { at: [0, 0.09, 0.007] },
    'glow',
  );
  // The screen: the product, live (a violet header, cards).
  lid.add(
    new THREE.PlaneGeometry(0.25, 0.15),
    0x221a4a,
    { at: [0, 0.085, -0.0065], rot: [0, Math.PI, 0] },
    'glow',
  );
  glowBox(lid, 0.25, 0.03, 0.002, 0x4a2c96, { at: [0, 0.145, -0.008] });
  for (const u of [-0.07, 0.02, 0.09])
    glowBox(lid, 0.06, 0.07, 0.002, 0x3a3f68, { at: [u, 0.07, -0.008] });
  // The LIVE tally on the case's outer corner, facing the camera, and the clicker.
  liveTally(d, s * 0.16, 0.08 + 0.045, 0.09, 0.2, 0.013);
  d.box(0.04, 0.012, 0.08, 0x2a2c33, { at: [s * 0.15, 0.086, -0.15], rot: [0, 0.4, 0] }, 0.005);
  // The cable snake: off the back of the case, round, over the lip and down the fascia.
  const cx = -s * 0.12;
  cableSnake(d, [
    [cx, 0.03, -0.24],
    [cx - s * 0.08, 0.015, -0.32],
    [cx - s * 0.16, 0.015, -0.1],
    [cx - s * 0.16, 0.015, 0.25],
    [cx - s * 0.13, 0.0, 0.36],
    [cx - s * 0.13, -0.3, 0.38],
  ]);
  return b.build();
}

/**
 * The live demo console at a ship hatch on a back or side edge (opening
 * toward −z), right under the big screen: the black portal with the violet
 * strip, a big red LIVE tally on its lintel, and the cable snake up over
 * the wall to the screen behind.
 */
export function liveConsoleTallModel(span: number): Model {
  const b = new ModelBuilder();
  const top = WALL_HEIGHT;
  const half = span / 2;
  portal(b, span, top);
  liveTally(b, 0, top + 0.17, -0.3, 0.62, 0.032);
  cableSnake(b, [
    [half - 0.16, STATION_HEIGHT + 0.02, -0.3],
    [half - 0.16, top - 0.02, -0.3],
    [half - 0.24, top + 0.06, -0.5],
    [half - 0.3, top + 0.02, -0.8],
    [half - 0.3, top - 0.4, -0.95],
  ]);
  return b.build();
}

// ---- What hangs on the back wall ----

/**
 * Things hung on the demo set's back wall (all in front of z = 0.5), by
 * name, for the room's story pieces (see `stageSetRoom`); the LED panel
 * spans two tiles, centred between them.
 */
export const STAGE_WALL_ART: Readonly<Record<string, () => Model>> = {
  ledPanel: () => {
    // A small LED video wall: six cabinets, YOTTA's logo and LIVE DEMO.
    const b = new ModelBuilder();
    const w = STAGE_ART_HALF.ledPanel * 2;
    const [h, cy] = [0.6, 0.76];
    b.box(w, h, 0.06, BLACK, { at: [0, cy, 0.53] }, 0.01);
    b.screen(w - 0.04, h - 0.04, 0x150e32, { at: [0, cy, 0.5615] });
    // The cabinets' seams.
    for (const u of [-w / 6, w / 6])
      b.box(0.008, h - 0.04, 0.004, 0x08080c, { at: [u, cy, 0.564] }, 0);
    b.box(w - 0.04, 0.008, 0.004, 0x08080c, { at: [0, cy, 0.564] }, 0);
    // The logo: a violet ring with a dot, the name beside it, LIVE DEMO under.
    b.add(
      new THREE.TorusGeometry(0.1, 0.024, 8, 28),
      0x5a36b0,
      { at: [-0.52, cy + 0.05, 0.566] },
      'glow',
    );
    b.add(new THREE.CircleGeometry(0.03, 14), 0x6a48c8, { at: [-0.52, cy + 0.05, 0.565] }, 'glow');
    lettering(b, 'YOTTA', 0.1, cy + 0.06, 0.563, 0.036, 0xeee8ff, 0.004);
    lettering(b, 'LIVE DEMO', 0.1, cy - 0.17, 0.563, 0.014, 0xc4a8ff, 0.003);
    glowBox(b, 0.08, 0.04, 0.003, TALLY, { at: [-0.52, cy - 0.17, 0.565] });
    return b.build();
  },
  confidence: () => {
    // The confidence monitor on a wall arm, showing the next slide: TRACTION and a growth chart.
    const b = new ModelBuilder();
    const cy = 0.78;
    b.box(0.08, 0.12, 0.06, BLACK, { at: [0, cy, 0.53] }, 0.006);
    b.box(0.68, 0.42, 0.04, BLACK, { at: [0, cy, 0.57] }, 0.012);
    b.screen(0.64, 0.38, SCREEN_DARK, { at: [0, cy, 0.5905] });
    glowBox(b, 0.64, 0.06, 0.002, 0x3a2278, { at: [0, cy + 0.16, 0.592] });
    lettering(b, 'TRACTION', -0.1, cy + 0.16, 0.592, 0.011, 0xf0ecff, 0.002);
    // NEXT, in amber, in the corner.
    b.box(0.12, 0.045, 0.003, 0x5a3a10, { at: [0.24, cy + 0.16, 0.5925] }, 0);
    lettering(b, 'NEXT', 0.24, cy + 0.16, 0.593, 0.008, 0xffc066, 0.002);
    // The chart: rising bars and an arrow up past them.
    for (let i = 0; i < 4; i++) {
      const bh = 0.05 + i * 0.045;
      glowBox(b, 0.06, bh, 0.002, i === 3 ? 0x6a46c8 : 0x3e2c80, {
        at: [-0.2 + i * 0.09, cy - 0.15 + bh / 2, 0.592],
      });
    }
    b.add(
      new THREE.ConeGeometry(0.03, 0.06, 3),
      0x9a7ae8,
      { at: [0.17, cy + 0.06, 0.593], rot: [0, 0, -0.6] },
      'glow',
    );
    glowBox(b, 0.012, 0.25, 0.002, 0x7a5ad8, { at: [0.07, cy - 0.04, 0.592], rot: [0, 0, -0.95] });
    for (let i = 0; i < 2; i++)
      glowBox(b, 0.16, 0.014, 0.002, 0x3a3a62, { at: [0.2, cy - 0.06 - i * 0.04, 0.592] });
    return b.build();
  },
  setList: () => {
    // The running order, printed, gaffer-taped at its corners, the demo highlighted.
    const b = new ModelBuilder();
    const g = framed(b, [0, 0.66, 0.506], [0, 0, 0.05]);
    g.box(0.3, 0.4, 0.004, 0xd2cfc4, { at: [0, 0, 0] }, 0);
    lettering(g, 'SET LIST', 0, 0.14, 0.002, 0.008, 0x2a2b30, 0.002);
    g.box(0.24, 0.006, 0.003, 0x2a2b30, { at: [0, 0.11, 0.003] }, 0);
    g.box(0.24, 0.04, 0.003, 0xc8a8d8, { at: [0, -0.01, 0.0025] }, 0);
    for (const [i, line] of ['1 INTRO', '2 DEMO', '3 ASK', '4 Q&A'].entries())
      lettering(g, line, -0.02, 0.06 - i * 0.07, 0.003, 0.007, 0x2a2b30, 0.002);
    for (const [x, y, r] of [
      [-0.14, 0.19, 0.7],
      [0.14, 0.19, -0.7],
      [-0.14, -0.19, -0.7],
      [0.14, -0.19, 0.7],
    ] as const)
      g.box(0.11, 0.035, 0.005, GAFFER, { at: [x, y, 0.004], rot: [0, 0, r] }, 0);
    return b.build();
  },
  fireExit: () => {
    // The fire exit pictogram, high up: a running figure, a door, an arrow, lit green.
    const b = new ModelBuilder();
    const cy = 0.94;
    const z = 0.53;
    b.box(0.32, 0.15, 0.04, 0xc8ccc6, { at: [0, cy, z] }, 0.008);
    glowBox(b, 0.29, 0.12, 0.004, 0x17533a, { at: [0, cy, z + 0.021] });
    const white = 0xeef0ea;
    const f = z + 0.024;
    // The door, an outline.
    b.box(0.006, 0.08, 0.004, white, { at: [0.07, cy, f] }, 0);
    b.box(0.006, 0.08, 0.004, white, { at: [0.12, cy, f] }, 0);
    b.box(0.056, 0.006, 0.004, white, { at: [0.095, cy + 0.04, f] }, 0);
    // The figure running into it.
    b.box(0.018, 0.018, 0.004, white, { at: [0.01, cy + 0.035, f] }, 0);
    b.box(0.014, 0.045, 0.004, white, { at: [0.0, cy + 0.005, f], rot: [0, 0, -0.4] }, 0);
    b.box(0.012, 0.04, 0.004, white, { at: [0.016, cy - 0.03, f], rot: [0, 0, 0.6] }, 0);
    b.box(0.012, 0.04, 0.004, white, { at: [-0.018, cy - 0.028, f], rot: [0, 0, -0.7] }, 0);
    b.box(0.04, 0.01, 0.004, white, { at: [0.0, cy + 0.012, f], rot: [0, 0, 0.3] }, 0);
    // The arrow.
    b.box(0.05, 0.012, 0.004, white, { at: [-0.08, cy, f] }, 0);
    b.add(new THREE.ConeGeometry(0.018, 0.03, 3), white, {
      at: [-0.11, cy, f],
      rot: [0, 0, Math.PI / 2],
    });
    return b.build();
  },
};

// ---- The lighting truss ----

/** The box truss: its size across, its chords' radius, a lacing bar's thickness. */
const TRUSS = 0.13;
const CHORD = 0.011;
const LACE = 0.007;

/** A straight box truss from `a` to `b` (along one axis), its chords, lacing and end blocks. */
function trussRun(b: ModelBuilder, from: THREE.Vector3, to: THREE.Vector3): void {
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 1e-6) return;
  const axis = dir.clone().normalize();
  // Two directions across the truss.
  const up = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(axis, up).normalize();
  const across = new THREE.Vector3().crossVectors(side, axis).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const e = new THREE.Euler().setFromQuaternion(q);
  const r = TRUSS / 2;
  const corner = (i: number) =>
    side
      .clone()
      .multiplyScalar(i & 1 ? r : -r)
      .add(across.clone().multiplyScalar(i & 2 ? r : -r));
  const mid = from.clone().add(to).multiplyScalar(0.5);
  for (let i = 0; i < 4; i++) {
    const p = mid.clone().add(corner(i));
    b.cylinder(CHORD, CHORD, len, ALU, { at: [p.x, p.y, p.z], rot: [e.x, e.y, e.z] }, 8);
  }
  // Zig-zag lacing on each face, one bay per truss width.
  const bays = Math.max(1, Math.round(len / TRUSS));
  const step = len / bays;
  const sides: [number, number][] = [
    [0, 1],
    [1, 3],
    [3, 2],
    [2, 0],
  ];
  for (const [ia, ib] of sides) {
    const ca = corner(ia);
    const cb = corner(ib);
    for (let k = 0; k < bays; k++) {
      const p0 = from
        .clone()
        .add(axis.clone().multiplyScalar(k * step))
        .add(k % 2 ? ca : cb);
      const p1 = from
        .clone()
        .add(axis.clone().multiplyScalar((k + 1) * step))
        .add(k % 2 ? cb : ca);
      const d = p1.clone().sub(p0);
      const ql = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        d.clone().normalize(),
      );
      const el = new THREE.Euler().setFromQuaternion(ql);
      const m = p0.clone().add(p1).multiplyScalar(0.5);
      b.box(
        LACE,
        d.length(),
        LACE,
        tint(ALU, -0.08),
        { at: [m.x, m.y, m.z], rot: [el.x, el.y, el.z] },
        0,
      );
    }
  }
}

/** A small moving head standing on the beam at (x, y, 0): base, yoke, head tilted to the stage. */
function movingHead(b: ModelBuilder, x: number, y: number): void {
  b.box(0.14, 0.05, 0.12, BLACK, { at: [x, y + 0.025, 0] }, 0.012);
  for (const s of [-1, 1])
    b.box(0.022, 0.12, 0.05, 0x2a2c32, { at: [x + s * 0.065, y + 0.11, 0] }, 0.006);
  // The head's lens end aims down and forward, at the stage.
  const head = framed(b, [x, y + 0.13, 0], [-0.9, 0, 0]);
  head.cylinder(0.05, 0.045, 0.13, 0x1f2024, {}, 14);
  head.add(
    new THREE.CylinderGeometry(0.04, 0.04, 0.006, 14),
    0x4a3a7a,
    { at: [0, -0.066, 0] },
    'glow',
  );
}

/**
 * The lighting truss for `truss`, built in world x and y round its row
 * (place it at z = `truss.z`): a box-truss beam from support to support
 * low over the back wall's cap, each support a base plate bolted to a
 * corner wall's cap with a corner block under the beam's end, and small
 * moving heads standing on the beam between its ends and the first and
 * last lamps.
 */
export function stageTrussModel(truss: Truss): Model {
  const b = new ModelBuilder();
  const [t0, t1] = truss.towers;
  if (!t0 || !t1) return b.build();
  const y = truss.y;
  const ends = [t0.x, t1.x];
  trussRun(b, new THREE.Vector3(ends[0], y, 0), new THREE.Vector3(ends[1], y, 0));
  for (const x of ends) {
    const foot = WALL_HEIGHT;
    b.box(0.3, 0.014, 0.3, ALU_DARK, { at: [x, foot + 0.007, 0] }, 0.004);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        b.cylinder(
          0.012,
          0.012,
          0.01,
          ALU_LIGHT,
          { at: [x + sx * 0.11, foot + 0.018, sz * 0.11] },
          8,
        );
    const blockH = y + TRUSS / 2 + 0.015 - foot - 0.014;
    b.box(
      TRUSS + 0.03,
      blockH,
      TRUSS + 0.03,
      ALU_DARK,
      { at: [x, foot + 0.014 + blockH / 2, 0] },
      0.008,
    );
  }
  const lamps = [...truss.lamps].sort((a, c) => a - c);
  const first = lamps[0];
  const last = lamps[lamps.length - 1];
  if (first !== undefined && first - truss.x0 > 0.9)
    movingHead(b, (truss.x0 + first) / 2 + 0.1, y + TRUSS / 2);
  if (last !== undefined && truss.x1 - last > 0.9)
    movingHead(b, (truss.x1 + last) / 2 - 0.1, y + TRUSS / 2);
  return b.build();
}

/**
 * A par can standing on the truss beam, built round the beam's middle (the
 * fitting's spot, see `stageLampFit`): a hook clamp on the top chord, the
 * yoke up from it and the black can in it, tilted forward and down toward
 * the stage, its warm lens lit (in the glow layer, so it blooms), the gel
 * frame's clips round its rim.
 */
export function parCanModel(): Model {
  const root = new ModelBuilder();
  const base = TRUSS / 2 + 0.01;
  root.box(0.06, 0.04, 0.06, 0x3a3c42, { at: [0, base + 0.01, 0] }, 0.008);
  const b = framed(root, [0, base + 0.03, 0], [0, 0, 0], PAR_SCALE);
  b.box(0.17, 0.014, 0.03, 0x2a2c32, { at: [0, 0.007, 0] }, 0);
  for (const s of [-1, 1]) b.box(0.012, 0.13, 0.03, 0x2a2c32, { at: [s * 0.078, 0.065, 0] }, 0);
  const tilt = -1.07;
  b.cylinder(0.065, 0.06, 0.18, 0x1d1e22, { at: [0, 0.11, 0], rot: [tilt, 0, 0] }, 16);
  const ax = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(tilt, 0, 0));
  const lens = ax.clone().multiplyScalar(0.094);
  b.add(
    new THREE.CylinderGeometry(0.056, 0.056, 0.006, 16),
    0xc8a060,
    { at: [lens.x, 0.11 + lens.y, lens.z], rot: [tilt, 0, 0] },
    'glow',
  );
  const rim = ax.clone().multiplyScalar(0.088);
  b.add(new THREE.TorusGeometry(0.064, 0.008, 6, 18), 0x2a2c32, {
    at: [rim.x, 0.11 + rim.y, rim.z],
    rot: [tilt + Math.PI / 2, 0, 0],
  });
  return root.build();
}

/** How much a par can is grown, so it reads on the truss from the couch. */
const PAR_SCALE = 1.45;

/**
 * The mirror ball (once), stood on a side wall's cap on its flight case,
 * built from the cap's top: a faceted ball on a short stand with its
 * motor, a few facets catching the wash.
 */
export function mirrorBallModel(): Model {
  const b = new ModelBuilder();
  b.box(0.34, 0.12, 0.3, CASE_BLACK, { at: [0, 0.06, 0] }, 0.012);
  for (const z of [-0.15, 0.15]) b.box(0.344, 0.014, 0.014, ALU, { at: [0, 0.113, z] }, 0);
  b.cylinder(0.05, 0.06, 0.03, BLACK, { at: [0, 0.135, 0] }, 14);
  b.box(0.02, 0.1, 0.02, ALU_DARK, { at: [0, 0.2, 0] }, 0);
  const r = 0.13;
  const cy = 0.25 + r;
  b.add(new THREE.SphereGeometry(r, 12, 8), 0x9aa0aa, { at: [0, cy, 0] });
  for (let i = 0; i < 12; i++) {
    const h = tileHash(i + 3, 17);
    const lon = ((h % 12) / 12) * Math.PI - Math.PI / 2;
    const lat = (((h >> 4) % 6) / 6) * 1.4 - 0.4;
    const n = new THREE.Vector3(
      Math.sin(lon) * Math.cos(lat),
      Math.sin(lat),
      Math.cos(lon) * Math.cos(lat),
    );
    const p = n.clone().multiplyScalar(r + 0.002);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const e = new THREE.Euler().setFromQuaternion(q);
    b.add(
      new THREE.PlaneGeometry(0.035, 0.035),
      i % 3 ? 0x6a6e78 : 0x8a7ab8,
      { at: [p.x, cy + p.y, p.z], rot: [e.x, e.y, e.z] },
      'glow',
    );
  }
  return b.build();
}
