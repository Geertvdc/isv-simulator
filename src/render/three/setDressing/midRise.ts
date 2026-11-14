import * as THREE from 'three';
import { type ModelBuilder, tint } from '../kit';
import { tileHash } from '../../mapShape';
import { looks, nth, plantPot, type SetPiece } from './shared';

/**
 * The world round the Middle Management level (`scenes/middleManagement.ts`):
 * the rest of YOTTA's rented floor in a mid-rise office building on a spring
 * morning. The building's curtain wall (floor-to-ceiling glass in aluminium
 * mullions, a spandrel band), the floor's reception (a light-oak desk with
 * a monitor, a bell and a sign-in tablet, a low sofa with a visitor waiting
 * on it, Prod in a glazed pot), the lift bank, the release board by the
 * lifts, Derek's glass corner office (his executive chair, the MONOLITH
 * certificate and lanyard, a putting mat), a breakout corner, a printer with
 * a jam, and far below past the glass, the street in spring: cherry trees in
 * blossom, pavement, a bus stop, tiny cars and a bus; across it the crane
 * tower half-clad in glass, and MONOLITH's tower further off. Built like the
 * rest of the set dressing, standing on the ground at the origin and
 * fronting +z. Nothing here is food or drink.
 */

/** Brushed aluminium (mullions, frames, legs) and its darker shade (tracks, sills). */
const ALU = 0xb6bcc2;
const ALU_DARK = 0x8a9096;
/** Curtain-wall glass, and the paler reflection stripe across it. */
const GLASS = 0xa8bfcc;
const SHEEN = 0xeaf4fa;
/** The spandrel band between floors: dark grey-blue panels. */
const SPANDREL = 0x56606c;
/** Light oak veneer, white laminate. */
const OAK = 0xc4a47c;
const OAK_DARK = 0xa4845e;
const LAMINATE = 0xdedcd4;
/** Derek's desk and credenza: dark walnut, the executive look. */
const WALNUT = 0x5e4434;
/** Black leather. */
const LEATHER = 0x2c2a2a;
/** Plasterboard and pale stone, the lift core's cladding. */
const STONE = 0xcdc8be;
/** Brushed steel (the lift doors). */
const STEEL = 0xb4bcc4;
const STEEL_HI = 0xccd4da;
/** Screens: off (near black), on (cool), the release board's body. */
const SCREEN_OFF = 0x1c2026;
const SCREEN_ON = 0x9cc4e8;
/** YOTTA violet; the release board's green tick. */
const VIOLET = 0x8a64d8;
const TICK = 0x5cd88a;
/** The lift indicators' amber. */
const AMBER = 0xffb648;
/** A sticky note's yellow, the jam note's. */
const NOTE = 0xf0d860;
const INK = 0x2a2c30;
/** Muted upholstery: slate teal, warm grey, sage, dusty plum. Never a player's colour. */
const FABRIC = [0x5e7480, 0x8a8278, 0x7c8c74, 0x7a6a78] as const;
/** Cherry blossom, about 25% greyed, in three tones; spring leaves; bark. */
const BLOSSOM = [0xd8afbe, 0xcca0b2, 0xe2c0cc] as const;
const LEAF = 0x7e9468;
const BARK = 0x4a3c34;
/** The street: asphalt, pavement, kerb, lane paint. */
const ASPHALT = 0x52565c;
const PAVEMENT = 0x8c8a83;
const KERB = 0xa09d96;
const LANE = 0xd6d2c6;
/** A park's spring grass, its gravel path. */
const GRASS = 0x657652;
const PATH = 0x948b7d;
/** MONOLITH: black glass, faint. */
const MONOLITH_GLASS = 0x3a4250;

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
export function hash01(a: number, b: number, salt: number): number {
  let h = tileHash(Math.round(a * 37) + salt * 7919, Math.round(b * 41) - salt * 31);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}

type V3 = [number, number, number];

/** A flat box (no bevel). */
function flat(b: ModelBuilder, w: number, h: number, d: number, color: number, at: V3, rot?: V3) {
  b.box(w, h, d, color, rot ? { at, rot } : { at }, 0);
}

/** A plain box in the glow layer: screens' text, LEDs strips. */
function glowBox(
  b: ModelBuilder,
  w: number,
  h: number,
  d: number,
  color: number,
  at: V3,
  rot?: V3,
) {
  b.add(new THREE.BoxGeometry(w, h, d), color, rot ? { at, rot } : { at }, 'glow');
}

/** A bar from `a` to `c`, `t` thick: a rope, a rail, a strap. */
function bar(b: ModelBuilder, a: V3, c: V3, t: number, color: number): void {
  const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = d.length();
  const g = new THREE.BoxGeometry(t, len, t);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
  );
  b.add(g, color, { at: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2] });
}

// ---- Lettering ----

/** A blocky alphabet, 3 wide and 5 high: what the signs here use. */
const FONT: Readonly<Record<string, string>> = {
  A: '010101111101101',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
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
  V: '101101101101010',
  Y: '101101010010010',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '110001010001110',
  '4': '101101111001001',
  '7': '111001010010010',
  '?': '110001010000010',
  '.': '000000000000010',
  '·': '000000010000000',
  ' ': '000000000000000',
};

/** Whether every glyph of `text` is in the alphabet. */
export function spellable(text: string): boolean {
  return Array.from(text).every((ch) => ch in FONT);
}

/** How wide `text` runs in pixels: 3 a glyph and 1 between. */
export function textWidth(text: string): number {
  return Array.from(text).length * 4 - 1;
}

/**
 * Letters for `text` centred on (x, y) on a face at depth z facing +z, each
 * pixel `px` square; a row's run of pixels is one box. The face leans back
 * by `tilt` about its middle line. In the glow layer when `lit`.
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
  tilt = 0,
): void {
  const cols = textWidth(text);
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
        const dy = (2 - r) * px;
        const at: V3 = [
          left + ((e - c) * px) / 2,
          y + dy * Math.cos(tilt),
          z - dy * Math.sin(tilt),
        ];
        const rot: V3 = [-tilt, 0, 0];
        if (lit) glowBox(b, (e - c) * px, px, 0.006, color, at, rot);
        else flat(b, (e - c) * px, px, 0.006, color, at, rot);
        c = e;
      }
    }
  });
}

/** Letters lying flat on the floor at height y, read from the camera (their tops toward −z). */
export function floorLetters(
  b: ModelBuilder,
  text: string,
  x: number,
  z: number,
  y: number,
  px: number,
  color: number,
): void {
  const cols = textWidth(text);
  Array.from(text).forEach((ch, k) => {
    const glyph = FONT[ch] ?? '';
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        if (glyph[r * 3 + c] === '1')
          flat(b, px, 0.003, px, color, [
            x + (k * 4 + c - cols / 2 + 0.5) * px,
            y,
            z + (r - 2) * px,
          ]);
  });
}

// ---- The curtain wall ----

/** The curtain wall: its mullion spacing, the transom (ceiling) height, the spandrel band's depth. */
export const CURTAIN = { bay: 0.8, floor: 2.3, band: 0.42 } as const;

/**
 * The building's curtain wall, `len` long along +x from x = 0, its glass at
 * z = 0, the inside of the building toward +z: an aluminium sill, floor-to-
 * ceiling panes between slim mullions, a transom, the spandrel band, and
 * `floors` − 1 floors more of glass above (the floors over ours). A pale
 * reflection stripe crosses every other pane.
 */
export function curtainWall(len: number, floors = 1): SetPiece {
  return once(`curtain:${len.toFixed(2)}:${floors}`, () =>
    looks([len, 0.12], 1, (b) => {
      const n = Math.max(1, Math.round(len / CURTAIN.bay));
      const bay = len / n;
      const storey = CURTAIN.floor + CURTAIN.band;
      const top = floors * storey;
      flat(b, len, 0.08, 0.14, ALU_DARK, [len / 2, 0.04, 0.02]);
      for (let f = 0; f < floors; f++) {
        const y0 = f * storey + (f === 0 ? 0.08 : 0);
        const y1 = f * storey + CURTAIN.floor;
        for (let i = 0; i < n; i++) {
          const cx = (i + 0.5) * bay;
          b.pane(bay - 0.04, y1 - y0, 0.02, GLASS, { at: [cx, (y0 + y1) / 2, 0] });
          if ((i + f) % 2 === 0) {
            // A reflection: a pale diagonal band across the pane.
            const h = (y1 - y0) * 0.55;
            b.pane(0.1, h, 0.022, SHEEN, {
              at: [cx - bay * 0.1, y0 + (y1 - y0) * 0.55, 0.004],
              rot: [0, 0, -0.45],
            });
          }
        }
        // The transom at the ceiling, the spandrel band over it.
        flat(b, len, 0.05, 0.08, ALU, [len / 2, y1, 0.01]);
        flat(b, len, CURTAIN.band - 0.04, 0.06, SPANDREL, [len / 2, y1 + CURTAIN.band / 2, -0.01]);
        flat(b, len, 0.03, 0.08, ALU, [len / 2, y1 + CURTAIN.band - 0.015, 0.01]);
      }
      for (let i = 0; i <= n; i++)
        flat(b, 0.045, top, 0.09, i === 0 || i === n ? ALU_DARK : ALU, [i * bay, top / 2, 0.015]);
    }),
  );
}

// ---- Derek's corner office ----

/**
 * Derek's glass corner office: `w` along +x from x = 0, `d` back from its
 * front at z = 0 toward −z. Glass walls floor to ceiling on all four sides
 * in slim aluminium frames with a head track, a glass door in the front at
 * `door` along it, and a "STATUS UPDATE?" sticky note on the front glass
 * beside the door, facing the floor.
 */
export function glassOffice(w: number, d: number, door: number): SetPiece {
  return once(`office:${w.toFixed(2)}:${d.toFixed(2)}:${door.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      const H = CURTAIN.floor;
      /** One wall from (x0, z0) to (x1, z1), glass between posts about every 1.0. */
      const wall = (x0: number, z0: number, x1: number, z1: number, gap?: [number, number]) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const ux = (x1 - x0) / len;
        const uz = (z1 - z0) / len;
        const yaw = Math.atan2(-uz, ux);
        const at = (u: number, y: number): V3 => [x0 + ux * u, y, z0 + uz * u];
        const n = Math.max(1, Math.round(len / 1.0));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * len;
          const c = ((i + 1) / n) * len;
          if (gap && c > gap[0] && a < gap[1]) {
            // The door: a framed glass leaf, a long steel pull.
            const m = (gap[0] + gap[1]) / 2;
            b.pane(gap[1] - gap[0] - 0.06, H - 0.1, 0.02, GLASS, {
              at: at(m, H / 2),
              rot: [0, yaw, 0],
            });
            flat(b, 0.03, 0.5, 0.05, STEEL_HI, at(gap[1] - 0.12, 1.0), [0, yaw, 0]);
            for (const u of [gap[0], gap[1]])
              flat(b, 0.05, H, 0.07, ALU_DARK, at(u, H / 2), [0, yaw, 0]);
            if (a < gap[0] - 0.05)
              b.pane(gap[0] - a - 0.04, H - 0.06, 0.02, GLASS, {
                at: at((a + gap[0]) / 2, H / 2),
                rot: [0, yaw, 0],
              });
            if (c > gap[1] + 0.05)
              b.pane(c - gap[1] - 0.04, H - 0.06, 0.02, GLASS, {
                at: at((gap[1] + c) / 2, H / 2),
                rot: [0, yaw, 0],
              });
          } else
            b.pane(c - a - 0.04, H - 0.06, 0.02, GLASS, {
              at: at((a + c) / 2, H / 2),
              rot: [0, yaw, 0],
            });
          if (i > 0) flat(b, 0.04, H, 0.06, ALU, at(a, H / 2), [0, yaw, 0]);
          // A frosted manifestation band at eye height, so the glass reads as glass.
          if (!(gap && c > gap[0] && a < gap[1]))
            b.pane(c - a - 0.08, 0.06, 0.024, 0xf2f4f6, {
              at: at((a + c) / 2, 1.05),
              rot: [0, yaw, 0],
            });
        }
        // Head track and base track.
        flat(b, len + 0.04, 0.06, 0.09, ALU, at(len / 2, H), [0, yaw, 0]);
        flat(b, len + 0.04, 0.05, 0.08, ALU_DARK, at(len / 2, 0.025), [0, yaw, 0]);
      };
      wall(0, 0, w, 0, [door - 0.42, door + 0.42]);
      wall(w, 0, w, -d);
      wall(w, -d, 0, -d);
      wall(0, -d, 0, 0);
      // Corner posts.
      for (const [x, z] of [
        [0, 0],
        [w, 0],
        [w, -d],
        [0, -d],
      ] as const)
        flat(b, 0.07, H + 0.04, 0.07, ALU_DARK, [x, (H + 0.04) / 2, z]);
      // The sticky note on the front glass, outside, right of the door.
      const nx = door + 0.95;
      flat(b, 0.84, 0.44, 0.012, NOTE, [nx, 1.28, 0.03], [0, 0, 0.04]);
      letters(b, 'STATUS', nx, 1.36, 0.04, 0.026, INK);
      letters(b, 'UPDATE?', nx, 1.2, 0.04, 0.026, INK);
    }),
  );
}

/** Derek's desk: a big dark-walnut top on a panel base, a closed laptop, a desk phone, his nameplate. */
export const execDesk = looks([2.0, 0.9], 1, (b) => {
  const top = 0.74;
  flat(b, 2.0, 0.05, 0.9, WALNUT, [0, top, 0]);
  flat(b, 2.04, 0.02, 0.94, tint(WALNUT, -0.25), [0, top - 0.035, 0]);
  for (const s of [-1, 1])
    flat(b, 0.06, top - 0.04, 0.8, tint(WALNUT, -0.12), [s * 0.95, (top - 0.04) / 2, 0]);
  flat(b, 1.84, 0.4, 0.04, tint(WALNUT, -0.1), [0, top - 0.25, -0.2]);
  // The closed laptop, the phone, the nameplate facing the door.
  b.box(0.42, 0.025, 0.3, 0x8a9096, { at: [-0.35, top + 0.04, 0.0] }, 0.01);
  b.box(0.22, 0.05, 0.18, INK, { at: [0.55, top + 0.05, -0.15] }, 0.015);
  flat(b, 0.06, 0.02, 0.16, INK, [0.5, top + 0.085, -0.15]);
  flat(b, 0.42, 0.1, 0.05, 0xc8a050, [0.2, top + 0.075, 0.38], [-0.3, 0, 0]);
  letters(b, 'DEREK', 0.2, top + 0.08, 0.41, 0.016, INK, false, 0.3);
  // A pen pot and a stack of papers nobody reads.
  b.cylinder(0.04, 0.04, 0.1, 0x3a3d42, { at: [0.75, top + 0.075, 0.15] }, 10);
  flat(b, 0.24, 0.04, 0.3, 0xece8de, [-0.75, top + 0.045, 0.15], [0, 0.15, 0]);
});

/**
 * A high-backed black leather executive chair on a five-star base, its seat
 * 0.48 up (`EXEC_SEAT`), facing +z. Segfault sleeps on it (a separate piece).
 */
export const EXEC_SEAT = 0.5;
export const execChair = looks([0.7, 0.7], 1, (b) => {
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    flat(b, 0.05, 0.04, 0.32, 0x3a3d42, [Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15], [0, a, 0]);
    b.sphere(0.03, 0x24262a, { at: [Math.sin(a) * 0.3, 0.03, Math.cos(a) * 0.3] });
  }
  b.cylinder(0.03, 0.03, 0.32, ALU_DARK, { at: [0, 0.24, 0] }, 10);
  b.box(0.62, 0.1, 0.56, LEATHER, { at: [0, EXEC_SEAT - 0.05, 0] }, 0.045);
  // The tall back, tufted: two rows of buttons.
  b.box(0.6, 0.78, 0.12, LEATHER, { at: [0, EXEC_SEAT + 0.38, -0.28], rot: [-0.12, 0, 0] }, 0.05);
  for (const y of [0.3, 0.55])
    for (const x of [-0.15, 0, 0.15])
      b.sphere(0.014, 0x1a1818, { at: [x, EXEC_SEAT + y, -0.21 - y * 0.12] });
  b.box(0.5, 0.16, 0.1, LEATHER, { at: [0, EXEC_SEAT + 0.82, -0.32] }, 0.05);
  // Padded arms.
  for (const s of [-1, 1]) {
    b.box(0.08, 0.06, 0.4, LEATHER, { at: [s * 0.33, EXEC_SEAT + 0.2, -0.02] }, 0.025);
    flat(b, 0.03, 0.18, 0.03, ALU_DARK, [s * 0.33, EXEC_SEAT + 0.08, 0.1]);
  }
});

/** A low walnut credenza with his framed certificate on it: "MONOLITH · 10 YEARS OF SERVICE". */
export const credenza = looks([1.5, 0.5], 1, (b) => {
  const h = 0.5;
  flat(b, 1.5, h, 0.45, WALNUT, [0, h / 2, 0]);
  for (const x of [-0.375, 0.375])
    flat(b, 0.72, h - 0.08, 0.01, tint(WALNUT, 0.08), [x, h / 2, 0.226]);
  // The frame: gold, a cream mount, MONOLITH's name big, the rest small, a seal.
  const fy = h + 0.36;
  b.box(1.16, 0.66, 0.04, 0xb89850, { at: [0, fy, -0.08], rot: [-0.18, 0, 0] }, 0.012);
  flat(b, 1.06, 0.56, 0.01, 0xf2ecdc, [0, fy, -0.055], [-0.18, 0, 0]);
  letters(b, 'MONOLITH', 0, fy + 0.13, -0.045, 0.032, 0x2a3a5a, false, 0.18);
  letters(b, '10 YEARS', 0, fy - 0.04, -0.045, 0.02, INK, false, 0.18);
  letters(b, 'OF SERVICE', 0, fy - 0.15, -0.045, 0.014, INK, false, 0.18);
  b.cylinder(
    0.045,
    0.045,
    0.01,
    0xc84a3a,
    { at: [0.38, fy - 0.17, -0.04], rot: [Math.PI / 2 - 0.18, 0, 0] },
    14,
  );
});

/**
 * A coat stand: a dark pole on a round base, four hooks at the top. Look 0
 * has a coat and a scarf; look 1 (Derek's) his old MONOLITH lanyard: a navy
 * strap hanging in a V from a hook, its white card with MONOLITH's dark band.
 */
export const coatStand = looks([0.4, 0.4], 2, (b, v) => {
  const H = 1.7;
  b.cylinder(0.17, 0.19, 0.04, 0x2e3034, { at: [0, 0.02, 0] }, 18);
  b.cylinder(0.022, 0.026, H, 0x2e3034, { at: [0, H / 2, 0] }, 8);
  b.sphere(0.04, 0x2e3034, { at: [0, H + 0.02, 0] });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    flat(
      b,
      0.02,
      0.02,
      0.16,
      0x2e3034,
      [Math.sin(a) * 0.07, H - 0.06, Math.cos(a) * 0.07],
      [0.6, a, 0],
    );
  }
  if (v === 0) {
    // A trench coat hanging off the front hook, a scarf over the side one.
    b.box(0.36, 0.86, 0.12, 0x9a8a6e, { at: [0.02, H - 0.52, 0.12] }, 0.05);
    b.box(0.2, 0.12, 0.14, tint(0x9a8a6e, -0.1), { at: [0.02, H - 0.1, 0.11] }, 0.04);
    flat(b, 0.07, 0.6, 0.02, 0x7a5a6a, [-0.12, H - 0.36, 0.06]);
  } else {
    // The lanyard, toward the camera.
    const hx = 0.02;
    const hz = 0.1;
    const cy = H - 0.5;
    bar(b, [hx - 0.02, H - 0.08, hz], [hx - 0.06, cy + 0.08, hz + 0.03], 0.018, 0x24345a);
    bar(b, [hx + 0.02, H - 0.08, hz], [hx + 0.06, cy + 0.08, hz + 0.03], 0.018, 0x24345a);
    flat(b, 0.15, 0.2, 0.012, 0xf4f4f0, [hx, cy, hz + 0.04]);
    flat(b, 0.15, 0.06, 0.014, 0x24345a, [hx, cy + 0.07, hz + 0.042]);
    flat(b, 0.07, 0.07, 0.014, 0x9aa4b4, [hx - 0.03, cy - 0.04, hz + 0.042]);
    // A golf umbrella hooked beside it.
    b.cylinder(0.05, 0.03, 0.75, 0x2a4a3a, { at: [-0.1, H - 0.7, -0.05], rot: [0, 0, 0.08] }, 8);
  }
});

/** A putting mat: a strip of green turf with a white edge, the cup with its little flag, a ball. */
export const puttingMat = looks([1.7, 0.42], 1, (b) => {
  flat(b, 1.7, 0.012, 0.42, 0xe8e8e0, [0, 0.006, 0]);
  flat(b, 1.64, 0.016, 0.36, 0x4e8a4a, [0, 0.01, 0]);
  for (let k = 0; k < 5; k++) flat(b, 0.3, 0.003, 0.36, 0x5a9654, [-0.6 + k * 0.3, 0.019, 0]);
  b.cylinder(0.05, 0.05, 0.004, 0x1a1a1a, { at: [0.66, 0.02, 0] }, 14);
  flat(b, 0.008, 0.26, 0.008, 0xe8e8e0, [0.66, 0.13, 0]);
  flat(b, 0.1, 0.06, 0.006, 0xd04a3a, [0.71, 0.23, 0]);
  b.sphere(0.03, 0xffffff, { at: [-0.45, 0.045, 0.05] });
  // The putter, lying where he left it.
  flat(b, 0.8, 0.018, 0.018, 0x3a3d42, [-0.2, 0.03, 0.3], [0, 0.25, 0]);
  flat(b, 0.06, 0.03, 0.12, ALU, [0.18, 0.03, 0.2], [0, 0.25, 0]);
});

/** A tall potted plant for the office or reception: a fiddle-leaf tree in a big pot, its looks from `plantPot`. */
export const bigPlant = looks([0.5, 0.5], 5, (b, v) => {
  plantPot(b, 0, 0, 1.55, v);
});

// ---- Reception ----

/**
 * The reception desk, `len` along x: a light-oak front with vertical
 * grooves (facing +z, the visitors' side) under a white laminate ledge with
 * the desk bell and the sign-in tablet on it, a lower oak worktop behind for
 * the receptionist with her monitor (facing −z, toward her), a phone base,
 * a keyboard. Its origin is the middle of its front foot.
 */
export function receptionDesk(len: number): SetPiece {
  return once(`reception:${len.toFixed(2)}`, () =>
    looks([len, 0.8], 1, (b) => {
      const H = 1.0;
      const D = 0.34;
      flat(b, len, H, D, OAK, [0, H / 2, -D / 2]);
      for (let x = -len / 2 + 0.1; x < len / 2 - 0.05; x += 0.12)
        flat(b, 0.012, H - 0.12, 0.006, OAK_DARK, [x, H / 2 + 0.02, 0.002]);
      flat(b, len, 0.06, 0.008, tint(OAK, -0.35), [0, 0.03, 0.004]);
      flat(b, len + 0.06, 0.04, D + 0.1, LAMINATE, [0, H + 0.02, -D / 2 + 0.03]);
      // The worktop behind, lower.
      const wt = 0.74;
      flat(b, len, 0.04, 0.5, OAK, [0, wt, -D - 0.25]);
      for (const s of [-1, 1])
        flat(b, 0.04, wt, 0.48, OAK_DARK, [s * (len / 2 - 0.03), wt / 2, -D - 0.25]);
      // The desk bell (a silver dome on a black base) and the sign-in tablet on its stand.
      const bx = -len / 2 + 0.35;
      b.cylinder(0.06, 0.06, 0.02, INK, { at: [bx, H + 0.05, -0.08] }, 14);
      b.sphere(0.05, 0xd8dce0, { at: [bx, H + 0.06, -0.08] }, [1, 0.8, 1]);
      b.sphere(0.012, 0xd8dce0, { at: [bx, H + 0.11, -0.08] });
      const tx = bx + 0.4;
      flat(b, 0.04, 0.12, 0.04, ALU_DARK, [tx, H + 0.1, -0.1]);
      b.box(0.3, 0.22, 0.02, INK, { at: [tx, H + 0.2, -0.07], rot: [-0.5, 0, 0] }, 0.008);
      b.screen(0.26, 0.18, 0xdfe8f4, { at: [tx, H + 0.2, -0.056], rot: [-0.5, 0, 0] });
      // Her monitor on an arm, facing her; a keyboard, the phone base.
      const mx = len / 2 - 0.55;
      flat(b, 0.06, 0.3, 0.06, ALU_DARK, [mx, wt + 0.17, -D - 0.12]);
      b.box(0.56, 0.34, 0.04, INK, { at: [mx, wt + 0.42, -D - 0.12] }, 0.01);
      b.screen(0.5, 0.28, SCREEN_ON, { at: [mx, wt + 0.42, -D - 0.143], rot: [0, Math.PI, 0] });
      flat(b, 0.36, 0.02, 0.12, 0x3a3d42, [mx, wt + 0.03, -D - 0.32]);
      b.box(0.18, 0.05, 0.16, INK, { at: [mx + 0.42, wt + 0.045, -D - 0.25] }, 0.015);
      // A tray of spare visitor badges, a small YOTTA-violet card stand.
      flat(b, 0.3, 0.03, 0.16, 0x3a3d42, [0.1, H + 0.055, -0.1]);
      for (let k = 0; k < 4; k++)
        flat(b, 0.06, 0.008, 0.08, 0xf4f4f0, [0.0 + k * 0.07, H + 0.075, -0.1]);
      flat(b, 0.14, 0.1, 0.02, VIOLET, [0.38, H + 0.09, -0.06], [-0.2, 0, 0]);
    }),
  );
}

/** Where the reception desk's receptionist stands, behind its worktop (from the desk's origin, toward −z). */
export const RECEPTION_BACK = 0.95;

/** A low lounge sofa, 1.4 wide: a slim frame on chrome legs, seat cushions, a low back; its fabric by look. */
export const SOFA_SEAT = 0.36;
export const lowSofa = looks([1.4, 0.7], FABRIC.length, (b, v) => {
  const c = nth(FABRIC, v);
  for (const x of [-0.62, 0.62])
    for (const z of [-0.26, 0.26]) flat(b, 0.03, 0.1, 0.03, ALU, [x, 0.05, z]);
  b.box(1.4, 0.16, 0.66, tint(c, -0.12), { at: [0, 0.18, 0] }, 0.04);
  for (const x of [-0.33, 0.33])
    b.box(0.64, 0.08, 0.56, c, { at: [x, SOFA_SEAT - 0.04, 0.04] }, 0.035);
  b.box(1.4, 0.32, 0.16, tint(c, -0.06), { at: [0, 0.42, -0.26] }, 0.05);
  for (const s of [-1, 1])
    b.box(0.12, 0.26, 0.66, tint(c, -0.08), { at: [s * 0.66, 0.36, 0] }, 0.04);
});

/** A low round coffee table in oak with two magazines and the visitors' book. */
export const coffeeTable = looks([0.7, 0.7], 1, (b) => {
  b.cylinder(0.34, 0.34, 0.04, OAK, { at: [0, 0.34, 0] }, 24);
  b.cylinder(0.03, 0.03, 0.32, ALU_DARK, { at: [0, 0.17, 0] }, 8);
  b.cylinder(0.18, 0.2, 0.02, ALU_DARK, { at: [0, 0.01, 0] }, 16);
  flat(b, 0.22, 0.01, 0.3, 0xd8d0c0, [-0.1, 0.365, 0.02], [0, 0.4, 0]);
  flat(b, 0.22, 0.01, 0.3, 0x8aa0b8, [0.06, 0.375, -0.04], [0, -0.2, 0]);
  flat(b, 0.2, 0.012, 0.14, VIOLET, [0.05, 0.384, -0.04], [0, -0.2, 0]);
});

/**
 * A visitor waiting on the sofa (`breathe` alive: shifting a little), sat
 * forward on its seat looking at a phone, a clip-on visitor badge on the
 * chest. Casual (a camel jacket, no suit, no lanyard: nobody to take for
 * Derek), greyed like the other background people, a little smaller than
 * the players. Its origin is the seat it sits on.
 */
export const waitingVisitor = looks([0.5, 0.6], 1, (b) => {
  const s = 0.82;
  const P = (x: number, y: number, z: number): V3 => [x * s, y * s, z * s];
  const coat = 0x8a7a64;
  const legs = 0x464c58;
  const skin = 0xb8957c;
  // Thighs forward along the seat, shins down to the floor, shoes.
  for (const x of [-0.1, 0.1]) {
    b.capsule(0.075 * s, 0.26 * s, legs, { at: P(x, 0.08, 0.16), rot: [Math.PI / 2, 0, 0] });
    b.capsule(0.07 * s, 0.24 * s, legs, { at: P(x, -0.12, 0.33) });
    b.box(0.12 * s, 0.08 * s, 0.2 * s, 0x2a2a2c, { at: P(x, -0.4, 0.38) }, 0.03);
  }
  // The body, leaning forward over the phone; the badge.
  b.capsule(0.17 * s, 0.24 * s, coat, { at: P(0, 0.33, -0.02), rot: [0.18, 0, 0] });
  flat(b, 0.09 * s, 0.11 * s, 0.01, 0xf4f4f0, P(0.08, 0.42, 0.155));
  flat(b, 0.09 * s, 0.03 * s, 0.012, VIOLET, P(0.08, 0.46, 0.157));
  // Arms bent to the phone in both hands in the lap.
  for (const x of [-0.17, 0.17]) {
    b.capsule(0.055 * s, 0.18 * s, coat, { at: P(x, 0.32, 0.06), rot: [0.5, 0, 0] });
    b.capsule(0.05 * s, 0.14 * s, coat, {
      at: P(x * 0.6, 0.22, 0.2),
      rot: [Math.PI / 2 - 0.3, 0, -x * 2],
    });
  }
  b.box(0.08 * s, 0.015 * s, 0.14 * s, INK, { at: P(0, 0.24, 0.28), rot: [-0.6, 0, 0] }, 0.005);
  // The head, bent to the phone, hair.
  b.sphere(0.16 * s, skin, { at: P(0, 0.72, 0.06) });
  b.sphere(0.165 * s, 0x4a3628, { at: P(0, 0.77, 0.02) }, [1, 0.8, 1]);
});

/**
 * Prod, in reception now: the same little tree in a fancier pot, a glazed
 * ceramic one in sage with a cream rim, on a low oak plinth.
 */
export const prodPot = looks([0.8, 0.8], 1, (b) => {
  flat(b, 0.74, 0.08, 0.74, OAK, [0, 0.04, 0]);
  b.cylinder(0.33, 0.25, 0.48, 0x86a296, { at: [0, 0.32, 0] }, 24);
  b.cylinder(0.345, 0.345, 0.05, 0xece6d6, { at: [0, 0.57, 0] }, 24);
  b.cylinder(0.3, 0.3, 0.02, 0x3e3428, { at: [0, 0.59, 0] }, 20);
  // A glaze highlight down the front.
  flat(b, 0.05, 0.3, 0.01, 0xb4ccc0, [-0.12, 0.34, 0.29], [0.1, 0, 0]);
  for (const [x, z, r] of [
    [0.04, 0, 0.1],
    [-0.06, 0.04, -0.15],
    [0.02, -0.06, 0.05],
  ] as const)
    b.cylinder(0.018, 0.025, 0.66, 0x8a8478, { at: [x, 0.9, z], rot: [r, 0, r * 1.5] }, 6);
  for (const [x, y, z, r, c] of [
    [0, 1.3, 0, 0.3, 0x5f8a4a],
    [0.19, 1.18, 0.1, 0.22, 0x6c9652],
    [-0.17, 1.2, -0.06, 0.22, 0x527e3e],
    [0.05, 1.48, -0.05, 0.19, 0x6c9652],
  ] as const)
    b.sphere(r, c, { at: [x, y, z] }, [1, 0.85, 1]);
});

// ---- The rest of the floor ----

/** An egg-shaped pod chair in a muted fabric (look), its hood open toward +z. */
export const podChair = looks([0.8, 0.8], FABRIC.length, (b, v) => {
  const c = nth(FABRIC, v + 1);
  b.cylinder(0.26, 0.3, 0.04, ALU_DARK, { at: [0, 0.02, 0] }, 20);
  b.cylinder(0.03, 0.03, 0.18, ALU_DARK, { at: [0, 0.12, 0] }, 8);
  // The shell: a deep half-sphere hood behind, a seat bowl.
  // The shell: a deep hood open toward +z (its gap round φ = π/2), the fabric lining inside it.
  const shell = new THREE.SphereGeometry(
    0.4,
    18,
    12,
    Math.PI * 0.8,
    Math.PI * 1.4,
    0,
    Math.PI * 0.62,
  );
  shell.scale(1, 1.35, 1);
  b.add(shell, 0xe8e6e0, { at: [0, 0.5, 0] });
  b.sphere(0.36, tint(c, -0.15), { at: [0, 0.55, -0.05] }, [1, 1.2, 0.85]);
  b.sphere(0.3, c, { at: [0, 0.38, 0.02] }, [1, 0.35, 1]);
  b.box(0.46, 0.4, 0.12, c, { at: [0, 0.62, -0.2], rot: [-0.2, 0, 0] }, 0.06);
});

/**
 * The floor's printer, an office multi-function one: light grey with two
 * paper trays, the scanner lid, a lit status panel blinking orange, a sheet
 * crumpled half out of the side, a yellow "PAPER JAM" note on the front
 * (someone's), a balled-up sheet on the floor.
 */
export const printer = looks([0.7, 0.6], 1, (b) => {
  const g = 0xc8ccce;
  b.box(0.66, 0.5, 0.56, tint(g, -0.12), { at: [0, 0.25, 0] }, 0.02);
  for (const y of [0.14, 0.32]) {
    flat(b, 0.6, 0.12, 0.01, tint(g, -0.05), [0, y, 0.282]);
    flat(b, 0.14, 0.02, 0.01, 0x5a5e64, [0, y + 0.03, 0.29]);
  }
  b.box(0.66, 0.34, 0.56, g, { at: [0, 0.67, 0] }, 0.02);
  flat(b, 0.4, 0.02, 0.3, 0x8a8e92, [0, 0.66, 0.29]);
  flat(b, 0.66, 0.04, 0.56, tint(g, 0.1), [0, 0.86, 0]);
  // The panel: dark, a lit status line and an orange light.
  flat(b, 0.24, 0.1, 0.03, SCREEN_OFF, [0.16, 0.8, 0.27], [-0.5, 0, 0]);
  glowBox(b, 0.14, 0.03, 0.004, 0xffa040, [0.15, 0.81, 0.289], [-0.5, 0, 0]);
  // The jammed sheet out of the side.
  flat(b, 0.22, 0.16, 0.01, 0xf4f2ec, [0.36, 0.6, 0.05], [0.3, 0.6, 0.4]);
  // The note.
  flat(b, 0.42, 0.18, 0.008, NOTE, [-0.05, 0.53, 0.285], [0, 0, -0.06]);
  letters(b, 'PAPER', -0.05, 0.57, 0.292, 0.016, INK);
  letters(b, 'JAM', -0.05, 0.49, 0.292, 0.016, INK);
  b.sphere(0.05, 0xf0eee8, { at: [0.3, 0.05, 0.42] });
});

// ---- The lifts ----

/** The lift bank: its height and depth. */
export const LIFTS = { height: 1.62, depth: 0.9 } as const;

/**
 * The lift core's end, `n` lifts wide along x, its face at z = 0 facing +z:
 * pale stone cladding in big joints, brushed-steel doors in steel frames,
 * an amber floor indicator over each ("7"), the call buttons between them.
 * The first lift stands open, its lit car inside (a mirror, a handrail).
 */
export function liftBank(n: number): SetPiece {
  return once(`lifts:${n}`, () =>
    looks([n * 0.95 + 0.3, LIFTS.depth], 1, (b) => {
      const W = n * 0.95 + 0.3;
      const H = LIFTS.height;
      const D = LIFTS.depth;
      flat(b, W, H, D, STONE, [0, H / 2, -D / 2]);
      for (let y = 0.4; y < H; y += 0.4)
        flat(b, W + 0.004, 0.012, 0.006, tint(STONE, -0.14), [0, y, 0.002]);
      flat(b, W + 0.03, 0.06, D + 0.03, tint(STONE, -0.2), [0, H + 0.03, -D / 2]);
      flat(b, W + 0.01, 0.08, 0.02, 0x6a6e72, [0, 0.04, 0.008]);
      const dw = 0.62;
      const dh = 1.12;
      for (let k = 0; k < n; k++) {
        const x = -W / 2 + 0.15 + (k + 0.5) * 0.95;
        flat(b, dw + 0.1, dh + 0.06, 0.03, 0x7a8086, [x, (dh + 0.06) / 2, 0.012]);
        if (k === 0) {
          // Open: the lit car, its back mirror, a handrail; the doors slid aside.
          glowBox(b, dw - 0.02, dh - 0.02, 0.01, 0xf2e8d4, [x, dh / 2, -0.3]);
          flat(b, dw - 0.2, dh * 0.5, 0.008, 0xa8b4bc, [x, dh * 0.6, -0.29]);
          flat(b, dw - 0.1, 0.03, 0.04, ALU, [x, 0.42, -0.27]);
          for (const s of [-1, 1])
            flat(b, 0.012, dh - 0.02, 0.3, 0xd8d4c8, [x + s * (dw / 2 - 0.01), dh / 2, -0.15]);
          flat(b, dw - 0.02, 0.012, 0.3, 0x8a8478, [x, 0.006, -0.15]);
          for (const s of [-1, 1])
            flat(b, 0.06, dh - 0.02, 0.02, STEEL, [x + s * (dw / 2 - 0.02), dh / 2, 0.03]);
        } else {
          for (const s of [-1, 1]) {
            flat(b, dw / 2 - 0.008, dh - 0.02, 0.02, STEEL, [x + (s * dw) / 4, dh / 2, 0.03]);
            for (const f of [0.3, 0.7])
              flat(b, 0.006, dh - 0.08, 0.004, STEEL_HI, [
                x + (s * dw) / 4 + (f - 0.5) * (dw / 2),
                dh / 2,
                0.042,
              ]);
          }
          flat(b, 0.012, dh - 0.02, 0.006, 0x2a2d32, [x, dh / 2, 0.043]);
        }
        // The indicator: a black strip, an arrow and the floor in amber.
        flat(b, 0.34, 0.12, 0.02, SCREEN_OFF, [x, dh + 0.17, 0.012]);
        letters(b, k === 0 ? '7' : '3', x + 0.06, dh + 0.17, 0.024, 0.018, AMBER, true);
        glowBox(b, 0.05, 0.05, 0.004, AMBER, [x - 0.06, dh + 0.17, 0.024], [0, 0, Math.PI / 4]);
        // The call buttons right of each door.
        flat(b, 0.06, 0.16, 0.012, STEEL_HI, [x + dw / 2 + 0.1, 0.95, 0.008]);
        b.led(0.016, AMBER, { at: [x + dw / 2 + 0.1, 0.98, 0.016] });
        b.led(0.016, 0x8a9096, { at: [x + dw / 2 + 0.1, 0.92, 0.016] });
      }
    }),
  );
}

// ---- The lift lobby in front ----

/**
 * The release board by the lifts (the ship hatch's story): a low screen on
 * two splayed steel legs, tilted back, its top under 0.5: a YOTTA-violet
 * header "RELEASES" in white, then a green tick and the version just
 * shipped, and two older lines greyed. Facing +z.
 */
export const releaseBoard = looks([1.5, 0.4], 1, (b) => {
  const tilt = 0.75;
  const w = 1.44;
  const h = 0.36;
  const cy = 0.29;
  const cz = 0;
  const at = (y: number, out = 0): V3 => [
    0,
    cy + y * Math.cos(tilt) + out * Math.sin(tilt),
    cz - y * Math.sin(tilt) + out * Math.cos(tilt),
  ];
  for (const s of [-1, 1]) {
    bar(b, [s * 0.55, 0, 0.12], [s * 0.55, cy, cz - 0.02], 0.035, 0x3a3d42);
    bar(b, [s * 0.55, 0, -0.2], [s * 0.55, cy, cz - 0.02], 0.035, 0x3a3d42);
  }
  b.box(w + 0.06, h + 0.06, 0.04, INK, { at: at(0, -0.02), rot: [-tilt, 0, 0] }, 0.012);
  flat(b, w, h, 0.01, 0x232a36, at(0, 0.004), [-tilt, 0, 0]);
  // The header band.
  glowBox(b, w, 0.1, 0.008, VIOLET, at(h / 2 - 0.05, 0.01), [-tilt, 0, 0]);
  const t = at(h / 2 - 0.05, 0.016);
  letters(b, 'RELEASES', 0, t[1], t[2], 0.016, 0xffffff, true, tilt);
  // The green tick and the version just shipped.
  const r = at(-0.03, 0.014);
  glowBox(b, 0.035, 0.07, 0.006, TICK, [-0.5, r[1] - 0.012, r[2] + 0.006], [-tilt, 0, 0.7]);
  glowBox(b, 0.035, 0.12, 0.006, TICK, [-0.45, r[1] + 0.003, r[2] - 0.004], [-tilt, 0, -0.6]);
  letters(b, 'V1.4.0', -0.02, r[1], r[2], 0.016, 0xe8f0e8, true, tilt);
  for (const [y, len] of [
    [-0.11, 0.8],
    [-0.15, 0.6],
  ] as const) {
    const p = at(y, 0.012);
    glowBox(b, len, 0.016, 0.004, 0x5a6478, [-0.05, p[1], p[2]], [-tilt, 0, 0]);
  }
});

/** A slim planter trough, 1.6 long: charcoal steel, spring grasses and low box balls, under 0.5 tall. */
export const planterTrough = looks([1.6, 0.32], 1, (b) => {
  flat(b, 1.6, 0.3, 0.3, 0x3c4046, [0, 0.15, 0]);
  flat(b, 1.56, 0.02, 0.26, 0x3e3428, [0, 0.3, 0]);
  for (let k = 0; k < 5; k++) {
    const x = -0.64 + k * 0.32;
    if (k % 2 === 0) b.sphere(0.12, 0x5f7e4a, { at: [x, 0.36, 0] }, [1, 0.8, 1]);
    else
      for (let j = 0; j < 5; j++) {
        const a = (j / 5) * Math.PI * 2;
        flat(
          b,
          0.014,
          0.16,
          0.01,
          j % 2 ? 0x8aa070 : 0x9aa87a,
          [x + Math.cos(a) * 0.03, 0.38, Math.sin(a) * 0.03],
          [Math.sin(a) * 0.3, a, Math.cos(a) * 0.3],
        );
      }
  }
});

/** The recycling bins: three slim bins in a row, paper (blue), plastic (yellow-ochre), general (grey), coloured lids with slots. */
export const recyclingBins = looks([1.0, 0.32], 1, (b) => {
  [0x4a6a8a, 0xb09a4a, 0x6a6e72].forEach((c, k) => {
    const x = (k - 1) * 0.33;
    b.box(0.3, 0.48, 0.3, 0xd2d4d4, { at: [x, 0.24, 0] }, 0.02);
    flat(b, 0.31, 0.04, 0.31, c, [x, 0.5, 0]);
    flat(b, 0.16, 0.012, 0.04, INK, [x, 0.522, 0.04]);
    flat(b, 0.22, 0.06, 0.006, c, [x, 0.36, 0.153]);
  });
});

// ---- Outside: the window cleaner's cradle ----

/** The cradle's rails' height. */
export const CRADLE = { len: 1.3, wide: 0.42 } as const;

/**
 * A window-cleaning cradle, `CRADLE.len` along x and facing +z (the glass):
 * a yellow steel deck and kick plates, aluminium rails, the end stirrups,
 * a bucket and a squeegee on the deck. Its ropes are a separate piece
 * (`cradleRopes`), so they can run up out of the frame as backdrop.
 */
export const cradle = looks([CRADLE.len, CRADLE.wide], 1, (b) => {
  const L = CRADLE.len;
  const W = CRADLE.wide;
  const yel = 0xd8b040;
  flat(b, L, 0.05, W, 0x6a6e72, [0, 0.025, 0]);
  for (const s of [-1, 1]) {
    flat(b, L, 0.14, 0.02, yel, [0, 0.09, (s * W) / 2]);
    flat(b, 0.02, 0.14, W, yel, [(s * L) / 2, 0.09, 0]);
  }
  for (const y of [0.55, 1.0]) {
    flat(b, L, 0.03, 0.03, ALU, [0, y, -W / 2]);
    flat(b, L, 0.03, 0.03, ALU, [0, y, W / 2]);
  }
  for (const x of [-L / 2, 0, L / 2])
    for (const s of [-1, 1]) flat(b, 0.03, 1.0, 0.03, ALU, [x, 0.5, (s * W) / 2]);
  // Stirrups at the ends, up to the rope points.
  for (const s of [-1, 1]) {
    flat(b, 0.04, 0.5, 0.04, 0x3a3d42, [(s * L) / 2, 1.25, 0]);
    flat(b, 0.04, 0.04, W, 0x3a3d42, [(s * L) / 2, 1.5, 0]);
  }
  b.cylinder(0.08, 0.07, 0.16, 0x4a7ab0, { at: [0.35, 0.13, -0.05] }, 12);
  flat(b, 0.24, 0.03, 0.03, INK, [-0.4, 0.07, 0.1], [0, 0.4, 0]);
});

/** The cradle's ropes: two dark lines from its stirrups straight up `high`, out of the frame. */
export function cradleRopes(high: number): SetPiece {
  return once(`ropes:${high.toFixed(2)}`, () =>
    looks([CRADLE.len, 0.1], 1, (b) => {
      for (const s of [-1, 1])
        flat(b, 0.016, high, 0.016, 0x2a2c30, [(s * CRADLE.len) / 2, 1.5 + high / 2, 0]);
    }),
  );
}

// ---- Outside: the street far below ----

/**
 * A cherry tree in blossom far below, seen from above: a dark trunk, a
 * clumped canopy of greyed pink puffs with a few spring leaves. `look` turns
 * and sizes the clumps; the canopy is about 0.3 tall.
 */
export const cherryTree = looks([0.5, 0.5], 4, (b, v) => {
  b.cylinder(0.022, 0.03, 0.18, BARK, { at: [0, 0.09, 0] }, 6);
  const puffs = 5 + (v % 2);
  for (let k = 0; k < puffs; k++) {
    const a = (k / puffs) * Math.PI * 2 + v * 0.9;
    const r = k === 0 ? 0 : 0.1 + hash01(k, v, 3) * 0.05;
    const s = 0.08 + hash01(k, v, 5) * 0.04;
    b.sphere(
      s,
      nth(BLOSSOM, k + v),
      { at: [Math.cos(a) * r, 0.22 + hash01(k, v, 7) * 0.06, Math.sin(a) * r] },
      [1, 0.8, 1],
    );
  }
  b.sphere(0.05, LEAF, { at: [0.08, 0.2, -0.1] });
});

/** A car far below in daylight: tiny, a muted paint by look, dark glass, along x. */
export const dayCar = looks([0.5, 0.24], 5, (b, v) => {
  const paint = nth([0x6a7078, 0x9a4a42, 0xd4d2cc, 0x2e3440, 0x5a7a96], v);
  b.box(0.46, 0.07, 0.22, paint, { at: [0, 0.06, 0] }, 0.02);
  b.box(0.26, 0.06, 0.19, tint(paint, -0.08), { at: [-0.03, 0.12, 0] }, 0.02);
  flat(b, 0.22, 0.04, 0.2, 0x34404e, [-0.03, 0.13, 0]);
});

/** A city bus far below: long and boxy, muted red with a pale roof, a band of dark windows. Along x. */
export const bus = looks([1.2, 0.28], 1, (b) => {
  b.box(1.16, 0.2, 0.26, 0xa85a4c, { at: [0, 0.12, 0] }, 0.02);
  flat(b, 1.1, 0.07, 0.268, 0x2e3844, [0, 0.16, 0]);
  flat(b, 1.12, 0.02, 0.24, 0xd8d6d0, [0, 0.225, 0]);
  for (const x of [-0.3, 0.2]) flat(b, 0.16, 0.03, 0.12, 0x8a8e92, [x, 0.245, 0]);
});

/** A bus stop far below: a little glass shelter, a dark roof, an advert panel at the end, along x. */
export const busStop = looks([0.5, 0.16], 1, (b) => {
  flat(b, 0.48, 0.02, 0.18, 0x3a3d42, [0, 0.2, 0]);
  b.pane(0.46, 0.17, 0.01, GLASS, { at: [0, 0.1, -0.07] });
  for (const x of [-0.23, 0.23]) flat(b, 0.012, 0.2, 0.012, 0x3a3d42, [x, 0.1, -0.07]);
  flat(b, 0.012, 0.16, 0.14, 0xe0d4b0, [0.24, 0.1, 0]);
  flat(b, 0.3, 0.02, 0.04, 0x6a5a4a, [0, 0.05, -0.03]);
});

/**
 * MONOLITH's tower, far off: a tall black-glass slab, fins, a pale crown band
 * and its name in grey letters near the top; faint, as it's far.
 */
export function monolithTower(w: number, h: number): SetPiece {
  return once(`monolith:${w}:${h}`, () =>
    looks([w, w], 1, (b) => {
      flat(b, w, h, w, MONOLITH_GLASS, [0, h / 2, -w / 2]);
      for (let x = -w / 2 + 0.2; x < w / 2; x += 0.2)
        flat(b, 0.03, h, 0.04, tint(MONOLITH_GLASS, 0.12), [x, h / 2, 0.01]);
      for (let y = 0.3; y < h - 0.3; y += 0.3)
        flat(b, w, 0.015, 0.03, tint(MONOLITH_GLASS, -0.2), [0, y, 0.01]);
      flat(b, w + 0.04, 0.1, w + 0.04, 0x8a96aa, [0, h - 0.12, -w / 2]);
      flat(b, w * 0.9, 0.24, 0.02, tint(MONOLITH_GLASS, -0.3), [0, h - 0.45, 0.03]);
      letters(b, 'MONOLITH', 0, h - 0.45, 0.045, 0.04, 0x9aa6b8);
    }),
  );
}

// ---- Ground ----

export const COLORS = {
  ASPHALT,
  PAVEMENT,
  KERB,
  LANE,
  GRASS,
  PATH,
  STONE,
  ALU,
  SPANDREL,
  GLASS,
  VIOLET,
} as const;
