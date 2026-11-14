import * as THREE from 'three';
import { type ModelBuilder, tint } from '../kit';
import { tileHash } from '../../mapShape';
import { INK, looks, nth, rack, type SetPiece } from './shared';

/**
 * The world round the On Call level (`scenes/onCall.ts`): the basement under
 * the loft building at 3 AM. Behind the level, the building's poured-concrete
 * foundation wall (formwork panels, tie holes, damp streaks) with its light
 * wells up to the snowy street, pipes and a big duct on brackets, and the
 * concrete stair flight down from the lobby. Left, the boiler room (the old
 * boiler, its expansion tank, the NO STORAGE sign and the storage in front of
 * it, the night cleaner's cart); right, the bike storage and the chicken-wire
 * storage cage full of the startup's leftovers. In front, Moppy's empty
 * charging dock, the folded WET FLOOR sign, a drain and the yellow fibre
 * duct. Built like the rest of the set dressing, standing on the ground at
 * the origin and fronting +z. Nothing here is food or drink.
 */

/** Poured concrete: the panels' face, the joints between them, the tie holes. */
const CONCRETE = 0x666a6f;
const JOINT = 0x474a4e;
const TIE = 0x34332f;
/** A free-standing column's concrete: lighter, as it stands in the room's light. */
const COLUMN = 0x868b91;
/** Damp streaks under the wells, and the pale tide mark of salt they leave. */
const DAMP = 0x5c5b56;
const SALT = 0x9c9a92;
/** The stair flight's concrete, a little warmer than the wall's. */
const STAIR = 0xa49f94;
/** Sodium streetlight falling down a light well, its brighter top. */
const SODIUM = 0xff9a48;
const SODIUM_HI = 0xffbe6a;
/** Snow, cold white, bluer in the shade. */
const SNOW = 0xdfe6f0;
const SNOW_SHADE = 0xc0cada;
/** The night up a light well: the shaft's back face, its cheeks in deeper shade. */
const NIGHT = 0x1b2433;
const NIGHT_CHEEK = 0x151b26;
/** The back face's glow color: the outside's glow draws at 0.55, which brings this to `NIGHT`. */
const NIGHT_GLOW = 0x324260;
/** The light wells' steel window frames. */
const WELL_FRAME = 0x3a4048;
/** Painted black steel (frames, brackets), galvanised steel (ducts, the cage). */
const STEEL = 0x3c4046;
const GALV = 0xa9afb4;
/** Pipe lagging, the red sprinkler main, a grey conduit. */
const LAGGING = 0xd6d0c2;
const SPRINKLER = 0xa8443a;
const CONDUIT = 0x6a6e72;
/** Safety yellow and black. */
const YELLOW = 0xe2b62a;
const HAZARD_BLACK = 0x26272a;
/** Warm light: the lobby through its door and window, a desk lamp. */
const LOBBY = 0xffd9a0;
/** The lobby seen up its light well: one bright rectangle. */
const LOBBY_WINDOW = 0xf0d8a0;
const LAMP = 0xfff0b0;
/** Exit-sign green, Moppy's charging green. */
const GREEN = 0x5cf08a;
/** YOTTA's violet (on the banner); the balloon's violet foil. */
const VIOLET = 0x8a64d8;
const FOIL = 0xb0a0d8;

/** Built-to-measure pieces are cached, so the same scene gives the same pieces (and tests compare). */
const made = new Map<string, SetPiece>();
function once(key: string, make: () => SetPiece): SetPiece {
  let piece = made.get(key);
  if (!piece) {
    piece = make();
    made.set(key, piece);
  }
  return piece;
}

/** A number from 0 to 1 for (a, b) with `salt`. */
function hash01(a: number, b: number, salt: number): number {
  let h = tileHash(Math.round(a * 37) + salt * 7919, Math.round(b * 41) - salt * 31);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}

/** A plain (unbevelled) box in the glow layer. */
function glowBox(
  b: ModelBuilder,
  w: number,
  h: number,
  d: number,
  color: number,
  at: [number, number, number],
  rot?: [number, number, number],
): void {
  b.add(new THREE.BoxGeometry(w, h, d), color, rot ? { at, rot } : { at }, 'glow');
}

/** A flat box (no bevel): most of the architecture. */
function flat(
  b: ModelBuilder,
  w: number,
  h: number,
  d: number,
  color: number,
  at: [number, number, number],
  rot?: [number, number, number],
): void {
  b.box(w, h, d, color, rot ? { at, rot } : { at }, 0);
}

/** A bar from (x0, y0, z0) to (x1, y1, z1), `t` thick: a rail, a strut. */
function bar(
  b: ModelBuilder,
  [x0, y0, z0]: readonly [number, number, number],
  [x1, y1, z1]: readonly [number, number, number],
  t: number,
  color: number,
): void {
  const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
  const len = d.length();
  const g = new THREE.BoxGeometry(t, len, t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  b.add(g, color, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
}

// ---- Lettering ----

/** A blocky alphabet, 3 wide and 5 high. */
const FONT: Readonly<Record<string, string>> = {
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '111101101101111',
  P: '110101110100100',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  '1': '010110010010111',
  '2': '110001010100111',
  '!': '010010010000010',
  '·': '000000010000000',
  ' ': '000000000000000',
};

/** Whether every glyph of `text` is in the alphabet. */
export function spellable(text: string): boolean {
  return Array.from(text).every((ch) => ch in FONT);
}

/**
 * Letters for `text` centred on (x, y) on a face at depth z facing +z, each
 * pixel `px` square; a row's run of pixels is one box. In the glow layer when `lit`.
 */
function letters(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
  lit = false,
): void {
  const cols = text.length * 4 - 1;
  Array.from(text).forEach((ch, k) => {
    const glyph = FONT[ch] ?? '';
    for (let r = 0; r < 5; r++) {
      let c = 0;
      while (c < 3) {
        if (glyph[r * 3 + c] !== '1') {
          c++;
          continue;
        }
        let e = c;
        while (e < 3 && glyph[r * 3 + e] === '1') e++;
        const left = x + (k * 4 + c - cols / 2) * px;
        const at: [number, number, number] = [left + ((e - c) * px) / 2, y + (2 - r) * px, z];
        if (lit) glowBox(b, (e - c) * px, px, 0.006, color, at);
        else flat(b, (e - c) * px, px, 0.006, color, at);
        c = e;
      }
    }
  });
}

// ---- The foundation wall ----

/** A hole in the foundation wall: a light well, the light well with the lobby in it, the lobby door. */
export interface WallOpening {
  kind: 'well' | 'lobby' | 'door';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The foundation wall: `len` long along +x from x = 0, `height` tall, its face at z = 0. */
export interface FoundationPlan {
  len: number;
  height: number;
  openings: readonly WallOpening[];
  /** Big painted level marks ("B1") on the wall: their middle x and y. */
  marks?: readonly (readonly [number, number])[];
}

/** How thick the foundation wall is; how deep a light well's shaft goes back past its face. */
export const FOUNDATION_DEPTH = 0.5;
export const WELL_DEPTH = 0.6;
/** The lobby well is shallower, so its back face (the lobby window) shows; its desk's top above the sill. */
export const LOBBY_DEPTH = 0.45;
export const LOBBY_DESK = 0.5;
/** The formwork panels' size. */
const PANEL = { w: 1.2, h: 0.6 } as const;

/**
 * The building's poured-concrete foundation wall: formwork panels each a
 * shade of their own over darker joints, two tie holes per panel, damp
 * streaks and a salt tide mark under each light well. Light wells are deep
 * window shafts going up out of the frame: snow on the sill and a drift
 * against the window, a steel grating at the top with snow on its bars,
 * sodium light on the shaft's back face; in the `lobby` one, the lobby's lit
 * window with the guard's desk and its lamp. The `door` is the lobby door at
 * the top of the stairs, propped open on the lit lobby, an exit sign over it.
 */
export function foundationWall(plan: FoundationPlan): SetPiece {
  const key = `fw:${plan.len.toFixed(2)}:${plan.height}:${plan.openings
    .map((o) => `${o.kind}${o.x0.toFixed(2)},${o.x1.toFixed(2)},${o.y0},${o.y1}`)
    .join(';')}:${(plan.marks ?? []).map(([x, y]) => `${x.toFixed(2)},${y}`).join(';')}`;
  return once(key, () =>
    looks([plan.len, FOUNDATION_DEPTH], 1, (b) => {
      const { len, height, openings } = plan;
      const D = FOUNDATION_DEPTH;
      // Bands between every opening's top and bottom; in each band, the wall between the openings.
      const ys = [...new Set([0, height, ...openings.flatMap((o) => [o.y0, o.y1])])]
        .filter((y) => y >= 0 && y <= height)
        .sort((a, c) => a - c);
      const cells: [number, number, number, number][] = [];
      for (let k = 0; k + 1 < ys.length; k++) {
        const ya = ys[k] ?? 0;
        const yb = ys[k + 1] ?? 0;
        const cuts = openings
          .filter((o) => o.y0 <= ya + 1e-6 && o.y1 >= yb - 1e-6)
          .map((o) => [o.x0, o.x1] as const)
          .sort((p, q) => p[0] - q[0]);
        let x = 0;
        for (const [c0, c1] of cuts) {
          if (c0 > x) cells.push([x, c0, ya, yb]);
          x = Math.max(x, c1);
        }
        if (x < len) cells.push([x, len, ya, yb]);
      }
      for (const [x0, x1, y0, y1] of cells) {
        flat(b, x1 - x0, y1 - y0, D, JOINT, [(x0 + x1) / 2, (y0 + y1) / 2, -D / 2]);
        // Formwork panels: each its own shade, inset from their joints.
        for (let i = Math.floor(x0 / PANEL.w); i * PANEL.w < x1; i++)
          for (let j = Math.floor(y0 / PANEL.h); j * PANEL.h < y1; j++) {
            const off = j % 2 ? PANEL.w / 2 : 0;
            for (const ii of off ? [i - 1, i] : [i]) {
              const px0 = Math.max(x0, ii * PANEL.w + off + 0.009);
              const px1 = Math.min(x1, (ii + 1) * PANEL.w + off - 0.009);
              const py0 = Math.max(y0, j * PANEL.h + 0.009);
              const py1 = Math.min(y1, (j + 1) * PANEL.h - 0.009);
              if (px1 - px0 < 0.02 || py1 - py0 < 0.02) continue;
              const s = hash01(ii, j, 3);
              flat(b, px1 - px0, py1 - py0, 0.012, tint(CONCRETE, (s - 0.5) * 0.12), [
                (px0 + px1) / 2,
                (py0 + py1) / 2,
                0.004,
              ]);
              // Two tie holes, a third of the way in from each end, halfway up.
              for (const u of [0.25, 0.75]) {
                const tx = ii * PANEL.w + off + u * PANEL.w;
                const ty = j * PANEL.h + PANEL.h / 2;
                if (tx > x0 + 0.05 && tx < x1 - 0.05 && ty > y0 + 0.05 && ty < y1 - 0.05)
                  flat(b, 0.035, 0.035, 0.008, TIE, [tx, ty, 0.012]);
              }
            }
          }
      }
      // A damp patch low on the wall, with its salt tide mark.
      for (let x = 2.3; x < len - 1; x += 7.3) {
        flat(b, 1.4, 0.5, 0.006, DAMP, [x, 0.3, 0.013]);
        flat(b, 1.2, 0.03, 0.006, SALT, [x - 0.05, 0.56, 0.013]);
      }
      for (const o of openings) {
        if (o.kind === 'door') lobbyDoor(b, o);
        else lightWell(b, o, height);
      }
      // The car-park style level mark, faded yellow on a grey band.
      for (const [x, y] of plan.marks ?? []) {
        flat(b, 0.9, 0.62, 0.006, 0x8a8a86, [x, y, 0.014]);
        letters(b, 'B1', x, y, 0.02, 0.1, 0xd8b440);
      }
    }),
  );
}

/** A light well cut into the wall (see `foundationWall`). */
function lightWell(b: ModelBuilder, o: WallOpening, height: number): void {
  const { x0, x1, y0, y1 } = o;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const lobby = o.kind === 'lobby';
  const S = lobby ? LOBBY_DEPTH : WELL_DEPTH;
  const top = Math.min(height, y1 + 0.4);
  // The shaft: its cheeks and its back face, night-dark. Looking down through the window,
  // the camera sees the shaft's snowy floor and the lower part of its back face.
  for (const x of [x0 - 0.04, x1 + 0.04])
    flat(b, 0.08, top - y0, S, NIGHT_CHEEK, [x, (y0 + top) / 2, -S / 2]);
  // The back face in the glow layer, so the well's own sodium light can't warm it: night stays night.
  flat(b, w + 0.16, top - y0, 0.06, NIGHT_CHEEK, [cx, (y0 + top) / 2, -S - 0.03]);
  if (!lobby) b.screen(w + 0.08, top - y0, NIGHT_GLOW, { at: [cx, (y0 + top) / 2, -S + 0.001] });
  // Damp streaks down the wall under the sill, and the tide mark they dry to.
  for (const [dx, len] of [
    [-0.25, 0.9],
    [0.05, 1.3],
    [0.3, 0.7],
  ] as const)
    flat(b, 0.16, len, 0.006, DAMP, [cx + dx * w, y0 - len / 2 - 0.06, 0.013]);
  flat(b, w * 0.9, 0.025, 0.006, SALT, [cx, y0 - 0.52, 0.013]);
  // The sill out to the face, the shaft's floor behind the window deep in snow.
  flat(b, w + 0.12, 0.06, S + 0.08, tint(CONCRETE, 0.06), [cx, y0 - 0.03, -S / 2 + 0.04]);
  const wz = -0.12;
  flat(b, w, 0.06, S + wz, SNOW_SHADE, [cx, y0 + 0.03, (wz - S) / 2]);
  for (let k = 0; k < 5; k++) {
    const u = (k + 0.5) / 5;
    b.sphere(
      0.13,
      k % 2 ? SNOW_SHADE : SNOW,
      { at: [x0 + u * w, y0 + 0.06, wz - 0.12 - hash01(k, x0, 5) * (S - 0.3)] },
      [1.5, 0.5 + hash01(k, x0, 7) * 0.4, 1.1],
    );
  }
  // The drift banked against the glass.
  flat(b, w - 0.06, 0.16, 0.08, SNOW, [cx, y0 + 0.1, wz - 0.07], [0.45, 0, 0]);
  const fy = (y0 + y1) / 2;
  if (lobby) {
    // Up at street level, the lobby's lit window: one bright rectangle filling the back of the
    // shaft over the snow, the guard's desk across it (he sits at it), the green banker's lamp.
    const ly0 = y0 + 0.14;
    const lw = w - 0.04;
    flat(b, lw, top - ly0, 0.01, LOBBY_WINDOW, [cx, (ly0 + top) / 2, -S + 0.006]);
    // The window's own frame, dark against the light: a sill bar and a mullion high up.
    flat(b, lw, 0.04, 0.02, NIGHT, [cx, ly0, -S + 0.012]);
    flat(b, 0.035, top - ly0, 0.02, NIGHT, [cx + lw * 0.32, (ly0 + top) / 2, -S + 0.012]);
    // The desk: a dark top and front, in silhouette.
    const dy = LOBBY_DESK + y0;
    flat(b, lw * 0.92, 0.05, 0.16, 0x241c18, [cx, dy - 0.025, -S + 0.12]);
    flat(b, lw * 0.92, 0.2, 0.02, 0x1c1614, [cx, dy - 0.15, -S + 0.2]);
    // The lamp: brass stem, a green shade, its warm pool on the desk.
    const lx = cx + lw * 0.3;
    b.cylinder(0.012, 0.012, 0.14, 0x8a7440, { at: [lx, dy + 0.07, -S + 0.1] }, 5);
    b.box(0.2, 0.06, 0.08, 0x1e8a48, { at: [lx, dy + 0.15, -S + 0.12] }, 0.025);
    glowBox(b, 0.17, 0.012, 0.06, LAMP, [lx, dy + 0.115, -S + 0.12]);
    glowBox(b, 0.26, 0.006, 0.12, 0xffe0a0, [lx - 0.04, dy + 0.003, -S + 0.12]);
  } else {
    // Sodium only up top: a wedge of streetlight falling in from the right through the street
    // grating, over the top of what the camera sees of the back face (it looks down through the
    // window, so it sees the face from the sill to about half a unit under the lintel), fading
    // down into the night blue. Its dark bars are the grating's shadow.
    const visTop = y1 - 0.45;
    const wedge = (visTop - y0) * 0.38;
    const bands = 6;
    for (let k = 0; k < bands; k++) {
      const u = k / bands;
      const bh = wedge / bands;
      const bw = w * (0.9 - u * 0.5);
      const c = new THREE.Color(SODIUM_HI).lerp(new THREE.Color(NIGHT), u * 1.1).getHex();
      const y = visTop - bh * (k + 0.5);
      flat(b, bw, bh + 0.004, 0.004, c, [x1 - bw / 2 - 0.02 - u * 0.06, y, -S + 0.004]);
    }
    flat(b, w, top - visTop, 0.004, SODIUM, [cx, (visTop + top) / 2, -S + 0.004]);
    for (let x = x0 + 0.1; x < x1 - 0.04; x += 0.17)
      flat(
        b,
        0.035,
        wedge + (top - visTop),
        0.004,
        0x10141c,
        [x + 0.05, top - (wedge + top - visTop) / 2, -S + 0.008],
        [0, 0, 0.18],
      );
    // Flakes caught in the light, a few more down in the dark.
    for (let k = 0; k < 9; k++)
      flat(b, 0.024, 0.024, 0.01, SNOW, [
        x0 + 0.08 + hash01(k, x0, 11) * (w - 0.16),
        y0 + 0.3 + hash01(k, x0, 13) * (y1 - y0 - 0.4),
        -S * 0.5,
      ]);
  }
  // The window: a steel frame, a mullion and a transom (the lobby one just its frame), the glass.
  for (const x of lobby ? [x0 + 0.03, x1 - 0.03] : [x0 + 0.03, x1 - 0.03, cx])
    flat(b, 0.05, y1 - y0, 0.05, WELL_FRAME, [x, fy, wz]);
  for (const y of lobby ? [y0 + 0.03, y1 - 0.03] : [y0 + 0.03, y1 - 0.03, y0 + (y1 - y0) * 0.55])
    flat(b, w, 0.05, 0.05, WELL_FRAME, [cx, y, wz]);
  if (!lobby) b.pane(w - 0.06, y1 - y0 - 0.06, 0.01, 0x9aaabb, { at: [cx, fy, wz] });
}

/** The lobby door at the top of the stairs (see `foundationWall`). */
function lobbyDoor(b: ModelBuilder, o: WallOpening): void {
  const { x0, x1, y0, y1 } = o;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const D = FOUNDATION_DEPTH;
  // The reveal and the lit lobby beyond, a strip of its floor.
  for (const x of [x0 - 0.03, x1 + 0.03])
    flat(b, 0.06, y1 - y0, D, JOINT, [x, (y0 + y1) / 2, -D / 2]);
  b.screen(w, y1 - y0, LOBBY, { at: [cx, (y0 + y1) / 2, -D + 0.01] });
  flat(b, w, 0.03, D, 0x8a7a64, [cx, y0 + 0.015, -D / 2]);
  // The steel frame and the door, swung open into the stairwell, a wedge under it.
  for (const x of [x0 + 0.03, x1 - 0.03])
    flat(b, 0.06, y1 - y0, 0.06, STEEL, [x, (y0 + y1) / 2, 0.02]);
  flat(b, w, 0.08, 0.06, STEEL, [cx, y1 - 0.04, 0.02]);
  const leaf = w - 0.06;
  flat(
    b,
    leaf,
    y1 - y0 - 0.1,
    0.04,
    0x6a7078,
    [x1 - 0.02 - (leaf / 2) * Math.cos(1.25), (y0 + y1) / 2 - 0.03, (leaf / 2) * Math.sin(1.25)],
    [0, 1.25, 0],
  );
  b.box(
    0.08,
    0.04,
    0.1,
    YELLOW,
    { at: [x1 - 0.06 - leaf * Math.cos(1.25), y0 + 0.02, leaf * Math.sin(1.25) - 0.05] },
    0,
  );
  // The exit sign over it: green, a running figure's worth of white.
  flat(b, 0.42, 0.18, 0.04, 0x1e3a28, [cx, y1 + 0.2, 0.03]);
  glowBox(b, 0.38, 0.14, 0.01, GREEN, [cx, y1 + 0.2, 0.052]);
  flat(b, 0.06, 0.1, 0.006, 0xf4f8f0, [cx - 0.1, y1 + 0.2, 0.058]);
  flat(b, 0.16, 0.03, 0.006, 0xf4f8f0, [cx + 0.06, y1 + 0.2, 0.058]);
}

/**
 * The night guard asleep at the lobby desk (`breathe` alive), in silhouette
 * against the lit lobby: shoulders hunched forward, arms folded on the desk,
 * head down on them, the peaked cap tipped forward with its badge catching
 * the lamp. Small: he's seen up a light well. Stands on his chair's seat at
 * the origin, the desk's top 0.175 up and in front (+z).
 */
export const sleepingGuard = looks([0.5, 0.25], 1, (b) => {
  const navy = 0x1a2034;
  const cap = 0x1c2440;
  // The chair back, the hunched back and shoulders.
  flat(b, 0.3, 0.3, 0.04, 0x141414, [0, 0.05, -0.14]);
  b.box(0.36, 0.3, 0.16, navy, { at: [0, 0.1, -0.03], rot: [0.55, 0, 0] }, 0.05);
  // Arms folded on the desk.
  b.box(0.46, 0.08, 0.12, tint(navy, 0.08), { at: [0, 0.215, 0.08] }, 0.035);
  // The head on them, turned down; a pale ear and the back of the neck.
  b.sphere(0.085, 0x6a4c3c, { at: [0.02, 0.28, 0.05] });
  // The peaked cap, tipped forward over his eyes, the badge.
  b.cylinder(0.1, 0.105, 0.07, cap, { at: [0.02, 0.35, 0.05], rot: [0.6, 0, 0.12] }, 14);
  b.cylinder(
    0.11,
    0.11,
    0.02,
    tint(cap, -0.2),
    { at: [0.02, 0.33, 0.06], rot: [0.6, 0, 0.12] },
    14,
  );
  flat(b, 0.17, 0.016, 0.09, 0x0c1020, [0.03, 0.31, 0.15], [0.7, 0, 0.12]);
  b.sphere(0.018, 0xd8b850, { at: [0.025, 0.36, 0.12] });
});

// ---- Pipes and the duct along the wall ----

/**
 * Pipes on brackets along the wall, `len` long along +x from x = 0, their
 * backs at z = 0: a fat lagged heating pipe with straps, the red sprinkler
 * main, a grey conduit, a valve wheel now and then. Their heights are in
 * the model (the lowest at 1.38, just over the wall tops).
 */
export function pipeRun(len: number): SetPiece {
  return once(`pipes:${len.toFixed(2)}`, () =>
    looks([len, 0.3], 1, (b) => {
      const along = (r: number, y: number, z: number, c: number) =>
        b.cylinder(r, r, len, c, { at: [len / 2, y, z], rot: [0, 0, Math.PI / 2] }, 10);
      along(0.075, 1.44, 0.14, LAGGING);
      along(0.06, 1.9, 0.12, tint(LAGGING, -0.06));
      along(0.036, 1.66, 0.1, SPRINKLER);
      along(0.022, 1.75, 0.06, CONDUIT);
      for (let x = 0.4; x < len; x += 0.6)
        b.cylinder(
          0.079,
          0.079,
          0.03,
          tint(LAGGING, -0.2),
          { at: [x, 1.44, 0.14], rot: [0, 0, Math.PI / 2] },
          10,
        );
      for (let x = 0.2; x < len; x += 1.2) {
        flat(b, 0.04, 0.66, 0.03, STEEL, [x, 1.66, 0.015]);
        flat(b, 0.04, 0.03, 0.18, STEEL, [x, 1.83, 0.09]);
        flat(b, 0.04, 0.03, 0.22, STEEL, [x, 1.36, 0.11]);
        flat(b, 0.04, 0.03, 0.14, STEEL, [x, 1.62, 0.07]);
      }
      for (let x = 1.7; x < len; x += 4.3) {
        b.torus(0.07, 0.012, 0xb03a30, { at: [x, 1.66, 0.17] });
        flat(b, 0.012, 0.13, 0.012, 0xb03a30, [x, 1.66, 0.17]);
        b.cylinder(
          0.05,
          0.05,
          0.08,
          0x8a3028,
          { at: [x, 1.66, 0.12], rot: [Math.PI / 2, 0, 0] },
          8,
        );
      }
    }),
  );
}

/**
 * The big ventilation duct along the wall high up, `len` long along +x from
 * x = 0, its back at z = 0: galvanised, flanged every 1.2, on brackets, a
 * grille now and then. 4.1 high: over the light wells.
 */
export function airDuct(len: number): SetPiece {
  return once(`airduct:${len.toFixed(2)}`, () =>
    looks([len, 0.6], 1, (b) => {
      const y = 4.25;
      flat(b, len, 0.42, 0.5, GALV, [len / 2, y, 0.3]);
      for (let x = 0.3; x < len; x += 1.2) {
        flat(b, 0.04, 0.47, 0.55, tint(GALV, -0.14), [x, y, 0.3]);
        flat(b, 0.04, 0.04, 0.12, STEEL, [x + 0.3, y - 0.26, 0.04]);
        flat(b, 0.04, 0.52, 0.04, STEEL, [x + 0.3, y - 0.02, 0.02]);
        flat(b, 0.04, 0.03, 0.56, STEEL, [x + 0.3, y - 0.235, 0.3]);
      }
      for (let x = 1.6; x < len; x += 3.7) {
        flat(b, 0.42, 0.24, 0.02, tint(GALV, -0.3), [x, y - 0.02, 0.555]);
        for (let k = 0; k < 5; k++)
          flat(b, 0.38, 0.016, 0.02, tint(GALV, 0.1), [x, y - 0.12 + k * 0.05, 0.565]);
      }
      // Seam lines along it.
      flat(b, len, 0.012, 0.006, tint(GALV, -0.2), [len / 2, y + 0.1, 0.553]);
    }),
  );
}

// ---- The stairs ----

/** How high and how deep each step is (about). */
const STEP = { rise: 0.18, run: 0.29 } as const;
/** The stair flight's width. */
export const STAIR_WIDTH = 0.82;

/**
 * A poured-concrete stair flight rising along +x from its foot at x = 0 to
 * `rise` over `run`, then a landing `landing` deep: solid under the steps,
 * a yellow nosing on every tread, a stepped concrete upstand on the −z side
 * and a yellow steel handrail on posts on the +z side.
 */
export function stairFlight(run: number, rise: number, landing: number): SetPiece {
  return once(`stairs:${run.toFixed(2)}:${rise.toFixed(2)}:${landing.toFixed(2)}`, () =>
    looks([run + landing, STAIR_WIDTH], 1, (b) => {
      const n = Math.max(4, Math.round(rise / STEP.rise));
      const t = run / n;
      const h = rise / n;
      const W = STAIR_WIDTH;
      for (let i = 0; i < n; i++) {
        const top = (i + 1) * h;
        const tone = tint(STAIR, (hash01(i, 0, 17) - 0.5) * 0.06);
        flat(b, t, top, W, tone, [i * t + t / 2, top / 2, 0]);
        flat(b, 0.045, 0.012, W, YELLOW, [i * t + 0.03, top + 0.004, 0]);
        // The upstand on the −z side.
        flat(b, t, top + 0.42, 0.1, tint(STAIR, -0.06), [
          i * t + t / 2,
          (top + 0.42) / 2,
          -W / 2 - 0.05,
        ]);
      }
      flat(b, landing, rise, W, STAIR, [run + landing / 2, rise / 2, 0]);
      flat(b, landing, rise + 0.42, 0.1, tint(STAIR, -0.06), [
        run + landing / 2,
        (rise + 0.42) / 2,
        -W / 2 - 0.05,
      ]);
      // A scuffed path up the middle of the treads.
      flat(b, run, 0.004, 0.26, tint(STAIR, -0.12), [run / 2, 0.002, 0.02]);
      // The handrail: posts every other step, a sloped top rail and a mid rail.
      const z = W / 2 - 0.05;
      const railH = 0.78;
      for (let i = 0; i <= n; i += 2) {
        const x = Math.min(run - 0.05, i * t + 0.08);
        const y = Math.min(rise, (Math.floor(x / t) + 1) * h);
        flat(b, 0.03, railH, 0.03, YELLOW, [x, y + railH / 2, z]);
      }
      for (const y of [railH, railH * 0.5])
        bar(b, [0.08, h + y, z], [run, rise + y, z], 0.03, YELLOW);
      bar(b, [run, rise + railH, z], [run + landing - 0.05, rise + railH, z], 0.03, YELLOW);
      flat(b, 0.03, railH, 0.03, YELLOW, [run + landing - 0.05, rise + railH / 2, z]);
    }),
  );
}

// ---- The boiler room ----

/** The boiler's silver-grey lagging jacket, its band clamps; the oxide red left only on the burner door. */
const JACKET = 0x8e9496;
const JACKET_BAND = 0x5e6466;
const OXIDE = 0x7a3a2a;
/** The flue's black, and where the boiler's pipe stubs end (`boilerMains` takes them up from there). */
const FLUE = 0x2a2828;
export const BOILER_STUB = { flow: 1.6, flue: 1.75 } as const;
/** Where the flow riser, the return and the flue leave the boiler, in its own space (x, z). */
const FLOW_AT = [-0.26, -0.12] as const;
const RETURN_AT = [0.3, -0.5] as const;
const FLUE_AT = [0.02, -0.28] as const;
/** The safety valve on top, where the steam comes from: x, top y, z. */
export const BOILER_VALVE = [0.3, 1.5, 0.12] as const;

/**
 * The building's old boiler: a cylinder in a silver-grey lagging jacket
 * with clamped bands and a domed top, on a plinth; the burner box at its
 * foot with its oxide-red door and the little flame window (glow: `hot`);
 * a big pressure gauge on a stalk tilted up at the camera, two small ones
 * beside it; the stubs of the lagged flow riser (a red valve wheel on it)
 * and the black flue, which `boilerMains` takes up and back into the wall,
 * and the return's outlet low on its back. 1.75 high to the flue stub.
 */
export const boiler = looks([1.4, 1.4], 1, (b) => {
  const r = 0.6;
  flat(b, 1.4, 0.1, 1.3, 0x5c5e60, [0, 0.05, 0]);
  b.cylinder(r, r, 1.2, JACKET, { at: [0, 0.7, 0] }, 24);
  b.sphere(r, JACKET, { at: [0, 1.3, 0] }, [1, 0.35, 1]);
  for (const y of [0.18, 0.62, 1.12])
    b.cylinder(r + 0.015, r + 0.015, 0.05, JACKET_BAND, { at: [0, y, 0] }, 24);
  // The jacket's seams, a brass maker's plate.
  for (const a of [-0.6, 0.55])
    flat(b, 0.012, 1.1, 0.012, tint(JACKET, -0.18), [Math.sin(a) * r, 0.7, Math.cos(a) * r]);
  flat(b, 0.3, 0.12, 0.01, 0xb89a50, [0.15, 0.45, r - 0.02]);
  // The burner box, its oxide-red door with the flame window.
  b.box(0.5, 0.3, 0.26, 0x3a3634, { at: [-0.05, 0.25, r - 0.02] }, 0.015);
  b.box(0.44, 0.26, 0.03, OXIDE, { at: [-0.05, 0.25, r + 0.115] }, 0.01);
  flat(b, 0.3, 0.15, 0.02, 0x1a1816, [-0.05, 0.26, r + 0.13]);
  glowBox(b, 0.26, 0.12, 0.012, 0xff7a24, [-0.05, 0.26, r + 0.135]);
  glowBox(b, 0.14, 0.05, 0.012, 0xffc860, [-0.05, 0.245, r + 0.138]);
  for (let x = -0.15; x <= 0.06; x += 0.06)
    flat(b, 0.01, 0.13, 0.01, 0x1a1816, [x, 0.26, r + 0.146]);
  flat(b, 0.03, 0.08, 0.03, 0x9a9ea2, [0.14, 0.26, r + 0.14]);
  // The big pressure gauge on its stalk, its face tilted up at the camera; two small ones.
  const gauge = (x: number, y: number, z: number, s: number, tilt: number) => {
    const rot: [number, number, number] = [Math.PI / 2 - tilt, 0, 0];
    b.cylinder(s, s, 0.04, 0x1c1c1e, { at: [x, y, z], rot }, 18);
    const fx = (d: number): [number, number, number] => [
      x,
      y + Math.sin(tilt) * d,
      z + Math.cos(tilt) * d,
    ];
    b.cylinder(s * 0.84, s * 0.84, 0.01, 0xf2ecdc, { at: fx(0.022), rot }, 18);
    // The red band at the top of the scale, the needle.
    const [ax, ay, az] = fx(0.03);
    flat(
      b,
      s * 0.5,
      s * 0.12,
      0.006,
      0xc02820,
      [ax + s * 0.2, ay + Math.cos(tilt) * s * 0.55, az - Math.sin(tilt) * s * 0.55],
      [-tilt, 0, -0.5],
    );
    flat(
      b,
      s * 0.75,
      0.012,
      0.006,
      0x1c1c1e,
      [ax + s * 0.18, ay + Math.cos(tilt) * s * 0.18, az - Math.sin(tilt) * s * 0.18],
      [-tilt, 0, 0.75],
    );
  };
  b.cylinder(
    0.018,
    0.018,
    0.16,
    0x9a9ea2,
    { at: [0.0, 1.0, r + 0.07], rot: [Math.PI / 2, 0, 0] },
    6,
  );
  gauge(0.0, 1.0, r + 0.16, 0.13, 0.75);
  gauge(-0.3, 0.88, Math.sqrt(r * r - 0.09) + 0.03, 0.065, 0.2);
  gauge(0.3, 0.88, Math.sqrt(r * r - 0.09) + 0.03, 0.065, 0.2);
  // The flow riser's stub up out of the dome, its red valve wheel; the return's outlet behind.
  const [fx0, fz0] = FLOW_AT;
  b.cylinder(
    0.075,
    0.075,
    BOILER_STUB.flow - 1.3,
    LAGGING,
    { at: [fx0, (BOILER_STUB.flow + 1.3) / 2, fz0] },
    10,
  );
  b.torus(0.09, 0.016, 0xc03a30, { at: [fx0, 1.5, fz0 + 0.12] });
  flat(b, 0.18, 0.016, 0.016, 0xc03a30, [fx0, 1.5, fz0 + 0.12]);
  b.cylinder(
    0.02,
    0.02,
    0.12,
    0x8a3028,
    { at: [fx0, 1.5, fz0 + 0.06], rot: [Math.PI / 2, 0, 0] },
    6,
  );
  const [rx, rz] = RETURN_AT;
  b.cylinder(0.07, 0.07, 0.16, LAGGING, { at: [rx, 1.0, rz - 0.06], rot: [Math.PI / 2, 0, 0] }, 10);
  // The safety valve on top (the steam comes from here), the flue's stub.
  const [vx, vy, vz] = BOILER_VALVE;
  b.cylinder(0.035, 0.035, 0.2, 0xb89a50, { at: [vx, vy - 0.1, vz] }, 8);
  b.cylinder(0.05, 0.05, 0.03, 0xb89a50, { at: [vx, vy - 0.02, vz] }, 8);
  const [qx, qz] = FLUE_AT;
  b.cylinder(
    0.12,
    0.12,
    BOILER_STUB.flue - 1.3,
    FLUE,
    { at: [qx, (BOILER_STUB.flue + 1.3) / 2, qz] },
    12,
  );
  b.cylinder(0.14, 0.14, 0.05, 0x3a3838, { at: [qx, 1.38, qz] }, 12);
});

/**
 * The boiler's pipes from its stubs up and back into the foundation wall,
 * for a boiler at the origin turned by `yaw` whose wall face is `back`
 * behind it (at z = −back): the flow riser up to the wall's upper lagged
 * main (1.9) and teed into it, the return from its back along under the
 * mains and up into the lower one (1.44), the flue up to 2.3 and through
 * the wall in a collar on a bracket. Backdrop: it runs up under the order
 * cards.
 */
export function boilerMains(back: number, yaw: number): SetPiece {
  return once(`mains:${back.toFixed(2)}:${yaw.toFixed(2)}`, () =>
    looks([1.4, back], 1, (b) => {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const at = ([x, z]: readonly [number, number]): [number, number] => [
        x * c + z * s,
        -x * s + z * c,
      ];
      /** A pipe of radius `r` from a to b (axis-aligned runs), an elbow ball at b. */
      const pipe = (
        r: number,
        a: [number, number, number],
        e: [number, number, number],
        color: number,
        seg = 10,
      ) => {
        const len = Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]);
        const mid: [number, number, number] = [
          (a[0] + e[0]) / 2,
          (a[1] + e[1]) / 2,
          (a[2] + e[2]) / 2,
        ];
        const along = Math.abs(e[1] - a[1]) > 1e-6 ? 'y' : Math.abs(e[2] - a[2]) > 1e-6 ? 'z' : 'x';
        const rot: [number, number, number] =
          along === 'y' ? [0, 0, 0] : along === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
        b.cylinder(r, r, len, color, { at: mid, rot }, seg);
        b.sphere(r * 1.04, color, { at: e });
      };
      const wall = -back;
      // Flow: up from its stub to 1.9, back to the upper main, a tee clamp round it.
      const [fx, fz] = at(FLOW_AT);
      pipe(0.075, [fx, BOILER_STUB.flow, fz], [fx, 1.9, fz], LAGGING);
      pipe(0.075, [fx, 1.9, fz], [fx, 1.9, wall + 0.12], LAGGING);
      b.cylinder(
        0.085,
        0.085,
        0.2,
        tint(LAGGING, -0.2),
        { at: [fx, 1.9, wall + 0.12], rot: [0, 0, Math.PI / 2] },
        10,
      );
      for (let z = fz - 0.4; z > wall + 0.3; z -= 0.6)
        b.cylinder(
          0.079,
          0.079,
          0.03,
          tint(LAGGING, -0.2),
          { at: [fx, 1.9, z], rot: [Math.PI / 2, 0, 0] },
          10,
        );
      // Return: out of its back at 1.0, along to the wall, up into the lower main.
      const [rx, rz] = at([RETURN_AT[0], RETURN_AT[1] - 0.14]);
      pipe(0.07, [rx, 1.0, rz], [rx, 1.0, wall + 0.14], LAGGING);
      pipe(0.07, [rx, 1.0, wall + 0.14], [rx, 1.44, wall + 0.14], LAGGING);
      b.cylinder(
        0.085,
        0.085,
        0.2,
        tint(LAGGING, -0.2),
        { at: [rx, 1.44, wall + 0.14], rot: [0, 0, Math.PI / 2] },
        10,
      );
      flat(b, 0.04, 0.03, 0.16, STEEL, [rx, 0.93, wall + 0.08]);
      flat(b, 0.04, 0.12, 0.03, STEEL, [rx, 0.92, wall + 0.015]);
      // Flue: up from its stub to 2.3, back through the wall in a collar, a bracket under it.
      const [qx, qz] = at(FLUE_AT);
      pipe(0.12, [qx, BOILER_STUB.flue, qz], [qx, 2.3, qz], FLUE, 12);
      pipe(0.12, [qx, 2.3, qz], [qx, 2.3, wall + 0.02], FLUE, 12);
      b.cylinder(
        0.16,
        0.16,
        0.05,
        0x3a3838,
        { at: [qx, 2.3, wall + 0.03], rot: [Math.PI / 2, 0, 0] },
        12,
      );
      b.cylinder(0.13, 0.13, 0.04, 0x3a3838, { at: [qx, 2.0, qz] }, 12);
      flat(b, 0.05, 0.04, 0.3, STEEL, [qx, 2.16, wall + 0.17]);
      bar(b, [qx, 1.95, wall + 0.02], [qx, 2.15, wall + 0.3], 0.035, STEEL);
    }),
  );
}

/**
 * The expansion tank: a grey-red vessel lying on a black wall bracket at
 * 1.1, a gauge on its end and a pipe down to the floor.
 */
export const expansionTank = looks([0.9, 0.5], 1, (b) => {
  for (const x of [-0.25, 0.25]) {
    flat(b, 0.05, 1.0, 0.05, STEEL, [x, 0.5, -0.12]);
    flat(b, 0.05, 0.05, 0.42, STEEL, [x, 0.96, 0.05]);
  }
  b.capsule(0.2, 0.5, 0x9a5a50, { at: [0, 1.2, 0.05], rot: [0, 0, Math.PI / 2] });
  b.cylinder(0.05, 0.05, 0.03, 0x222224, { at: [0.47, 1.22, 0.05], rot: [0, 0, Math.PI / 2] }, 12);
  b.cylinder(
    0.042,
    0.042,
    0.01,
    0xf2ecdc,
    { at: [0.487, 1.22, 0.05], rot: [0, 0, Math.PI / 2] },
    12,
  );
  b.cylinder(0.025, 0.025, 1.0, LAGGING, { at: [-0.1, 0.5, 0.05] }, 8);
});

/**
 * The "BOILER ROOM · NO STORAGE" sign on two black posts: a white plate,
 * black and red letters; its plate's middle 1.0 up.
 */
export const boilerSign = looks([1.3, 0.1], 1, (b) => {
  const y = 1.0;
  for (const x of [-0.55, 0.55]) flat(b, 0.04, y + 0.2, 0.04, STEEL, [x, (y + 0.2) / 2, -0.03]);
  flat(b, 1.28, 0.46, 0.02, 0xf2efe6, [0, y, 0]);
  flat(b, 1.28, 0.2, 0.022, 0xb8302a, [0, y - 0.11, 0]);
  letters(b, 'BOILER ROOM', 0, y + 0.1, 0.013, 0.026, 0x1c1c1c);
  letters(b, 'NO STORAGE', 0, y - 0.11, 0.015, 0.026, 0xf2efe6);
});

/** Steam from a valve (`wisp` alive): a short column of pale puffs. */
export const steamWisp = looks([0.3, 0.3], 1, (b) => {
  for (const [x, y, z, r] of [
    [0, 0.04, 0, 0.05],
    [0.02, 0.1, 0.02, 0.075],
    [-0.02, 0.19, 0.03, 0.1],
    [0.03, 0.3, 0.02, 0.12],
  ] as const)
    b.sphere(r, 0xe6e8ec, { at: [x, y, z] }, [1.2, 0.8, 1]);
});

/**
 * Steel shelving against a wall with the building's junk: paint tins,
 * a toolbox, rolled dust sheets, a box of light tubes. 1.5 high.
 */
export const junkShelf = looks([1.0, 0.45], 2, (b, v) => {
  for (const x of [-0.47, 0.47])
    for (const z of [-0.18, 0.18]) flat(b, 0.035, 1.5, 0.035, 0x6a6e72, [x, 0.75, z]);
  for (const y of [0.1, 0.55, 1.0, 1.45]) flat(b, 0.98, 0.025, 0.42, 0x7a7e82, [0, y, 0]);
  const tins = [0xc8c4ba, 0x8a98a4, 0xa8a080, 0xd4d0c8, 0x8a7066];
  for (let k = 0; k < 4; k++) {
    const x = -0.33 + k * 0.2;
    b.cylinder(0.075, 0.075, 0.16, nth(tins, k + v), { at: [x, 0.19, 0.04] }, 12);
    b.cylinder(0.072, 0.072, 0.01, 0x8a8a8a, { at: [x, 0.275, 0.04] }, 12);
  }
  flat(b, 0.4, 0.16, 0.2, v ? 0x7a4a44 : 0x44546a, [-0.2, 0.645, 0.02]);
  b.cylinder(0.08, 0.08, 0.5, 0xbcb6aa, { at: [0.22, 0.65, 0.02], rot: [0, 0, Math.PI / 2] }, 10);
  // Grey archive bins on the top two shelves, white label cards on their fronts.
  for (const [y, n] of [
    [1.03, 3],
    [1.47, 2 + v],
  ] as const)
    for (let k = 0; k < n; k++) {
      const x = -0.31 + k * 0.31 + (y > 1.2 ? 0.05 : 0);
      archiveBin(b, x, y, 0, (k + v) % 2 ? 0.06 : -0.04);
    }
});

/** Archive storage: a box's muted cardboard, its lid; the grey plastic archive bins. */
const ARCHIVE_BOX = 0x867c6a;
const ARCHIVE_LID = 0x787060;
const BIN = 0x5a6068;

/** A grey plastic archive bin standing at (x, y, z), turned by `yaw`: lid, handle slot, label card. */
function archiveBin(b: ModelBuilder, x: number, y: number, z: number, yaw: number): void {
  b.box(0.28, 0.2, 0.34, BIN, { at: [x, y + 0.1, z], rot: [0, yaw, 0] }, 0.015);
  b.box(0.3, 0.025, 0.36, tint(BIN, -0.15), { at: [x, y + 0.205, z], rot: [0, yaw, 0] }, 0.008);
  const fx = x + Math.sin(yaw) * 0.172;
  const fz = z + Math.cos(yaw) * 0.172;
  flat(b, 0.12, 0.07, 0.004, 0xe4e2da, [fx, y + 0.1, fz], [0, yaw, 0]);
  flat(b, 0.08, 0.012, 0.004, 0x2a2c30, [fx, y + 0.115, fz + Math.cos(yaw) * 0.003], [0, yaw, 0]);
}

/**
 * A stack of archive boxes, 2 to 3 high: muted cardboard, the lids a shade
 * darker, a white label on each front, one box knocked askew. Looks: 0 two
 * high, 1 three high, 2 two high with a third beside it.
 */
export const archiveBoxes = looks([0.8, 0.5], 3, (b, v) => {
  const box = (x: number, y: number, z: number, h: number, yaw: number, k: number) => {
    const c = tint(ARCHIVE_BOX, (hash01(k, v, 19) - 0.5) * 0.1);
    b.box(0.46, h, 0.36, c, { at: [x, y + h / 2, z], rot: [0, yaw, 0] }, 0.012);
    b.box(0.48, 0.04, 0.38, ARCHIVE_LID, { at: [x, y + h - 0.01, z], rot: [0, yaw, 0] }, 0.008);
    const fx = x + Math.sin(yaw) * 0.182;
    const fz = z + Math.cos(yaw) * 0.182;
    flat(b, 0.14, 0.08, 0.004, 0xe8e4d8, [fx - 0.08, y + h * 0.45, fz], [0, yaw, 0]);
    flat(b, 0.1, 0.06, 0.004, 0x2a2420, [fx + 0.12, y + h * 0.55, fz], [0, yaw, 0]);
  };
  const high = v === 1 ? 3 : 2;
  let y = 0;
  for (let k = 0; k < high; k++) {
    const h = 0.28 - k * 0.02;
    box(
      (hash01(k, v, 3) - 0.5) * 0.06,
      y,
      (hash01(k, v, 5) - 0.5) * 0.05,
      h,
      (hash01(k, v, 7) - 0.5) * 0.3,
      k,
    );
    y += h;
  }
  if (v === 2) box(0.5, 0, 0.04, 0.28, 0.25, 5);
});

/**
 * A low pallet of archive bins on the floor: a muted wooden pallet, two
 * layers of grey bins under shrink-wrap, a label. 0.55 high.
 */
export const archivePallet = looks([1.0, 0.8], 1, (b) => {
  const wood = 0x6e6250;
  for (const z of [-0.33, 0, 0.33]) flat(b, 0.96, 0.08, 0.1, tint(wood, -0.1), [0, 0.04, z]);
  for (let k = 0; k < 5; k++) flat(b, 0.16, 0.03, 0.8, wood, [-0.4 + k * 0.2, 0.095, 0]);
  for (let layer = 0; layer < 2; layer++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        if (layer === 1 && i === 2 && j === 0) continue;
        archiveBin(b, -0.31 + i * 0.31, 0.11 + layer * 0.215, -0.18 + j * 0.37, 0);
      }
  // A torn tail of shrink-wrap on the floor, the pallet's label.
  flat(b, 0.2, 0.004, 0.12, 0xb8c0c6, [0.52, 0.01, 0.2], [0, 0.4, 0]);
  flat(b, 0.16, 0.06, 0.004, 0xe8e4d8, [0.2, 0.05, 0.402]);
});

/**
 * A low pipe along the floor on concrete saddles, `len` long along +x from
 * x = 0: a lagged return run with a red gate-valve wheel standing on it
 * and a strap now and then. Under 0.45 high.
 */
export function floorPipe(len: number): SetPiece {
  return once(`floorpipe:${len.toFixed(2)}`, () =>
    looks([len, 0.3], 1, (b) => {
      const y = 0.14;
      b.cylinder(
        0.08,
        0.08,
        len,
        tint(LAGGING, -0.12),
        { at: [len / 2, y, 0], rot: [0, 0, Math.PI / 2] },
        10,
      );
      for (let x = 0.3; x < len; x += 0.9) {
        flat(b, 0.12, 0.08, 0.22, 0x5a5c5e, [x, 0.04, 0]);
        b.cylinder(
          0.084,
          0.084,
          0.03,
          tint(LAGGING, -0.3),
          { at: [x, y, 0], rot: [0, 0, Math.PI / 2] },
          10,
        );
      }
      // The gate valve: its body, the spindle, the red wheel facing up and toward the camera.
      const vx = Math.min(len - 0.3, len * 0.6);
      b.cylinder(0.11, 0.11, 0.16, 0x4a4c4e, { at: [vx, y, 0], rot: [0, 0, Math.PI / 2] }, 10);
      b.cylinder(0.02, 0.02, 0.2, 0x8a8e92, { at: [vx, y + 0.17, 0] }, 6);
      b.torus(0.1, 0.018, 0xb03a30, { at: [vx, y + 0.28, 0.02], rot: [-1.1, 0, 0] });
      flat(b, 0.19, 0.02, 0.02, 0xb03a30, [vx, y + 0.28, 0.02], [-1.1, 0, 0]);
    }),
  );
}

/**
 * The night cleaner's hair and headphones, fitted over a scene person's
 * head (place it at her feet, turned as she is): dark hair pulled back into
 * a bun, a yellow headband over the top, its ear cups.
 */
export const cleanerHeadgear = looks([0.5, 0.5], 1, (b) => {
  const hair = 0x3a302a;
  const yellow = 0xc8a83e;
  b.sphere(0.232, hair, { at: [0, 0.78, -0.04] }, [1.0, 0.78, 0.95]);
  b.sphere(0.095, hair, { at: [0, 0.95, -0.17] });
  b.torus(0.04, 0.012, tint(hair, -0.2), { at: [0, 0.92, -0.13], rot: [1.0, 0, 0] });
  b.torus(0.245, 0.022, yellow, { at: [0, 0.72, 0.0] }, Math.PI);
  for (const x of [-0.245, 0.245])
    b.cylinder(0.075, 0.075, 0.06, yellow, { at: [x, 0.71, 0.01], rot: [0, 0, Math.PI / 2] }, 12);
});

/**
 * The night cleaner's cart: a grey plastic trolley with a yellow mop bucket
 * and wringer, the mop standing in it, a black bin bag on its hook, spray
 * bottles and a roll of blue towel on its shelf.
 */
export const cleaningCart = looks([0.9, 0.5], 1, (b) => {
  const plastic = 0x5a5e62;
  flat(b, 0.8, 0.04, 0.42, plastic, [0, 0.12, 0]);
  flat(b, 0.8, 0.04, 0.42, plastic, [0, 0.62, 0]);
  for (const x of [-0.38, 0.38])
    for (const z of [-0.19, 0.19]) flat(b, 0.03, 0.62, 0.03, plastic, [x, 0.38, z]);
  for (const x of [-0.34, 0.34])
    for (const z of [-0.16, 0.16]) b.sphere(0.04, INK, { at: [x, 0.04, z] });
  // The bin bag on the end.
  b.sphere(0.2, 0x1e1e22, { at: [0.52, 0.32, 0] }, [0.8, 1.3, 0.9]);
  // Spray bottles and the towel roll on top.
  for (const [x, c] of [
    [-0.28, 0x6ab0d8],
    [-0.18, 0x7ad08a],
    [-0.08, 0xd8d0e8],
  ] as const) {
    b.cylinder(0.035, 0.035, 0.16, c, { at: [x, 0.72, 0.08] }, 8);
    flat(b, 0.03, 0.05, 0.05, 0xf2f2f2, [x, 0.82, 0.08]);
  }
  b.cylinder(0.07, 0.07, 0.2, 0x7aa8d8, { at: [0.15, 0.71, 0], rot: [0, 0, Math.PI / 2] }, 10);
  flat(b, 0.34, 0.2, 0.3, 0x8a8e92, [-0.15, 0.24, 0]);
});

/** A yellow mop bucket on castors with its wringer and the mop standing in it. */
export const mopBucket = looks([0.5, 0.4], 1, (b) => {
  b.box(0.42, 0.26, 0.32, 0xe2b62a, { at: [0, 0.17, 0] }, 0.03);
  for (const x of [-0.17, 0.17])
    for (const z of [-0.12, 0.12]) b.sphere(0.03, INK, { at: [x, 0.03, z] });
  flat(b, 0.38, 0.03, 0.28, 0x5a7a9a, [0, 0.28, 0]);
  flat(b, 0.16, 0.14, 0.24, 0x4a4e52, [0.1, 0.36, 0]);
  flat(b, 0.03, 0.03, 0.4, 0x4a4e52, [0.16, 0.42, 0.1], [0.6, 0, 0]);
  b.cylinder(0.014, 0.014, 0.9, 0xc8c8cc, { at: [-0.08, 0.6, -0.04], rot: [0.12, 0, 0.18] }, 6);
  b.sphere(0.07, 0xe8e4d8, { at: [-0.04, 0.24, -0.02] }, [1.2, 0.6, 1]);
});

// ---- Bikes and the storage cage ----

/** Bike frames: muted. */
const FRAMES = [0x5a7a7a, 0x8a5a4a, 0x6a6a7a, 0x9a9a8a, 0x4a5a6a] as const;

/**
 * A bike side-on along x, on its kickstand: two wheels, a diamond frame, a
 * saddle and bars. Looks: 0 plain, 1 with a child seat on the back, 2 with
 * a front basket, 3 a road bike with drop bars, 4 with a pannier.
 */
export const bike = looks([1.0, 0.3], 5, (b, v) => {
  const frame = nth(FRAMES, v);
  const r = 0.2;
  const y = r + 0.01;
  for (const x of [-0.31, 0.31]) {
    b.torus(r, 0.024, INK, { at: [x, y, 0] });
    b.torus(r - 0.03, 0.006, 0x9a9ea2, { at: [x, y, 0] });
  }
  const p = (x: number, yy: number): [number, number, number] => [x, yy, 0];
  bar(b, p(-0.31, y), p(-0.03, y), 0.028, frame);
  bar(b, p(-0.31, y), p(-0.1, y + 0.28), 0.026, frame);
  bar(b, p(-0.03, y), p(-0.1, y + 0.3), 0.03, frame);
  bar(b, p(-0.1, y + 0.28), p(0.2, y + 0.27), 0.03, frame);
  bar(b, p(-0.03, y), p(0.2, y + 0.27), 0.034, frame);
  bar(b, p(0.2, y + 0.27), p(0.31, y), 0.026, frame);
  bar(b, p(-0.1, y + 0.3), p(-0.12, y + 0.36), 0.02, 0x9a9ea2);
  flat(b, 0.14, 0.035, 0.07, INK, [-0.13, y + 0.38, 0]);
  bar(b, p(0.2, y + 0.27), p(0.18, y + 0.37), 0.022, 0x9a9ea2);
  flat(b, 0.03, 0.03, 0.34, INK, [0.17, y + 0.38, 0]);
  if (v === 1) {
    // A child seat over the back wheel: a bucket with a high back.
    b.box(0.2, 0.12, 0.2, 0x6a8aa8, { at: [-0.3, y + 0.3, 0] }, 0.03);
    b.box(0.05, 0.2, 0.2, 0x6a8aa8, { at: [-0.4, y + 0.4, 0] }, 0.02);
    bar(b, p(-0.31, y), p(-0.3, y + 0.24), 0.02, 0x9a9ea2);
  } else if (v === 2) {
    b.box(0.2, 0.13, 0.22, 0x8a6a48, { at: [0.36, y + 0.3, 0] }, 0.02);
  } else if (v === 3) {
    b.torus(0.05, 0.014, INK, { at: [0.2, y + 0.33, 0] }, Math.PI);
  } else if (v === 4) {
    b.box(0.22, 0.2, 0.08, 0x3a4a3a, { at: [-0.3, y + 0.1, 0.1] }, 0.02);
  }
});

/**
 * A floor-standing bike rack along z, `n` slots 0.42 apart from z = 0: a
 * galvanised rail on two feet, a wheel loop at each slot.
 */
export function bikeStand(n: number): SetPiece {
  return once(`bikestand:${n}`, () =>
    looks([0.3, n * 0.42], 1, (b) => {
      const len = (n - 1) * 0.42 + 0.3;
      flat(b, 0.05, 0.04, len, GALV, [0, 0.02, len / 2 - 0.15]);
      for (let k = 0; k < n; k++)
        b.torus(0.12, 0.014, GALV, { at: [0, 0.12, k * 0.42], rot: [0, Math.PI / 2, 0] }, Math.PI);
    }),
  );
}

/**
 * The storage cage: chicken-wire mesh on galvanised posts, `w` wide along x
 * from x = 0 and `d` deep along +z from z = 0 (its back is the wall), 2.0
 * high; the door in the front panel stands open at `door` along it.
 */
export function storageCage(w: number, d: number, door: number): SetPiece {
  return once(`cage:${w.toFixed(2)}:${d.toFixed(2)}:${door.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      const h = 2.0;
      const wire = 0xb4b8bc;
      const post = 0x7a8086;
      /** A mesh panel from (x0, z0) to (x1, z1): a frame, wires every 0.1 both ways. */
      const panel = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const yaw = -Math.atan2(z1 - z0, x1 - x0);
        const at = (u: number, y: number): [number, number, number] => [
          x0 + ((x1 - x0) * u) / len,
          y,
          z0 + ((z1 - z0) * u) / len,
        ];
        flat(b, len, 0.04, 0.03, post, at(len / 2, h - 0.02), [0, yaw, 0]);
        flat(b, len, 0.04, 0.03, post, at(len / 2, 0.06), [0, yaw, 0]);
        flat(b, len, 0.03, 0.025, post, at(len / 2, 1.0), [0, yaw, 0]);
        for (let u = 0.1; u < len - 0.04; u += 0.1)
          flat(b, 0.007, h - 0.08, 0.007, wire, at(u, h / 2), [0, yaw, 0]);
        for (let y = 0.15; y < h - 0.06; y += 0.1)
          flat(b, len, 0.007, 0.007, wire, at(len / 2, y), [0, yaw, 0]);
      };
      const dw = 0.8;
      const d0 = Math.max(0.2, Math.min(w - dw - 0.2, door - dw / 2));
      panel(0, 0, 0, d);
      panel(w, 0, w, d);
      panel(0, d, d0, d);
      panel(d0 + dw, d, w, d);
      // The door, swung open.
      panel(d0 + dw, d, d0 + dw + Math.cos(1.1) * dw, d + Math.sin(1.1) * dw);
      for (const [x, z] of [
        [0, 0],
        [w, 0],
        [0, d],
        [w, d],
        [d0, d],
        [d0 + dw, d],
      ] as const)
        flat(b, 0.05, h, 0.05, post, [x, h / 2, z]);
      // A padlock hanging open on the hasp.
      b.torus(0.03, 0.008, 0x9a9ea2, { at: [d0 + 0.03, 1.05, d + 0.03] }, Math.PI);
      flat(b, 0.06, 0.06, 0.03, 0xc8a040, [d0 + 0.03, 1.0, d + 0.03]);
    }),
  );
}

/** The LAUNCHPAD roll-up banner from Demo Day, in its cassette, leaning: white, LAUNCHPAD in violet. */
export const launchpadBanner = looks([0.85, 0.3], 1, (b) => {
  b.box(0.86, 0.08, 0.2, 0xa9afb7, { at: [0, 0.04, 0] }, 0.02);
  b.cylinder(0.012, 0.012, 1.7, 0x3a3e44, { at: [0, 0.85, -0.05] }, 6);
  flat(b, 0.8, 1.6, 0.01, 0xf4f2fa, [0, 0.9, -0.04]);
  flat(b, 0.8, 0.36, 0.012, 0x2a1e48, [0, 1.48, -0.035]);
  letters(b, 'LAUNCHPAD', 0, 1.48, -0.027, 0.022, 0xf4f2fa);
  b.cylinder(0.2, 0.2, 0.012, VIOLET, { at: [0, 0.95, -0.032], rot: [Math.PI / 2, 0, 0] }, 6);
  flat(b, 0.56, 0.05, 0.012, VIOLET, [0, 0.52, -0.035]);
  letters(b, 'DEMO DAY', 0, 0.36, -0.03, 0.018, 0x2a1e48);
});

/**
 * The "WE RAISED!" foil balloon, three weeks on: sagged to the floor, half
 * crumpled, its ribbon trailing; violet, with the gold letters' ghost.
 */
export const deflatedBalloon = looks([0.5, 0.5], 1, (b) => {
  b.sphere(0.2, FOIL, { at: [0, 0.09, 0] }, [1.2, 0.45, 1]);
  b.sphere(0.12, tint(FOIL, -0.15), { at: [0.12, 0.06, 0.08] }, [1.2, 0.5, 1]);
  b.sphere(0.1, tint(FOIL, 0.12), { at: [-0.1, 0.13, -0.04] }, [1.3, 0.4, 1]);
  flat(b, 0.16, 0.012, 0.03, 0xd8b860, [0, 0.18, 0.02], [0, 0.2, 0]);
  flat(b, 0.1, 0.012, 0.025, 0xd8b860, [-0.02, 0.17, -0.05], [0, 0.2, 0]);
  // The ribbon, slack, in loose loops across the floor.
  const ribbon = new THREE.CatmullRomCurve3(
    (
      [
        [0.2, 0.06, 0.04],
        [0.3, 0.012, 0.16],
        [0.42, 0.01, 0.12],
        [0.46, 0.01, -0.02],
        [0.38, 0.01, -0.12],
        [0.5, 0.01, -0.2],
      ] as const
    ).map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  b.add(new THREE.TubeGeometry(ribbon, 20, 0.006, 4, false), 0xe8e4dc, {});
});

/**
 * A square concrete column with hazard tape round its foot (it's been hit
 * by a bike or two), cut off at `h` where the cutaway ends, a dark cap on
 * its cut top.
 */
export function column(h: number): SetPiece {
  return once(`column:${h.toFixed(2)}`, () =>
    looks([0.42, 0.42], 1, (b) => {
      flat(b, 0.4, h, 0.4, tint(COLUMN, -0.02), [0, h / 2, 0]);
      flat(b, 0.42, 0.04, 0.42, 0x3a3c40, [0, h - 0.02, 0]);
      for (let k = 0; k < 5; k++) {
        const y = 0.06 + k * 0.1;
        flat(b, 0.41, 0.05, 0.41, k % 2 ? HAZARD_BLACK : YELLOW, [0, y, 0]);
      }
      flat(b, 0.41, 0.012, 0.41, tint(COLUMN, -0.2), [0, 0.55, 0]);
    }),
  );
}

/** A grey breaker panel, its door ajar, a yellow danger flash on it, conduits up out of it. */
export const breakerPanel = looks([0.5, 0.1], 1, (b) => {
  flat(b, 0.42, 0.56, 0.1, 0x8a9096, [0, 0, 0.05]);
  flat(b, 0.36, 0.48, 0.01, 0x2a2c30, [0, 0, 0.102]);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 6; c++)
      flat(b, 0.035, 0.07, 0.02, 0xd8d8d4, [-0.13 + c * 0.052, 0.16 - r * 0.1, 0.11]);
  flat(b, 0.38, 0.5, 0.02, 0x9aa0a6, [0.33, 0, 0.18], [0, -1.0, 0]);
  b.cone(0.05, 0.08, YELLOW, { at: [0.33, 0.12, 0.2], rot: [0, -1.0, 0] }, 3);
  for (const x of [-0.12, 0, 0.12])
    b.cylinder(0.018, 0.018, 0.5, CONDUIT, { at: [x, 0.53, 0.05] }, 6);
});

/** A red fire extinguisher on its wall bracket, the red sign over it. */
export const extinguisher = looks([0.2, 0.2], 1, (b) => {
  b.capsule(0.07, 0.3, 0xc0302a, { at: [0, 0.25, 0.1] });
  flat(b, 0.08, 0.06, 0.06, INK, [0, 0.47, 0.1]);
  bar(b, [0.03, 0.48, 0.1], [0.12, 0.25, 0.16], 0.016, INK);
  flat(b, 0.12, 0.03, 0.08, STEEL, [0, 0.4, 0.03]);
  flat(b, 0.2, 0.2, 0.01, 0xc0302a, [0, 0.66, 0.01]);
  flat(b, 0.06, 0.12, 0.004, 0xf4f0ea, [0, 0.66, 0.017]);
});

/** A clip-on grow lamp (glow: `hot`): Prod's oxygen ration, a little pink-violet light. */
export const growLamp = looks([0.2, 0.2], 1, (b) => {
  bar(b, [0, 0, 0], [0.08, 0.45, 0.06], 0.012, 0x2a2c30);
  b.cylinder(0.05, 0.07, 0.05, 0x2a2c30, { at: [0.1, 0.48, 0.08], rot: [0.4, 0, -0.3] }, 10);
  glowBox(b, 0.1, 0.012, 0.1, 0xe08aff, [0.1, 0.455, 0.08], [0.4, 0, -0.3]);
});

// ---- The front: Moppy's dock, the WET FLOOR sign, the fibre duct ----

/**
 * Moppy's charging dock, empty (Moppy's out on its route): a low grey base
 * with a ramp and two contacts, the upright with MOPPY on it. The green
 * light is `dockLight`. 0.32 high.
 */
export const mopDock = looks([0.7, 0.6], 1, (b) => {
  // The clean round patch where Moppy sits all day, the rest of the floor a shade dustier.
  b.cylinder(0.3, 0.3, 0.004, 0xa4a8aa, { at: [0, 0.002, 0.12] }, 24);
  b.box(0.66, 0.04, 0.3, 0x4a4e54, { at: [0, 0.02, -0.1] }, 0.015);
  for (const x of [-0.12, 0.12]) flat(b, 0.07, 0.014, 0.05, 0xd8b850, [x, 0.046, -0.04]);
  b.box(0.62, 0.32, 0.14, 0xdadcde, { at: [0, 0.18, -0.2] }, 0.04);
  flat(b, 0.56, 0.1, 0.006, 0x2a7a9a, [0, 0.25, -0.128]);
  letters(b, 'MOPPY', 0, 0.25, -0.123, 0.014, 0xf4f8fa);
  flat(b, 0.08, 0.05, 0.01, 0x1a1c20, [0.2, 0.12, -0.128]);
  // The power lead to the wall.
  bar(b, [-0.24, 0.05, -0.27], [-0.42, 0.01, -0.3], 0.016, INK);
});

/** The dock's charging light (`blink` alive, `hot`): a tiny green LED. */
export const dockLight = looks([0.05, 0.05], 1, (b) => {
  flat(b, 0.05, 0.035, 0.01, 0x1a1c20, [0, 0, -0.012]);
  b.led(0.018, GREEN, { at: [0, 0, 0] });
});

/** A yellow WET FLOOR A-frame sign, folded and lying flat on the floor. */
export const wetFloorSign = looks([0.4, 0.6], 1, (b) => {
  flat(b, 0.32, 0.03, 0.62, 0xe8c020, [0, 0.015, 0], [0, 0, 0]);
  flat(b, 0.3, 0.012, 0.6, 0xd8b018, [0.01, 0.036, 0.0]);
  flat(b, 0.2, 0.004, 0.2, 0x1c1c1c, [0, 0.044, -0.12], [0, Math.PI / 4, 0]);
  flat(b, 0.12, 0.004, 0.12, 0xe8c020, [0, 0.046, -0.12], [0, Math.PI / 4, 0]);
  flat(b, 0.16, 0.004, 0.03, 0x1c1c1c, [0, 0.044, 0.08]);
  flat(b, 0.16, 0.004, 0.03, 0x1c1c1c, [0, 0.044, 0.14]);
});

/**
 * The yellow fibre duct: flat plastic trunking `len` long along +x from
 * x = 0, joints every 1.0, the odd tie-down; under 0.07 high.
 */
export function fibreDuct(len: number): SetPiece {
  return once(`fibre:${len.toFixed(2)}`, () =>
    looks([len, 0.16], 1, (b) => {
      flat(b, len, 0.055, 0.13, 0xe8b818, [len / 2, 0.028, 0]);
      flat(b, len, 0.008, 0.06, 0xf4d050, [len / 2, 0.058, 0]);
      for (let x = 0.5; x < len; x += 1.0) flat(b, 0.04, 0.062, 0.14, 0xc89810, [x, 0.031, 0]);
      for (let x = 0.9; x < len; x += 2.0) flat(b, 0.12, 0.012, 0.2, 0x3a3c40, [x, 0.064, 0]);
    }),
  );
}

/** A square cast-iron floor drain with a grating. */
export const floorDrain = looks([0.3, 0.3], 1, (b) => {
  flat(b, 0.28, 0.012, 0.28, 0x3a3a3a, [0, 0.006, 0]);
  flat(b, 0.24, 0.006, 0.24, 0x1a1a1a, [0, 0.013, 0]);
  for (let k = 0; k < 5; k++) flat(b, 0.024, 0.01, 0.22, 0x4a4a48, [-0.09 + k * 0.045, 0.016, 0]);
});

// ---- The draft's top void: spare racks ----

/** A spare server rack (one of three looks), 1.7 high: the overflow from the server room. */
export const spareRack = looks([0.6, 0.6], 3, (b, v) => {
  rack(b, 0, 1.5 + (v % 2) * 0.2, v);
});

/**
 * A cable reel on its side, half paid out: a wooden drum with black cable.
 */
export const cableReel = looks([0.6, 0.4], 2, (b, v) => {
  const wood = v ? 0xa07a50 : 0x8a6a48;
  for (const z of [-0.14, 0.14])
    b.cylinder(0.26, 0.26, 0.03, wood, { at: [0, 0.26, z], rot: [Math.PI / 2, 0, 0] }, 16);
  b.cylinder(
    0.18,
    0.18,
    0.26,
    v ? 0x2a6aa8 : 0x1e2024,
    { at: [0, 0.26, 0], rot: [Math.PI / 2, 0, 0] },
    14,
  );
  b.cylinder(0.05, 0.05, 0.32, wood, { at: [0, 0.26, 0], rot: [Math.PI / 2, 0, 0] }, 8);
});

/** A spare rack's activity LEDs (`blink` alive, `hot`): sits on `spareRack`'s face. */
export const rackBlink = looks([0.3, 0.05], 1, (b) => {
  flat(b, 0.05, 0.95, 0.006, 0x16181c, [0.12, 0.92, 0.305]);
  for (let r = 0; r < 4; r++)
    b.led(0.016, r % 2 ? 0xffb43a : GREEN, { at: [0.12, 0.5 + r * 0.28, 0.315] });
});

/** Segfault's grey-tabby fur, its stripes, its pale chest and muzzle, the pink of its nose and ears. */
const FUR = 0x8a8580;
const STRIPE = 0x4a4644;
const CHEST = 0xd8d2c8;
const PINK = 0xc88a8a;

/**
 * Segfault asleep on the warmest server (`purr` alive): a grey tabby curled
 * in a loaf facing the camera, head lifted on its paws, tall ears, eyes
 * shut, stripes over its back and an M on its brow, its striped tail
 * hanging down over the server's edge. Look 0 lies with its head to −x and
 * its tail over the +x edge; look 1 is its mirror. The same cat the Room's
 * server was built round, as its own piece so it can breathe. Its origin
 * is the towel on the server's lid (the lid's edge 0.36 out, 0.03 lower).
 */
export const segfaultCat = looks([0.45, 0.4], 2, (b, v) => {
  const s = 1.3;
  const m = v ? -1 : 1;
  const P = (x: number, y: number, z: number): [number, number, number] => [
    m * x * s,
    y * s,
    z * s,
  ];
  const sp = (r: number, c: number, at: [number, number, number], k: [number, number, number]) =>
    b.sphere(r * s, c, { at: P(...at) }, k);
  // The loaf, its chest, the front paws tucked under the chin.
  sp(0.13, FUR, [0.02, 0.07, -0.02], [1.3, 0.62, 1.0]);
  sp(0.075, CHEST, [-0.07, 0.06, 0.07], [1.1, 0.75, 0.8]);
  for (const dx of [-0.13, -0.05]) sp(0.032, CHEST, [dx, 0.025, 0.14], [1, 0.7, 1.4]);
  // Tabby stripes across the back, the darker spine line.
  for (const x of [-0.06, 0.01, 0.08, 0.14])
    flat(b, 0.026 * s, 0.012 * s, 0.2 * s, STRIPE, P(x, 0.143 - Math.abs(x - 0.02) * 0.25, -0.02), [
      0,
      0,
      m * (x - 0.02) * 1.5,
    ]);
  flat(b, 0.24 * s, 0.012 * s, 0.03 * s, STRIPE, P(0.04, 0.148, -0.03));
  // The head, lifted clear of the body; muzzle, nose, shut eyes, the brow's M.
  const hx = -0.1;
  const hy = 0.15;
  const hz = 0.09;
  sp(0.088, FUR, [hx, hy, hz], [1.08, 0.92, 0.95]);
  sp(0.045, CHEST, [hx, hy - 0.035, hz + 0.065], [1.25, 0.75, 0.8]);
  flat(b, 0.022 * s, 0.014 * s, 0.01, PINK, P(hx, hy - 0.015, hz + 0.1));
  for (const dx of [-0.035, 0.035])
    flat(b, 0.034 * s, 0.008 * s, 0.006, 0x1c1a1a, P(hx + dx, hy + 0.01, hz + 0.082), [
      0,
      0,
      m * dx * 4,
    ]);
  for (const dx of [-0.03, 0, 0.03])
    flat(b, 0.01 * s, 0.04 * s, 0.006, STRIPE, P(hx + dx, hy + 0.055, hz + 0.06), [-0.5, 0, 0]);
  // Tall ears with pink insides.
  for (const dx of [-0.05, 0.05]) {
    const rot: [number, number, number] = [-0.15, 0, m * -dx * 5];
    b.cone(0.034 * s, 0.09 * s, FUR, { at: P(hx + dx, hy + 0.1, hz - 0.01), rot }, 4);
    b.cone(0.02 * s, 0.06 * s, PINK, { at: P(hx + dx, hy + 0.095, hz + 0.004), rot }, 4);
  }
  // The tail: from its rump along the lid, over the edge, hanging down, the tip curling.
  const curve = new THREE.CatmullRomCurve3(
    (
      [
        [0.15, 0.05, -0.06],
        [0.24, 0.02, -0.03],
        [0.29, -0.03, 0.0],
        [0.305, -0.11, 0.02],
        [0.3, -0.18, 0.04],
        [0.27, -0.21, 0.06],
      ] as const
    ).map(([x, y, z]) => new THREE.Vector3(...P(x, y, z))),
  );
  b.add(new THREE.TubeGeometry(curve, 16, 0.026 * s, 6, false), FUR, {});
  for (const u of [0.35, 0.55, 0.75, 0.93]) {
    const p = curve.getPoint(u);
    const t = curve.getTangent(u);
    const g = new THREE.TorusGeometry(0.027 * s, 0.008 * s, 4, 10);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), t));
    b.add(g, STRIPE, { at: [p.x, p.y, p.z] });
  }
  const tip = curve.getPoint(1);
  b.sphere(0.028 * s, STRIPE, { at: [tip.x, tip.y, tip.z] });
});
