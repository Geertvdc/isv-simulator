import * as THREE from 'three';
import { type WallPiece, tileHash } from '../../mapShape';
import { type Model, ModelBuilder, type Place, tint } from '../kit';
import { FRONT_WALL_HEIGHT, SLAB_DEPTH, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, WALL_COLORS } from '../look';
import {
  BASEMENT_ART_HALF,
  BATTEN_DROP,
  CAGE_LOOKS,
  CORNERS,
  RAISED_WEAR,
  RAISED_WEAR_KINDS,
  type Tray,
  cageSwap,
} from '../rooms/basementRoom';
import type { CounterRun } from '../rooms/counterRun';
import { lettering } from '../setDressing/businessPark';
import type { StationModel } from '../stationModels';

/**
 * The basement under the loft building (wall theme `basement`, floor theme
 * `raisedFloor`), built in code: painted concrete block walls (a muted
 * grey-green dado under paler paint, a dark kick plinth, the block's
 * coursing, scuffs and a damp patch) under cool cast-concrete coping, the
 * server room's own walls as a server cage, grey raised-floor tiles with
 * their vents and a lifted tile, the raised floor's edge over poured
 * concrete as the diorama's base, dark powder-coated rack shelves for
 * counters, the fire door with the pager board, the uplink's patch frame,
 * what hangs on the walls, and the fluorescent battens on their cable tray.
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

/** A glowing box (an LED, a lit sign face), in the glow layer. */
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

/** A builder that draws into `parent` through a frame (a turn and a move). */
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
export function framed(
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

/** Glyphs the shared lettering lacks, in its 3×5 pixel font. */
const EXTRA: Readonly<Record<string, string>> = {
  '?': '110001010000010',
  ':': '000010000010000',
  '°': '010101010000000',
  '·': '000000010000000',
  '!': '010010010000010',
};

/**
 * `lettering` with a few more glyphs (?, :, °, ·, !): paints `text` centred
 * on (x, y) on a face at depth z (facing +z), each pixel `px` square.
 */
export function text(
  b: ModelBuilder,
  s: string,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
  depth = 0.002,
): void {
  const cols = s.length * 4 - 1;
  for (let k = 0; k < s.length; k++) {
    const ch = s.charAt(k);
    const left = x + (k * 4 - cols / 2) * px;
    const glyph = EXTRA[ch];
    if (!glyph) {
      if (ch !== ' ') lettering(b, ch, left + 1.5 * px, y, z, px, color, depth);
      continue;
    }
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        if (glyph[r * 3 + c] === '1')
          b.box(
            px,
            px,
            depth,
            color,
            { at: [left + (c + 0.5) * px, y + (2 - r) * px, z + depth / 2] },
            0,
          );
  }
}

// ---- Materials ----

/** The block's paint: pale above the dado, the muted grey-green under it, its dark band and plinth. */
const UPPER = 0xaeb1a9;
const DADO_BAND = 0x5f6c64;
const KICK = 0x4c5052;
/** Cast-concrete coping: the cap's top is `WALL_COLORS.basement.top`. */
const COPING_EDGE = 0x959a9e;
/** Galvanised steel (the tray, the struts, the conduit) and a darker steel. */
export const GALV = 0x8c9399;
const STEEL_DARK = 0x4a4f55;
/** The racks' black, their steel mesh, a server's face. */
export const RACK = 0x25282d;
const MESH = 0x5d636b;
const SERVER = 0x33373e;
/** Rack LEDs (glow, boosted on screen: small and dim). */
export const LED_BLUE = 0x1f6fc8;
export const LED_GREEN = 0x2ab060;
const LED_AMBER = 0xc07818;
const ALERT_RED = 0xc81c1c;
/** The counters' dark powder coat, their top (darker than every station top), the ESD mat. */
const POWDER = 0x2e3136;
export const SHELF_TOP = 0x3a3e44;
const ESD_BLUE = 0x34506c;
/** Fibre yellow, a little dulled. */
const FIBRE = 0xd8b42a;
/** Paper and marker. */
const PAPER = 0xd8d6cc;
const INK = 0x2a2c30;
const MARKER_RED = 0xc0302a;

// ---- Walls ----

/** Heights on a wall: the kick plinth, the dado (its band on top), a course of block. */
const KICK_H = 0.07;
const DADO_H = 0.5;
const BAND_H = 0.045;
const COURSE = 0.2;
const BLOCK_W = 0.4;
/** The coping: its slab `CAP` thick, its lip band `LIP` proud of the faces and `LIP_H` tall. */
const CAP = 0.05;
const LIP = 0.03;
const LIP_H = 0.045;
/** Looks a wall comes in: plain, a patched block, scuffs, a damp patch, a conduit. */
export const BASEMENT_WALL_LOOKS = 5;

/**
 * The coping on top of a wall `h` tall: one slab over the tile (a joint
 * line at its −x edge), and round it a lip band a little proud of the faces
 * whose top sits under the slab's, so where the next wall carries on it's
 * buried in that wall's coping and only the run's open edges show a lip.
 */
function coping(b: ModelBuilder, h: number): void {
  const { top } = WALL_COLORS.basement;
  const lip = 1 + LIP * 2;
  const bandY = h - 0.008 - LIP_H / 2;
  b.box(lip, LIP_H, lip, COPING_EDGE, { at: [0, bandY, 0] }, 0);
  // The lip's dark underside, where it overhangs the block.
  b.box(lip - 0.004, 0.008, lip - 0.004, tint(COPING_EDGE, -0.5), {
    at: [0, bandY - LIP_H / 2 - 0.004, 0],
  });
  b.box(1, CAP, 1, top, { at: [0, h - CAP / 2, 0] }, 0);
  b.box(0.008, 0.002, 1, tint(top, -0.2), { at: [-0.496, h + 0.001, 0] }, 0);
  // A few pores in the cast concrete.
  for (const [x, z] of [
    [-0.22, 0.18],
    [0.31, -0.12],
    [0.05, 0.33],
  ] as const)
    b.box(0.018, 0.002, 0.014, tint(top, -0.12), { at: [x, h + 0.001, z] }, 0);
}

/**
 * The block's coursing on a face from `y0` to `y1` in `paint`: a groove
 * every course, the joints staggered course to course, one block here and
 * there a shade off.
 */
function coursing(
  b: ModelBuilder,
  on: Face,
  y0: number,
  y1: number,
  paint: number,
  seed: number,
): void {
  const groove = tint(paint, -0.16);
  const courses = Math.max(1, Math.round((y1 - y0) / COURSE));
  const hh = (y1 - y0) / courses;
  for (let i = 0; i < courses; i++) {
    const c0 = y0 + i * hh;
    if (i > 0) b.box(1, 0.007, 0.004, groove, on(0, c0), 0);
    const shift = i % 2 ? BLOCK_W / 2 : 0;
    for (let u = -0.5 + shift; u < 0.5; u += BLOCK_W)
      if (u > -0.49) b.box(0.007, hh - 0.007, 0.004, groove, on(u, c0 + hh / 2), 0);
    const h = tileHash(i + seed * 7, seed + 13);
    if (h % 5 === 0) {
      const u = -0.5 + shift + BLOCK_W / 2 + BLOCK_W * ((h >> 4) % 2);
      if (Math.abs(u) < 0.3)
        b.box(
          BLOCK_W - 0.012,
          hh - 0.012,
          0.003,
          tint(paint, h % 2 ? 0.04 : -0.04),
          on(u, c0 + hh / 2),
          0,
        );
    }
  }
}

/**
 * A wall of the basement: painted concrete block, pale above and a muted
 * grey-green dado below with a darker band, on a dark kick plinth, the
 * block's coursing on every face, under cast-concrete coping. `look` adds a
 * patched block, scuffs, a damp patch or a conduit with its box on the
 * faces along the run. The low front wall is the dado and its plinth.
 */
export function basementWallModel(piece: WallPiece, look: number): Model {
  const { face } = WALL_COLORS.basement;
  const b = new ModelBuilder();
  if (piece === 'wall-front') {
    const h = FRONT_WALL_HEIGHT;
    b.box(1, h - CAP, 1, face, { at: [0, (h - CAP) / 2, 0] }, 0);
    b.box(1.01, 0.05, 1.01, KICK, { at: [0, 0.025, 0] }, 0);
    for (const on of faces(0.502)) {
      b.box(
        0.007,
        h - CAP - 0.06,
        0.004,
        tint(face, -0.16),
        on(-0.3 + 0.4 * (look % 2), 0.05 + (h - CAP - 0.05) / 2),
        0,
      );
    }
    coping(b, h);
    return b.build();
  }
  const h = WALL_HEIGHT;
  const body = h - CAP;
  b.box(1, body, 1, UPPER, { at: [0, body / 2, 0] }, 0);
  b.box(1.006, DADO_H, 1.006, face, { at: [0, DADO_H / 2, 0] }, 0);
  b.box(1.01, BAND_H, 1.01, DADO_BAND, { at: [0, DADO_H - BAND_H / 2, 0] }, 0);
  b.box(1.014, KICK_H, 1.014, KICK, { at: [0, KICK_H / 2, 0] }, 0);
  faces(0.505).forEach((on, f) => {
    coursing(b, on, KICK_H, DADO_H - BAND_H, face, look * 4 + f);
    coursing(b, faces(0.501)[f] ?? on, DADO_H, body - 0.02, UPPER, look * 4 + f + 2);
    if (f >= 2 && look !== 3) return;
    const mark = (
      w: number,
      hh: number,
      color: number,
      u: number,
      y: number,
      turn = 0,
      d = 0.006,
    ) => {
      const p = on(u, y);
      b.box(w, hh, d, color, { at: p.at, rot: [0, p.rot?.[1] ?? 0, turn] }, 0);
    };
    if (look === 1) {
      // A block patched with fresh paint, two rawlplug holes where something hung.
      mark(BLOCK_W - 0.02, COURSE - 0.02, tint(UPPER, 0.07), 0.1, DADO_H + COURSE * 1.5);
      mark(0.014, 0.014, tint(UPPER, -0.45), -0.28, 0.86);
      mark(0.014, 0.014, tint(UPPER, -0.45), -0.12, 0.86);
    } else if (look === 2) {
      // Scuffs on the dado where carts and boots hit it, a chip off the corner.
      for (const [u, y, w, r] of [
        [-0.26, KICK_H + 0.07, 0.2, 0.05],
        [-0.08, KICK_H + 0.12, 0.12, -0.06],
        [0.22, KICK_H + 0.05, 0.16, 0.08],
        [0.3, KICK_H + 0.17, 0.07, -0.1],
      ] as const)
        mark(w, 0.014, tint(face, -0.22), u, y, r);
      mark(0.05, 0.06, tint(face, 0.18), 0.47, DADO_H - BAND_H - 0.06);
    } else if (look === 3) {
      // A damp patch rising from the plinth: darker paint in soft lobes, a tide line round it.
      const wet = tint(face, -0.14);
      for (const [u, y, w, hh] of [
        [-0.1, KICK_H + 0.1, 0.46, 0.2],
        [-0.18, KICK_H + 0.2, 0.26, 0.14],
        [0.06, KICK_H + 0.17, 0.2, 0.12],
      ] as const) {
        mark(w + 0.03, hh + 0.03, tint(face, -0.07), u, y, 0, 0.005);
        mark(w, hh, wet, u, y, 0, 0.007);
      }
      mark(0.3, 0.008, tint(face, -0.25), -0.12, KICK_H + 0.3, 0.04, 0.008);
    } else if (look === 4 && f === 0) {
      // A grey conduit down from the coping to a junction box, a socket under it.
      mark(0.03, body - 0.62, GALV, 0.34, 0.62 + (body - 0.62) / 2, 0, 0.03);
      for (const y of [0.78, 0.98]) mark(0.06, 0.016, STEEL_DARK, 0.34, y, 0, 0.034);
      mark(0.12, 0.12, 0x9a9e9c, 0.34, 0.58, 0, 0.04);
      mark(0.1, 0.07, 0xc6c4ba, 0.34, 0.27, 0, 0.02);
      for (const u of [0.315, 0.365]) mark(0.012, 0.012, INK, u, 0.27, 0, 0.024);
    }
  });
  coping(b, h);
  return b.build();
}

// ---- The server cage (the server room's own walls) ----

/** How high the block stands under the cage. */
const CAGE_BLOCK = 0.42;

/**
 * The server room's full walls as a server cage: the same painted block up
 * to `CAGE_BLOCK` with a coping lip, and over it black racks behind a steel
 * mesh in a steel frame, blinking LEDs on the servers, under a dark steel
 * top. `look`: servers behind mesh, solid perforated rack doors with a
 * handle, or a patch panel with its cables.
 */
export function cageModel(_piece: WallPiece, look: number): Model {
  const { face } = WALL_COLORS.basement;
  const b = new ModelBuilder();
  const h = WALL_HEIGHT;
  b.box(1, CAGE_BLOCK, 1, face, { at: [0, CAGE_BLOCK / 2, 0] }, 0);
  b.box(1.014, KICK_H, 1.014, KICK, { at: [0, KICK_H / 2, 0] }, 0);
  b.box(1.03, 0.04, 1.03, COPING_EDGE, { at: [0, CAGE_BLOCK - 0.02, 0] }, 0);
  const rackH = h - 0.04 - CAGE_BLOCK;
  const rackY = CAGE_BLOCK + rackH / 2;
  b.box(0.94, rackH, 0.94, RACK, { at: [0, rackY, 0] }, 0);
  // The dark steel top, a little proud, and the frame's corner posts.
  b.box(1.0, 0.04, 1.0, 0x34383e, { at: [0, h - 0.02, 0] }, 0);
  // The top's rim, catching the light, and a vent grille in it.
  for (const s of [-1, 1]) {
    b.box(1.004, 0.008, 0.02, tint(MESH, 0.1), { at: [0, h - 0.003, s * 0.492] }, 0);
    b.box(0.02, 0.008, 1.004, tint(MESH, 0.1), { at: [s * 0.492, h - 0.003, 0] }, 0);
  }
  for (let k = 0; k < 5; k++)
    b.box(0.5, 0.004, 0.02, 0x1d2024, { at: [0, h + 0.001, -0.2 + k * 0.1] }, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.box(0.04, rackH, 0.04, STEEL_DARK, { at: [sx * 0.48, rackY, sz * 0.48] }, 0);
  faces(0.47).forEach((on, f) => {
    const seed = tileHash(look + 3, f + 7);
    // The servers: a stack of units, a few LEDs each.
    const units = 6;
    for (let i = 0; i < units; i++) {
      const y = CAGE_BLOCK + 0.05 + i * ((rackH - 0.08) / units);
      const uh = (rackH - 0.08) / units - 0.016;
      b.box(0.84, uh, 0.006, i % 3 === 2 ? 0x2d3137 : SERVER, on(0, y + uh / 2), 0);
      for (let k = 0; k < 3; k++) {
        const hk = tileHash(seed + i, k);
        if (hk % 3 === 0) continue;
        const color = hk % 11 === 0 ? LED_AMBER : hk % 2 ? LED_BLUE : LED_GREEN;
        const p = on(-0.34 + k * 0.05 + (i % 2) * 0.4, y + uh / 2);
        const [x, yy, z] = p.at ?? [0, 0, 0];
        const out = 0.006;
        const turned = f >= 2;
        glowBox(b, turned ? 0.004 : 0.022, 0.014, turned ? 0.022 : 0.004, color, {
          at: [x + (turned ? Math.sign(x) * out : 0), yy, z + (turned ? 0 : Math.sign(z) * out)],
        });
      }
    }
    const front = faces(0.49)[f] ?? on;
    if (look === 1) {
      // Solid rack doors, perforated: a grid of darker dots, a handle.
      b.box(0.88, rackH - 0.02, 0.006, 0x2c3036, front(0, rackY), 0);
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 6; c++)
          b.box(
            0.03,
            0.02,
            0.004,
            0x1c1f23,
            front(-0.3 + c * 0.11, CAGE_BLOCK + 0.08 + r * 0.085),
            0,
          );
      b.box(0.02, 0.12, 0.02, GALV, front(0.36, rackY), 0);
      // A couple of LEDs on the door itself.
      const p = front(-0.36, h - 0.1);
      const [x, y, z] = p.at ?? [0, 0, 0];
      b.led(0.008, f % 2 ? LED_GREEN : LED_BLUE, { at: [x * 1.02, y, z * 1.02] });
    } else {
      // The steel mesh in front: a fine grid of wires, a frame round it.
      const fz = 0.495;
      const mesh = faces(fz)[f] ?? on;
      for (let k = 0; k <= 10; k++)
        b.box(0.004, rackH - 0.02, 0.004, MESH, mesh(-0.45 + k * 0.09, rackY), 0);
      for (let k = 0; k <= 7; k++)
        b.box(0.92, 0.004, 0.004, MESH, mesh(0, CAGE_BLOCK + 0.02 + k * ((rackH - 0.04) / 7)), 0);
      if (look === 2) {
        // A patch panel behind the mesh with its cables looping down.
        b.box(0.8, 0.06, 0.008, 0x1d2024, on(0, h - 0.16), 0);
        for (let k = 0; k < 6; k++) {
          const col = [FIBRE, 0x6a7c90, 0x8a8e94, FIBRE, 0x9a5a50, 0x6a7c90][k] ?? FIBRE;
          b.box(
            0.012,
            0.16 + (k % 3) * 0.05,
            0.01,
            col,
            on(-0.3 + k * 0.12, h - 0.26 - (k % 3) * 0.025),
            0,
          );
        }
      }
    }
  });
  return b.build();
}

/** Every cage swap model, by its name in the plan's `swaps`. */
export const CAGE_MODELS: Readonly<Record<string, () => Model>> = Object.fromEntries(
  (['wall', 'wall-inner'] as const).flatMap((piece) =>
    Array.from({ length: CAGE_LOOKS }, (_, look) => [
      cageSwap(piece, look),
      () => cageModel(piece, look),
    ]),
  ),
);

// ---- The foundation: the raised floor's edge over poured concrete ----

/** Looks the foundation comes in: plain, tie holes, a damp stain. */
export const FOUNDATION_LOOKS = 3;
const CONCRETE = 0x6c6e70;
const VOID = 0x1f2124;

/**
 * The basement under each tile, the diorama's base: the raised floor's
 * light edge trim, the dark void under it with its pedestals and a cable,
 * and poured concrete below with formwork lines, by `look` tie holes or a
 * damp stain.
 */
export function basementFoundationModel(look: number): Model {
  const b = new ModelBuilder();
  const top = -0.013;
  const bottom = top - SLAB_DEPTH;
  const voidH = 0.11;
  const concreteTop = top - 0.03 - voidH;
  b.box(
    1.002,
    concreteTop - bottom,
    1.002,
    CONCRETE,
    { at: [0, (concreteTop + bottom) / 2, 0] },
    0,
  );
  b.box(0.99, voidH, 0.99, VOID, { at: [0, top - 0.03 - voidH / 2, 0] }, 0);
  b.box(1.008, 0.03, 1.008, 0x9a9ea2, { at: [0, top - 0.015, 0] }, 0);
  b.box(1.01, 0.006, 1.01, 0x6a6e72, { at: [0, top - 0.031, 0] }, 0);
  faces(0.503).forEach((on, f) => {
    // Pedestals in the void, a cable sagging between two.
    for (const u of [-0.25, 0.25]) {
      b.box(0.03, voidH, 0.03, 0x8a8e92, on(u, top - 0.03 - voidH / 2), 0);
      b.box(0.07, 0.012, 0.004, 0x8a8e92, on(u, concreteTop + 0.006), 0);
    }
    if ((f + look) % 2 === 0) b.box(0.4, 0.014, 0.004, 0x2c2e31, on(0, concreteTop + 0.03), 0);
    // Formwork: the board lines, a little darker, and the boards' ends.
    for (let k = 1; k < 4; k++)
      b.box(
        1,
        0.006,
        0.004,
        tint(CONCRETE, -0.12),
        on(0, concreteTop - k * ((concreteTop - bottom) / 4)),
        0,
      );
    b.box(
      0.006,
      concreteTop - bottom,
      0.004,
      tint(CONCRETE, -0.1),
      on(-0.5 + 0.5 * ((f + look) % 2), (concreteTop + bottom) / 2),
      0,
    );
    if (look === 1)
      for (const u of [-0.25, 0.25])
        b.box(0.024, 0.024, 0.004, tint(CONCRETE, -0.35), on(u, concreteTop - 0.14), 0);
    else if (look === 2 && f < 2) {
      b.box(0.3, 0.12, 0.004, tint(CONCRETE, -0.08), on(0.1, concreteTop - 0.08), 0);
      b.box(0.18, 0.18, 0.005, tint(CONCRETE, -0.13), on(0.12, concreteTop - 0.12), 0);
    }
    b.box(1.004, 0.025, 0.005, tint(CONCRETE, -0.3), on(0, bottom + 0.0125), 0);
  });
  return b.build();
}

// ---- The raised floor ----

/** Variants a tile comes in (the tone of each of its four half tiles), picked by its hash. */
const FLOOR_VARIANTS = 8;
/** Tone steps of a half tile per variant: four per variant, −2..2 (each ±1%). */
const SUBTONES: readonly (readonly number[])[] = [
  [0, 1, -1, 0],
  [1, -1, 0, 2],
  [-2, 0, 1, -1],
  [0, 2, -1, 1],
  [-1, 0, 0, -2],
  [2, -1, 1, 0],
  [0, -2, 2, 1],
  [1, 0, -1, -1],
];

/** A floor look: its wear and its variant. */
export function raisedLook(x: number, y: number, wear: number): number {
  const variant = (tileHash(x + 5, y + 9) >>> 3) % FLOOR_VARIANTS;
  return wear * FLOOR_VARIANTS + variant;
}

/** A tile's brightness: ±4% per tile (each panel a little off), picked by the tile and the level. */
export function raisedTone(x: number, y: number, salt: number): number {
  const own = ((Math.imul(x + 41, 73856093) ^ Math.imul(y + 7, 19349663) ^ salt) >>> 0) % 1001;
  return 1 + (own / 1000 - 0.5) * 0.08;
}

/** The middles of a tile's four half tiles: back-left, back-right, front-left, front-right. */
const HALVES: readonly (readonly [number, number])[] = [
  [-0.25, -0.25],
  [0.25, -0.25],
  [-0.25, 0.25],
  [0.25, 0.25],
];

/**
 * A floor tile of raised floor (`look` from `raisedLook`): four grey
 * anti-static panels on a half-tile grid, each a shade off, thin light
 * joints with a dark hairline beside, and its wear (see `RAISED_WEAR`).
 */
export function raisedFloorModel(look: number): Model {
  const [base, joint] = FLOOR_COLORS.raisedFloor;
  const variant = look % FLOOR_VARIANTS;
  const wear = Math.floor(look / FLOOR_VARIANTS) % RAISED_WEAR_KINDS;
  const b = new ModelBuilder();
  b.box(1, 0.012, 1, base, { at: [0, -0.006, 0] }, 0);
  const mark = (w: number, d: number, color: number, x: number, z: number, y = 0.0012, turn = 0) =>
    b.box(w, 0.002, d, color, { at: [x, y, z], rot: [0, turn, 0] }, 0);
  const tones = SUBTONES[variant] ?? [0, 0, 0, 0];
  const lifted =
    wear >= RAISED_WEAR.lifted && wear < RAISED_WEAR.lifted + CORNERS
      ? wear - RAISED_WEAR.lifted
      : -1;
  const vent =
    wear >= RAISED_WEAR.vent && wear < RAISED_WEAR.vent + 4 ? wear - RAISED_WEAR.vent : -1;
  // Which half tiles a vent edge covers: back (0,1), front (2,3), left (0,2), right (1,3).
  const ventHalves =
    [
      [0, 1],
      [2, 3],
      [0, 2],
      [1, 3],
    ][vent] ?? [];
  HALVES.forEach(([x, z], i) => {
    if (i === lifted) return;
    const t = tones[i] ?? 0;
    if (ventHalves.includes(i)) {
      // A perforated vent panel: darker, a grid of holes.
      mark(0.47, 0.47, tint(base, -0.14), x, z);
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 5; c++)
          mark(0.03, 0.03, tint(base, -0.42), x - 0.16 + c * 0.08, z - 0.16 + r * 0.08, 0.0018);
      return;
    }
    if (t !== 0) mark(0.47, 0.47, tint(base, t * 0.01), x, z);
  });
  // The joints: the tile's back and left edges (the next tile draws the rest) and its middle cross.
  for (const z of [-0.494, 0]) {
    mark(1, 0.01, joint, 0, z, 0.0016);
    mark(1, 0.004, tint(base, -0.2), 0, z + 0.008, 0.0016);
  }
  for (const x of [-0.494, 0]) {
    mark(0.01, 1, joint, x, 0, 0.0016);
    mark(0.004, 1, tint(base, -0.2), x + 0.008, 0, 0.0016);
  }
  if (lifted >= 0) liftedPanel(b, lifted, base);
  else if (wear === RAISED_WEAR.scuffs) {
    // A trail of rubber-sole scuffs, faint, heading in.
    for (const [x, z, r, w] of [
      [-0.12, 0.3, 0.5, 0.16],
      [0.06, 0.16, -0.4, 0.12],
      [-0.04, -0.02, 0.3, 0.18],
      [0.12, -0.2, -0.6, 0.1],
      [-0.08, -0.34, 0.2, 0.14],
    ] as const)
      mark(w, 0.014, mix(base, 0x2a2c30, 0.4), x, z, 0.0022, r);
  } else if (wear >= RAISED_WEAR.ties && wear < RAISED_WEAR.ties + 4)
    ties(b, wear - RAISED_WEAR.ties);
  return b.build();
}

/**
 * A lifted floor panel in half tile `corner`: the dark void under it with
 * its pedestal and cables, the panel leaning beside on its edge, a suction
 * lifter left by it.
 */
function liftedPanel(b: ModelBuilder, corner: number, base: number): void {
  const [cx, cz] = HALVES[corner] ?? [0, 0];
  const sx = Math.sign(cx);
  const sz = Math.sign(cz);
  b.box(0.47, 0.004, 0.47, VOID, { at: [cx, 0.001, cz] }, 0);
  b.box(0.012, 0.006, 0.47, tint(base, -0.3), { at: [cx - sx * 0.235, 0.002, cz] }, 0);
  b.box(0.47, 0.006, 0.012, tint(base, -0.3), { at: [cx, 0.002, cz - sz * 0.235] }, 0);
  // The pedestal's head at the inner corner, cables across the void and one out over the floor.
  b.cylinder(0.03, 0.03, 0.01, 0x8a8e92, { at: [cx - sx * 0.22, 0.005, cz - sz * 0.22] }, 10);
  for (const [k, col] of [
    [0, 0x1d1f22],
    [1, 0x3a3d42],
    [2, 0x5a4a44],
  ] as const)
    b.cylinder(
      0.014,
      0.014,
      0.44,
      col,
      {
        at: [cx + (k - 1) * 0.07, 0.008, cz + sz * 0.02],
        rot: [Math.PI / 2, 0, 0.15 * (k - 1)],
      },
      8,
    );
  b.cylinder(
    0.012,
    0.012,
    0.3,
    0x1d1f22,
    { at: [cx - sx * 0.3, 0.008, cz - sz * 0.05], rot: [0, 0, Math.PI / 2] },
    8,
  );
  // The panel itself, leaning on its edge against the wall side, tilted up.
  b.box(
    0.46,
    0.03,
    0.46,
    tint(base, 0.02),
    {
      at: [cx - sx * 0.02, 0.07, cz + sz * 0.05],
      rot: [sz * 0.32, 0, -sx * 0.1],
    },
    0.006,
  );
  // The suction lifter: two cups and a handle, lying on the next panel.
  const lx = cx - sx * 0.44;
  const lz = cz - sz * 0.12;
  for (const d of [-0.06, 0.06])
    b.cylinder(0.035, 0.035, 0.02, 0x2a2c30, { at: [lx + d, 0.01, lz] }, 12);
  b.box(0.16, 0.02, 0.025, 0x8a2a24, { at: [lx, 0.035, lz] }, 0.006);
}

/** Snipped cable ties and a taped cable along one edge (`edge` as `VENT_EDGES` counts them). */
function ties(b: ModelBuilder, edge: number): void {
  const alongX = edge < 2;
  const off = [-0.42, 0.3, -0.42, 0.42][edge] ?? 0.42;
  // In: away from the edge, toward the tile's middle.
  const inward = -Math.sign(off);
  const pos = (u: number, v: number, y: number): [number, number, number] =>
    alongX ? [u, y, v] : [v, y, u];
  const turn = alongX ? 0 : Math.PI / 2;
  b.box(1, 0.012, 0.03, 0x232528, { at: pos(0, off, 0.006), rot: [0, turn, 0] }, 0);
  for (const u of [-0.25, 0.25])
    b.box(0.05, 0.004, 0.06, 0x8a8c90, { at: pos(u, off, 0.013), rot: [0, turn, 0] }, 0);
  for (const [u, v, r] of [
    [-0.1, 0.12, 0.6],
    [0.06, 0.2, -0.3],
    [0.2, 0.08, 1.2],
  ] as const)
    b.box(0.07, 0.004, 0.008, 0xd0d0c8, { at: pos(u, off + inward * v, 0.003), rot: [0, r, 0] }, 0);
}

// ---- Counters: rack shelves ----

/**
 * A counter as a dark powder-coated rack shelf, built from where it sits
 * in its run (x along the run): one top shelf along the run, a lower shelf
 * with decommissioned servers and a box of cables on it, uprights at the
 * run's ends and at each `legs` tile, castors under the ends (a crash
 * cart). A blue ESD mat on the run's first tile, a closed laptop on its
 * last. The top is darker than every station top.
 */
export function rackShelfCounter(run: CounterRun): StationModel {
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  const { minusEnd, plusEnd } = run;
  const x0 = minusEnd ? -0.46 : -0.5;
  const x1 = plusEnd ? 0.46 : 0.5;
  const mid = (x0 + x1) / 2;
  const len = x1 - x0;
  const d = 0.86;
  // The top shelf: a dark plate with a folded lip, a lighter edge catching the light.
  b.box(len, 0.045, d, SHELF_TOP, { at: [mid, top - 0.0225, 0] }, 0);
  for (const s of [-1, 1])
    b.box(len, 0.012, 0.012, 0x4a4e55, { at: [mid, top - 0.006, s * (d / 2)] }, 0);
  // The lower shelf.
  b.box(len, 0.025, d - 0.04, POWDER, { at: [mid, 0.14, 0] }, 0);
  const post = (x: number) => {
    for (const s of [-1, 1]) {
      b.box(
        0.04,
        top - 0.05,
        0.04,
        POWDER,
        { at: [x, (top - 0.05) / 2 + 0.02, s * (d / 2 - 0.02)] },
        0,
      );
      // Punched holes up the upright.
      for (let k = 0; k < 4; k++)
        b.box(0.012, 0.02, 0.004, 0x15171a, { at: [x, 0.2 + k * 0.07, s * (d / 2)] }, 0);
    }
  };
  if (minusEnd) post(x0 + 0.02);
  if (plusEnd) post(x1 - 0.02);
  if (run.legs && !minusEnd && !plusEnd) post(0);
  // Castors under the run's ends.
  for (const [end, x] of [
    [minusEnd, x0 + 0.02],
    [plusEnd, x1 - 0.02],
  ] as const)
    if (end)
      for (const s of [-1, 1])
        b.cylinder(
          0.025,
          0.025,
          0.03,
          0x1a1c1f,
          { at: [x, 0.025, s * (d / 2 - 0.02)], rot: [Math.PI / 2, 0, 0] },
          10,
        );
  // On the lower shelf: a decommissioned server on most tiles, a box of cables on the others.
  const h = tileHash(run.legs ? 3 : 5, minusEnd ? 7 : plusEnd ? 9 : 11);
  if (h % 3 !== 0) {
    b.box(Math.min(0.8, len - 0.1), 0.09, 0.6, SERVER, { at: [mid, 0.2, 0.04] }, 0.01);
    b.box(Math.min(0.78, len - 0.12), 0.06, 0.006, 0x2a2d32, { at: [mid, 0.2, 0.343] }, 0);
    for (let k = 0; k < 6; k++)
      b.box(0.05, 0.008, 0.004, 0x1a1c1f, { at: [mid - 0.25 + k * 0.1, 0.2, 0.347] }, 0);
    // The DECOM tag, a paper label taped on.
    b.box(0.09, 0.04, 0.004, PAPER, { at: [mid + 0.28, 0.2, 0.348] }, 0);
    b.box(0.06, 0.006, 0.003, MARKER_RED, { at: [mid + 0.28, 0.2, 0.3505] }, 0);
  } else {
    b.box(0.34, 0.14, 0.3, 0xa08a6a, { at: [mid - 0.1, 0.22, 0.05] }, 0.008);
    b.torus(0.08, 0.014, 0x2a2c30, { at: [mid + 0.22, 0.17, 0.12], rot: [Math.PI / 2, 0, 0] });
  }
  if (minusEnd && !plusEnd) {
    // The blue ESD mat, its grounding snap and lead.
    b.box(len - 0.12, 0.006, d - 0.14, ESD_BLUE, { at: [mid + 0.02, top + 0.003, 0] }, 0);
    b.cylinder(0.014, 0.014, 0.008, 0x9aa0a6, { at: [mid - 0.3, top + 0.008, 0.28] }, 8);
    b.box(0.012, 0.3, 0.012, 0x2a2c30, { at: [x0 + 0.01, top - 0.15, 0.3] }, 0);
  } else if (plusEnd && !minusEnd) {
    // A closed laptop with stickers, a coiled charger.
    b.box(
      0.32,
      0.022,
      0.22,
      0x5a5e66,
      { at: [mid - 0.08, top + 0.011, -0.14], rot: [0, 0.15, 0] },
      0.008,
    );
    b.box(
      0.05,
      0.003,
      0.04,
      0x6a5a9a,
      { at: [mid - 0.12, top + 0.023, -0.12], rot: [0, 0.4, 0] },
      0,
    );
  } else if (minusEnd && plusEnd) {
    b.box(len - 0.14, 0.006, d - 0.16, ESD_BLUE, { at: [mid, top + 0.003, 0] }, 0);
  }
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

// ---- The fire door with the pager board ----

/** The fire door's steel, a dull green-grey; its kick plate. */
const DOOR = 0x56645c;
const DOOR_FRAME = 0x434a46;

/** A propped-open fire door leaf flat-ish against a wall face, from its hinge at `hx` along +x by `s`. */
function doorLeaf(b: ModelBuilder, hx: number, s: number, z: number): void {
  const w = 0.82;
  const hh = 0.98;
  const g = framed(b, [hx, 0, z], [0, -s * 0.2, 0]);
  g.box(w, hh, 0.045, DOOR, { at: [s * (w / 2), hh / 2 + 0.01, 0.03] }, 0.01);
  // Kick plate, push bar, the wired-glass vision panel, the sign.
  g.box(w - 0.06, 0.16, 0.006, 0x7c827e, { at: [s * (w / 2), 0.1, 0.056] }, 0);
  g.box(w - 0.16, 0.03, 0.03, GALV, { at: [s * (w / 2 + 0.02), 0.48, 0.07] }, 0.008);
  g.box(0.16, 0.24, 0.006, 0x3a4648, { at: [s * (w / 2), 0.76, 0.056] }, 0);
  for (let k = 0; k < 4; k++)
    g.box(0.004, 0.24, 0.004, 0x8a9294, { at: [s * (w / 2) - 0.06 + k * 0.04, 0.76, 0.06] }, 0);
  g.box(0.3, 0.07, 0.004, 0x2a6a4a, { at: [s * (w / 2), 0.6, 0.056] }, 0);
  text(g, 'FIRE DOOR', s * (w / 2), 0.6, 0.058, 0.007, 0xe8f0e8);
  // The wedge under its free end.
  const wx = s * (w - 0.04);
  g.add(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 3), 0x9a6a2a, {
    at: [wx, 0.025, 0.11],
    rot: [0, 0, Math.PI / 2],
  });
}

/**
 * The pager board, built facing +z round its middle: a wall-mounted alert
 * panel with a row of red alert lamps (one lit bright), a small screen
 * reading ALERTS · 37, a red beacon on top and a pager hung on a hook.
 */
function pagerBoard(b: ModelBuilder): void {
  b.box(0.92, 0.3, 0.07, 0x30343a, { at: [0, 0, 0] }, 0.014);
  b.box(0.94, 0.02, 0.08, GALV, { at: [0, 0.15, 0] }, 0);
  // The lamps: red domes in bezels, the second one lit bright.
  for (let k = 0; k < 5; k++) {
    const x = -0.36 + k * 0.09;
    b.cylinder(
      0.034,
      0.034,
      0.02,
      0x1a1c1f,
      { at: [x, 0.065, 0.04], rot: [Math.PI / 2, 0, 0] },
      14,
    );
    b.add(
      new THREE.SphereGeometry(0.026, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      k === 1 ? 0xff3a2a : k === 3 ? ALERT_RED : 0x6a1010,
      {
        at: [x, 0.065, 0.048],
        rot: [Math.PI / 2, 0, 0],
      },
      'glow',
    );
  }
  // The screen: ALERTS · 37.
  b.box(0.36, 0.13, 0.01, 0x101214, { at: [0.22, -0.06, 0.04] }, 0);
  b.screen(0.34, 0.11, 0x1a0808, { at: [0.22, -0.06, 0.0455] });
  text(b, 'ALERTS', 0.16, -0.035, 0.046, 0.009, 0xff6a4a);
  text(b, '37', 0.33, -0.07, 0.046, 0.016, 0xff3a2a);
  // A label strip, ON CALL, under the lamps.
  b.box(0.38, 0.05, 0.004, PAPER, { at: [-0.18, -0.07, 0.037] }, 0);
  text(b, 'ON CALL', -0.18, -0.07, 0.039, 0.008, INK);
  // The beacon on top.
  b.cylinder(0.05, 0.055, 0.03, 0x1a1c1f, { at: [-0.36, 0.17, 0] }, 14);
  b.add(
    new THREE.SphereGeometry(0.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    ALERT_RED,
    { at: [-0.36, 0.185, 0] },
    'glow',
  );
  // The pager on its hook, hung off the board's right end.
  b.box(0.012, 0.05, 0.03, GALV, { at: [0.5, 0.06, 0.03] }, 0);
  b.box(0.1, 0.13, 0.035, 0x1d1f22, { at: [0.52, -0.04, 0.05], rot: [0, 0, 0.12] }, 0.012);
  glowBox(b, 0.07, 0.035, 0.004, 0x2a6a3a, { at: [0.525, -0.015, 0.069] });
  b.led(0.008, 0xff3a2a, { at: [0.5, -0.09, 0.069] });
}

/**
 * The fire door round the inbox (`span` tiles wide), its opening toward −z:
 * a steel frame and head in the block wall, the pager board standing on the
 * head (turned back by `yaw` to face the camera whatever wall it is on),
 * and the door leaf propped open against the wall face on side `leaf`
 * (±1 along x, 0 for none) with its wedge. On the front edge, which the
 * camera looks over, only low posts and the board lying low.
 */
export function pagerDoorModel(span: number, low: boolean, yaw = 0, leaf = 0): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  if (low) {
    for (const s of [-1, 1])
      b.box(0.08, 0.3, 0.1, DOOR_FRAME, { at: [s * (half + 0.04), 0.15, 0.45] }, 0.01);
    pagerBoard(framed(b, [-half - 0.4, 0.42, 0.42], [-0.9, 0, 0], 0.5));
    return b.build();
  }
  const top = WALL_HEIGHT;
  const headY = 1.0;
  // The frame: jambs and the head, the block wall over the head with its coping.
  for (const s of [-1, 1]) {
    b.box(0.09, headY, 0.16, DOOR_FRAME, { at: [s * (half - 0.045), headY / 2, -0.4] }, 0.008);
    b.box(
      0.012,
      headY - 0.02,
      0.164,
      tint(DOOR_FRAME, 0.2),
      { at: [s * (half - 0.095), headY / 2, -0.4] },
      0,
    );
  }
  b.box(span, top - headY, 0.2, UPPER, { at: [0, (top + headY) / 2, -0.4] }, 0);
  b.box(span + 0.02, 0.07, 0.2, DOOR_FRAME, { at: [0, headY - 0.035, -0.4] }, 0.008);
  b.box(span + 0.04, 0.04, 0.24, COPING_EDGE, { at: [0, top - 0.02, -0.4] }, 0);
  // Green emergency light strip over the head on the stair side, a glimpse of the dark stairwell.
  b.box(span - 0.2, 0.02, 0.02, 0x1a1c1f, { at: [0, STATION_HEIGHT + 0.1, -0.49] }, 0);
  // The pager board on the wall over the door, turned square to the camera.
  const board = framed(b, [0, top + 0.17, -0.36], [0, -yaw, 0]);
  for (const s of [-1, 1]) board.box(0.025, 0.08, 0.025, GALV, { at: [s * 0.3, -0.17, -0.02] }, 0);
  pagerBoard(board);
  if (leaf !== 0) doorLeaf(b, leaf * (half + 0.02), leaf, 0.5);
  return b.build();
}

// ---- The uplink ----

/** The green DEPLOY key switch and DEPLOYED lamp. */
const GO_GREEN = 0x2a9a4a;

/**
 * The patch frame built round its middle on a low wall's top (`y` = 0 on
 * the cap): a low dark cabinet, its top sloping toward the camera with the
 * big green DEPLOY key switch and the DEPLOYED lamp, a fibre patch panel on
 * its face with yellow fibre loops hanging over the wall, and the yellow
 * fibre duct off its side, down the wall and away along the front by `s`.
 */
function patchFrame(b: ModelBuilder, s: number): void {
  b.box(0.5, 0.2, 0.34, RACK, { at: [0, 0.1, -0.02] }, 0.012);
  // The sloped console top.
  const top = framed(b, [0, 0.21, 0.0], [0.5, 0, 0]);
  top.box(0.5, 0.03, 0.3, 0x30343a, { at: [0, 0, 0] }, 0.01);
  top.cylinder(0.055, 0.06, 0.03, 0x1a1c1f, { at: [-0.1, 0.025, 0.02] }, 16);
  top.cylinder(0.042, 0.042, 0.02, GO_GREEN, { at: [-0.1, 0.045, 0.02] }, 16);
  top.box(0.016, 0.03, 0.05, 0xc8ccd0, { at: [-0.1, 0.07, 0.02], rot: [0, 0.6, 0] }, 0);
  top.box(0.12, 0.03, 0.004, PAPER, { at: [-0.1, 0.017, 0.12], rot: [-Math.PI / 2, 0, 0] }, 0);
  const label = framed(top, [-0.1, 0.018, 0.12], [-Math.PI / 2, 0, 0]);
  text(label, 'DEPLOY', 0, 0, 0.002, 0.004, INK);
  top.cylinder(0.035, 0.035, 0.02, 0x1a1c1f, { at: [0.12, 0.02, 0.0] }, 14);
  top.add(
    new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    0x3ad86a,
    {
      at: [0.12, 0.03, 0.0],
    },
    'glow',
  );
  const lamp = framed(top, [0.12, 0.018, 0.1], [-Math.PI / 2, 0, 0]);
  lamp.box(0.16, 0.035, 0.004, PAPER, { at: [0, 0, 0] }, 0);
  text(lamp, 'DEPLOYED', 0, 0, 0.002, 0.0038, INK);
  // The patch panel on its face, the fibres out of it and hanging over the wall's front.
  b.box(0.44, 0.08, 0.01, 0x15171a, { at: [0, 0.1, 0.155] }, 0);
  for (let k = 0; k < 8; k++)
    b.box(
      0.022,
      0.016,
      0.004,
      k % 3 === 0 ? FIBRE : 0x4a4e55,
      { at: [-0.18 + k * 0.052, 0.11, 0.162] },
      0,
    );
  // Loops of fibre out of the panel, lying in coils on the wall's top in front of it.
  for (const [x, r, z, tilt] of [
    [-0.15, 0.07, 0.25, 0.25],
    [-0.04, 0.085, 0.28, -0.15],
    [0.08, 0.065, 0.25, 0.3],
    [0.17, 0.075, 0.29, -0.2],
  ] as const) {
    b.torus(r, 0.007, FIBRE, { at: [x, 0.012, z], rot: [Math.PI / 2 - 0.25, 0, tilt] });
    b.box(0.01, 0.01, 0.1, FIBRE, { at: [x, 0.06, 0.18], rot: [0.9, 0, 0] }, 0);
  }
  // The duct: out of the cabinet's side, down the wall's face and off along the front.
  const dx = s * 0.27;
  b.box(0.08, 0.06, 0.08, FIBRE, { at: [dx, 0.08, 0.1] }, 0.01);
  b.box(
    0.08,
    FRONT_WALL_HEIGHT + 0.06,
    0.06,
    FIBRE,
    {
      at: [dx, 0.05 - (FRONT_WALL_HEIGHT + 0.06) / 2, 0.54],
    },
    0.01,
  );
  b.box(0.08, 0.06, 0.12, FIBRE, { at: [dx, 0.08, 0.5] }, 0.01);
  b.box(1.6, 0.06, 0.08, FIBRE, { at: [dx + s * 0.8, -FRONT_WALL_HEIGHT + 0.03, 0.6] }, 0.01);
  for (let k = 0; k < 4; k++)
    b.box(
      0.012,
      0.064,
      0.084,
      tint(FIBRE, -0.35),
      { at: [dx + s * (0.2 + k * 0.4), -FRONT_WALL_HEIGHT + 0.03, 0.6] },
      0,
    );
}

/**
 * The uplink at a ship hatch on the front edge: low, as everything in front
 * must be. On the low wall beside the hatch (`frameX` along from its
 * middle) the patch frame with its DEPLOY key, its DEPLOYED lamp and the
 * fibre duct away along the front.
 */
export function uplinkFrontModel(frameX: number | null): Model {
  const b = new ModelBuilder();
  if (frameX === null) return b.build();
  const s = Math.sign(frameX) || 1;
  patchFrame(framed(b, [frameX, FRONT_WALL_HEIGHT, -0.04], [0, 0, 0], 1.35), s);
  return b.build();
}

/**
 * The uplink at a ship hatch on a back or side edge (opening toward −z): a
 * dark steel frame round it with a lit DEPLOYED sign on the head and the
 * yellow fibre duct up over the wall.
 */
export function uplinkTallModel(span: number): Model {
  const b = new ModelBuilder();
  const top = WALL_HEIGHT;
  const half = span / 2;
  for (const s of [-1, 1])
    b.box(0.1, top, 0.16, RACK, { at: [s * (half - 0.05), top / 2, -0.36] }, 0.008);
  b.box(span + 0.02, 0.16, 0.18, RACK, { at: [0, top - 0.08, -0.36] }, 0.01);
  glowBox(b, 0.5, 0.1, 0.004, 0x1a5a2a, { at: [0, top - 0.08, -0.268] });
  text(b, 'DEPLOYED', 0, top - 0.08, -0.265, 0.011, 0xe8ffe8);
  b.box(
    0.08,
    top - STATION_HEIGHT,
    0.06,
    FIBRE,
    { at: [half - 0.16, (top + STATION_HEIGHT) / 2, -0.3] },
    0.01,
  );
  return b.build();
}

// ---- What hangs on the walls ----

/** A fire exit pictogram lit green at (0, cy) on the face at z. */
function fireExitSign(b: ModelBuilder, cy: number, z: number): void {
  b.box(0.34, 0.16, 0.04, 0xc8ccc6, { at: [0, cy, z] }, 0.008);
  glowBox(b, 0.31, 0.13, 0.004, 0x17533a, { at: [0, cy, z + 0.021] });
  const white = 0xeef0ea;
  const f = z + 0.024;
  b.box(0.006, 0.08, 0.004, white, { at: [0.07, cy, f] }, 0);
  b.box(0.006, 0.08, 0.004, white, { at: [0.12, cy, f] }, 0);
  b.box(0.056, 0.006, 0.004, white, { at: [0.095, cy + 0.04, f] }, 0);
  b.box(0.018, 0.018, 0.004, white, { at: [0.01, cy + 0.035, f] }, 0);
  b.box(0.014, 0.045, 0.004, white, { at: [0.0, cy + 0.005, f], rot: [0, 0, -0.4] }, 0);
  b.box(0.012, 0.04, 0.004, white, { at: [0.016, cy - 0.03, f], rot: [0, 0, 0.6] }, 0);
  b.box(0.012, 0.04, 0.004, white, { at: [-0.018, cy - 0.028, f], rot: [0, 0, -0.7] }, 0);
  b.box(0.04, 0.01, 0.004, white, { at: [0.0, cy + 0.012, f], rot: [0, 0, 0.3] }, 0);
  b.box(0.05, 0.012, 0.004, white, { at: [-0.08, cy, f] }, 0);
  b.add(new THREE.ConeGeometry(0.018, 0.03, 3), white, {
    at: [-0.11, cy, f],
    rot: [0, 0, Math.PI / 2],
  });
}

/**
 * Things hung on the basement's walls (all in front of z = 0.5), by name,
 * for the room's story pieces (see `basementRoom`), each within its
 * `BASEMENT_ART_HALF` of the tile's middle.
 */
export const BASEMENT_WALL_ART: Readonly<Record<string, () => Model>> = {
  runbook: () => {
    // The incident runbook: a whiteboard with the plan, "2. ???" circled in red.
    const b = new ModelBuilder();
    const w = BASEMENT_ART_HALF.runbook * 2;
    const [h, cy, z] = [0.56, 0.76, 0.515];
    b.box(w, h, 0.03, 0x9aa0a6, { at: [0, cy, z] }, 0.008);
    b.box(w - 0.04, h - 0.04, 0.006, 0xcfd1cc, { at: [0, cy, z + 0.016] }, 0);
    const f = z + 0.019;
    text(b, 'RUNBOOK', -0.14, cy + 0.2, f, 0.008, 0x2a4a8a);
    b.box(0.26, 0.004, 0.002, 0x2a4a8a, { at: [-0.14, cy + 0.17, f + 0.001] }, 0);
    text(b, 'P1 · 03:12', 0.2, cy + 0.2, f, 0.006, MARKER_RED);
    text(b, '1. BUILD IT', -0.06, cy + 0.1, f, 0.011, INK);
    text(b, '2. ???', -0.12, cy - 0.01, f, 0.011, INK);
    text(b, '3. PROFIT', -0.08, cy - 0.12, f, 0.011, INK);
    // The red circle round step 2, drawn in a hurry.
    const ring = new THREE.TorusGeometry(0.1, 0.006, 5, 28);
    ring.scale(1.45, 0.62, 1);
    b.add(ring, MARKER_RED, { at: [-0.12, cy - 0.01, f + 0.002], rot: [0, 0, 0.08] });
    b.box(
      0.08,
      0.008,
      0.002,
      MARKER_RED,
      { at: [0.08, cy + 0.02, f + 0.002], rot: [0, 0, 0.4] },
      0,
    );
    // The marker tray with a red marker in it.
    b.box(w - 0.1, 0.02, 0.05, 0x9aa0a6, { at: [0, cy - h / 2 - 0.005, z + 0.03] }, 0.004);
    b.box(
      0.12,
      0.018,
      0.018,
      MARKER_RED,
      { at: [0.2, cy - h / 2 + 0.012, z + 0.035], rot: [0, 0, Math.PI / 2 - 0.05] },
      0.005,
    );
    return b.build();
  },
  authorised: () => {
    // SERVER ROOM · AUTHORISED ONLY: a red header, white plate.
    const b = new ModelBuilder();
    const [cy, z] = [0.86, 0.512];
    b.box(0.58, 0.24, 0.012, 0xd8d8d2, { at: [0, cy, z] }, 0.004);
    b.box(0.56, 0.1, 0.004, 0xa82822, { at: [0, cy + 0.055, z + 0.007] }, 0);
    text(b, 'SERVER ROOM', 0, cy + 0.055, z + 0.009, 0.011, 0xf4f0ea);
    text(b, 'AUTHORISED ONLY', 0, cy - 0.055, z + 0.007, 0.0075, INK);
    for (const s of [-1, 1])
      b.cylinder(
        0.008,
        0.008,
        0.006,
        GALV,
        { at: [s * 0.25, cy, z + 0.008], rot: [Math.PI / 2, 0, 0] },
        8,
      );
    return b.build();
  },
  fireExit: () => {
    const b = new ModelBuilder();
    fireExitSign(b, 0.95, 0.53);
    return b.build();
  },
  breaker: () => {
    // The breaker box: grey steel, its door and latch, a lightning warning, conduits up to the coping.
    const b = new ModelBuilder();
    const [cy, z] = [0.66, 0.55];
    b.box(0.36, 0.46, 0.1, 0x8e9294, { at: [0, cy, z] }, 0.012);
    b.box(0.34, 0.44, 0.004, 0x9a9ea0, { at: [0, cy, z + 0.051] }, 0);
    b.box(0.004, 0.42, 0.004, 0x5a5e60, { at: [0.12, cy, z + 0.054] }, 0);
    b.box(0.02, 0.06, 0.016, 0x3a3c40, { at: [0.15, cy, z + 0.06] }, 0.004);
    b.add(new THREE.CircleGeometry(0.05, 3), 0xd8b42a, {
      at: [-0.04, cy + 0.1, z + 0.054],
      rot: [0, 0, Math.PI / 2],
    });
    b.box(0.012, 0.04, 0.002, INK, { at: [-0.04, cy + 0.1, z + 0.055], rot: [0, 0, 0.4] }, 0);
    b.box(0.2, 0.05, 0.003, PAPER, { at: [-0.04, cy - 0.1, z + 0.054] }, 0);
    text(b, 'MAINS', -0.04, cy - 0.1, z + 0.056, 0.007, INK);
    for (const x of [-0.1, 0.06])
      b.cylinder(
        0.022,
        0.022,
        WALL_HEIGHT - cy - 0.23,
        GALV,
        { at: [x, (WALL_HEIGHT + cy + 0.23) / 2 - 0.02, z - 0.02] },
        10,
      );
    return b.build();
  },
  thermostat: () => {
    // The thermostat: a beige box with its LCD reading 31°C, a sticky note under it.
    const b = new ModelBuilder();
    const [cy, z] = [0.92, 0.515];
    b.box(0.24, 0.16, 0.03, 0xc8c2b2, { at: [0, cy, z] }, 0.01);
    b.box(0.19, 0.08, 0.004, 0x101214, { at: [0, cy + 0.015, z + 0.016] }, 0);
    glowBox(b, 0.18, 0.07, 0.002, 0x2a1408, { at: [0, cy + 0.015, z + 0.0185] });
    text(b, '31°C', 0, cy + 0.015, z + 0.019, 0.011, 0xff7a3a);
    for (const x of [-0.06, 0, 0.06])
      b.box(0.03, 0.016, 0.006, 0x9a9484, { at: [x, cy - 0.05, z + 0.017] }, 0);
    b.box(0.12, 0.12, 0.003, 0xd8c860, { at: [0.02, cy - 0.17, z], rot: [0, 0, 0.06] }, 0);
    text(b, 'WHY', 0.02, cy - 0.15, z + 0.002, 0.007, INK);
    text(b, '???', 0.02, cy - 0.19, z + 0.002, 0.007, INK);
    return b.build();
  },
  unplug: () => {
    // PLEASE DO NOT UNPLUG: a paper note taped over a double socket with a fat plug in it.
    const b = new ModelBuilder();
    const z = 0.51;
    const g = framed(b, [0, 0.62, z], [0, 0, -0.05]);
    g.box(0.3, 0.26, 0.003, PAPER, { at: [0, 0, 0] }, 0);
    text(g, 'PLEASE', 0, 0.075, 0.002, 0.009, MARKER_RED);
    text(g, 'DO NOT', 0, 0.01, 0.002, 0.009, MARKER_RED);
    text(g, 'UNPLUG!', 0, -0.055, 0.002, 0.009, MARKER_RED);
    g.box(0.22, 0.006, 0.002, MARKER_RED, { at: [0, -0.095, 0.002] }, 0);
    for (const s of [-1, 1])
      g.box(0.09, 0.03, 0.004, 0xc8c4b0, { at: [s * 0.14, 0.13, 0.003], rot: [0, 0, s * 0.6] }, 0);
    b.box(0.22, 0.1, 0.03, 0xd2d0c4, { at: [0, 0.3, z + 0.005] }, 0.008);
    b.box(0.07, 0.07, 0.07, 0x2a2c30, { at: [-0.05, 0.3, z + 0.05] }, 0.01);
    b.box(0.03, 0.26, 0.03, 0x2a2c30, { at: [-0.05, 0.16, z + 0.08] }, 0.01);
    b.box(0.08, 0.02, 0.004, MARKER_RED, { at: [-0.05, 0.36, z + 0.086] }, 0);
    return b.build();
  },
};

// ---- Light fittings and the cable tray ----

/**
 * A fluorescent twin-tube batten, built hanging from the cable tray: its
 * top `BATTEN_DROP` under the tray (its origin), two drop rods up to it,
 * a pale steel housing with its two tubes lit cool white underneath.
 */
export function battenModel(): Model {
  const b = new ModelBuilder();
  const len = 0.7;
  for (const s of [-1, 1])
    b.box(0.012, BATTEN_DROP, 0.012, GALV, { at: [s * 0.26, BATTEN_DROP / 2, 0] }, 0);
  b.box(len, 0.04, 0.1, 0xa4a8aa, { at: [0, -0.02, 0] }, 0.008);
  b.box(len + 0.01, 0.012, 0.11, 0x8c9092, { at: [0, -0.002, 0] }, 0);
  for (const z of [-0.026, 0.026])
    b.add(
      new THREE.CylinderGeometry(0.016, 0.016, len - 0.06, 10),
      0xc8d6e0,
      {
        at: [0, -0.052, z],
        rot: [0, 0, Math.PI / 2],
      },
      'glow',
    );
  for (const s of [-1, 1])
    b.box(0.03, 0.04, 0.1, 0x8c9092, { at: [s * (len / 2 - 0.02), -0.05, 0] }, 0.006);
  return b.build();
}

/**
 * The cable tray for `tray`, built in world x and y round its row (place it
 * at z = `tray.z`): a galvanised ladder tray from end to end with the
 * cables laid in it (a yellow fibre among them), on uprights standing on
 * the back wall's coping behind, each with an arm out to the tray.
 */
export function trayModel(tray: Tray): Model {
  const b = new ModelBuilder();
  const { y, x0, x1 } = tray;
  const len = x1 - x0;
  const mid = (x0 + x1) / 2;
  const w = 0.2;
  for (const s of [-1, 1]) {
    b.box(len, 0.045, 0.012, GALV, { at: [mid, y + 0.02, s * (w / 2)] }, 0);
    b.box(len, 0.008, 0.024, tint(GALV, -0.15), { at: [mid, y, s * (w / 2 - 0.006)] }, 0);
  }
  for (let x = x0 + 0.15; x < x1 - 0.05; x += 0.3)
    b.box(0.02, 0.008, w, tint(GALV, -0.1), { at: [x, y + 0.002, 0] }, 0);
  // The cables in it: a black bundle, a grey one and the yellow fibre.
  for (const [z, r, col] of [
    [-0.05, 0.022, 0x1d1f22],
    [-0.01, 0.018, 0x2c2f33],
    [0.03, 0.018, 0x4a4e55],
    [0.065, 0.012, FIBRE],
  ] as const)
    b.cylinder(r, r, len - 0.04, col, { at: [mid, y + 0.008 + r, z], rot: [0, 0, Math.PI / 2] }, 8);
  // The uprights on the back wall's coping, each with an arm out to the tray and a base plate.
  const back = tray.back - tray.z;
  for (const p of tray.posts) {
    const h = y + 0.08 - WALL_HEIGHT;
    b.box(0.2, 0.012, 0.2, STEEL_DARK, { at: [p.x, WALL_HEIGHT + 0.006, back] }, 0.004);
    b.box(0.045, h, 0.045, GALV, { at: [p.x, WALL_HEIGHT + h / 2, back] }, 0.006);
    for (let k = 1; k < 5; k++)
      b.box(
        0.012,
        0.02,
        0.004,
        STEEL_DARK,
        { at: [p.x, WALL_HEIGHT + k * (h / 5), back + 0.024] },
        0,
      );
    const arm = -back + w / 2 + 0.02;
    b.box(0.04, 0.04, arm, GALV, { at: [p.x, y - 0.02, back + arm / 2] }, 0.006);
    b.box(0.03, 0.08, 0.03, GALV, { at: [p.x, y + 0.02, w / 2 + 0.02] }, 0);
  }
  return b.build();
}

/** Re-exported for the tests: how many floor variants and corners there are. */
export const RAISED_FLOOR_VARIANTS = FLOOR_VARIANTS;
