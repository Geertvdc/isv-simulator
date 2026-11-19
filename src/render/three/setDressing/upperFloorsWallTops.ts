import * as THREE from 'three';
import { type Model, ModelBuilder, tint } from '../kit';
import { framed, text } from '../roomModels/basement';
import type { FrontKind, TopKind } from '../rooms/upperFloorsRoom';
import { segfaultCat } from './onCall';

/**
 * On the partitions of Hot Desking's three floors: what stands on top of
 * them, in stacked clusters, and what lies on the hot-desk floor's low
 * front wall. Hot desking means your stuff lives in a locker: banks of
 * steel lockers with dusty violet doors (YOTTA's logo on some, names on
 * tape), coat stands, bags; in the test lab, device-testing shelves (phones
 * on stands, a tablet rack, a tub of test devices); in the meeting room the
 * one Friday cake on a side table, and a plant. Muted colours, darker than
 * every station top; nothing in a station's or a player's colour; the cake
 * is the one food allowed. Segfault sleeps in an open, empty locker.
 */

/** The lockers' muted steel, their dusty violet doors, the dark inside. */
export const LOCKER_STEEL = 0x7d848b;
export const LOCKER_VIOLET = 0x77699a;
const LOCKER_INSIDE = 0x6a6458;
/** The warm strip light inside Segfault's open locker. */
const LOCKER_GLOW = 0xffd9a0;
const PAPER = 0xeeeee8;
const INK = 0x2a2d33;
/** Coats and bags in muted colours: navy, charcoal, camel, olive, burgundy. */
const CLOTH = [0x3a4660, 0x45484e, 0x9a8462, 0x66704f, 0x6e3a40] as const;
const nth = (k: number) => CLOTH[k % CLOTH.length] ?? 0x45484e;

/** A thing built at desk size and grown by `scale`, so it reads from the couch. */
function prop(build: (b: ModelBuilder) => void, scale = 1): () => Model {
  return () => {
    const b = new ModelBuilder();
    build(b);
    const model = b.build();
    for (const g of [model.body, model.glow, model.glass]) g?.scale(scale, scale, scale);
    return model;
  };
}

/** The lockers' size: a bank of three columns on a plinth. */
export const LOCKER_W = 0.3;
export const LOCKER_H = 0.68;
/** A bank on a full-height wall: two short tiers, so it never towers over the room. */
export const LOCKER_H_SHORT = 0.46;
const LOCKER_D = 0.42;
const PLINTH = 0.04;

/** Which of a bank's doors are violet, which wear YOTTA's logo, which have a name on tape. */
interface BankLook {
  violet: readonly boolean[];
  logo: number;
  names: readonly (string | null)[];
  /** The column standing open, empty (Segfault's), or −1. */
  open: number;
}

/**
 * A bank of three steel lockers, two tiers high (one tall door on the open
 * one), on a dark plinth: vent slots, a number plate and a lock on each
 * door, a violet door here and there, YOTTA's logo on one, names on tape.
 */
function lockerBank(b: ModelBuilder, look: BankLook, H = LOCKER_H): void {
  const w = LOCKER_W * 3;
  const top = PLINTH + H;
  b.box(w + 0.02, PLINTH, LOCKER_D - 0.04, 0x33373d, { at: [0, PLINTH / 2, 0] }, 0);
  // The body, a column at a time: the open one hollow (back, floor, roof, its outer side).
  for (let c = 0; c < 3; c++) {
    const x = -w / 2 + (c + 0.5) * LOCKER_W;
    const cy = PLINTH + H / 2;
    if (c !== look.open) {
      b.box(LOCKER_W, H, LOCKER_D, LOCKER_STEEL, { at: [x, cy, 0] }, 0.006);
      continue;
    }
    b.box(LOCKER_W, H, 0.02, LOCKER_STEEL, { at: [x, cy, -LOCKER_D / 2 + 0.01] }, 0);
    b.box(LOCKER_W, 0.02, LOCKER_D, LOCKER_STEEL, { at: [x, PLINTH + 0.01, 0] }, 0);
    b.box(LOCKER_W, 0.02, LOCKER_D, LOCKER_STEEL, { at: [x, PLINTH + H - 0.01, 0] }, 0);
    for (const s of [-1, 1])
      if ((s < 0 && c === 0) || (s > 0 && c === 2))
        b.box(0.02, H, LOCKER_D, LOCKER_STEEL, { at: [x + (s * LOCKER_W) / 2, cy, 0] }, 0);
  }
  b.box(w + 0.01, 0.012, LOCKER_D + 0.01, tint(LOCKER_STEEL, -0.06), { at: [0, top, 0] }, 0);
  const f = LOCKER_D / 2;
  for (let c = 0; c < 3; c++) {
    const x = -w / 2 + (c + 0.5) * LOCKER_W;
    const violet = look.violet[c] ?? false;
    const door = violet ? LOCKER_VIOLET : tint(LOCKER_STEEL, 0.04);
    if (c === look.open) {
      // The open one: dark and empty inside, its door swung out toward the next bank.
      b.box(
        LOCKER_W - 0.03,
        H - 0.03,
        0.01,
        LOCKER_INSIDE,
        {
          at: [x, PLINTH + H / 2, -LOCKER_D / 2 + 0.025],
        },
        0,
      );
      b.box(
        LOCKER_W - 0.04,
        0.008,
        LOCKER_D - 0.06,
        tint(LOCKER_INSIDE, 0.15),
        {
          at: [x, PLINTH + 0.02, f - LOCKER_D / 2 + 0.01],
        },
        0,
      );
      b.box(
        LOCKER_W - 0.04,
        0.012,
        0.02,
        tint(LOCKER_INSIDE, 0.25),
        { at: [x, PLINTH + H - 0.07, f - 0.04] },
        0,
      );
      // A small warm strip under its roof, so the sleeper inside reads.
      b.screen(LOCKER_W - 0.08, 0.025, LOCKER_GLOW, {
        at: [x, PLINTH + H - 0.025, f - 0.06],
        rot: [Math.PI / 2, 0, 0],
      });
      const hx = x + LOCKER_W / 2 - 0.01;
      const d = framed(b, [hx, PLINTH + H / 2, f + 0.004], [0, -1.75, 0]);
      d.box(LOCKER_W - 0.03, H - 0.03, 0.014, door, { at: [-(LOCKER_W - 0.03) / 2, 0, 0] }, 0.004);
      for (let k = 0; k < 4; k++)
        d.box(
          0.12,
          0.008,
          0.004,
          tint(door, -0.25),
          {
            at: [-(LOCKER_W - 0.03) / 2, H / 2 - 0.08 - k * 0.02, -0.009],
          },
          0,
        );
      continue;
    }
    for (let t = 0; t < 2; t++) {
      const h = H / 2 - 0.02;
      const y = PLINTH + H / 4 + t * (H / 2);
      b.box(LOCKER_W - 0.024, h, 0.008, door, { at: [x, y, f + 0.004] }, 0);
      // Vent slots, the number plate, the lock.
      for (let k = 0; k < 3; k++)
        b.box(
          0.12,
          0.007,
          0.003,
          tint(door, -0.3),
          { at: [x, y + h / 2 - 0.04 - k * 0.018, f + 0.009] },
          0,
        );
      b.box(0.05, 0.022, 0.003, 0xd8dade, { at: [x - 0.06, y - h / 2 + 0.05, f + 0.009] }, 0);
      b.cylinder(
        0.012,
        0.012,
        0.01,
        0x2a2d33,
        { at: [x + 0.09, y, f + 0.01], rot: [Math.PI / 2, 0, 0] },
        8,
      );
    }
    const name = look.names[c];
    if (name) {
      b.box(
        0.17,
        0.034,
        0.003,
        PAPER,
        { at: [x - 0.01, PLINTH + H * 0.62, f + 0.011], rot: [0, 0, 0.04] },
        0,
      );
      text(b, name, x - 0.01, PLINTH + H * 0.62, f + 0.013, 0.0055, INK);
    }
    if (c === look.logo) {
      // YOTTA's logo: a white Y in a ring, the name under it.
      const y = PLINTH + H * 0.3;
      // YOTTA's logo decal, 0.2 wide: a white ring with the Y, the name under it.
      b.torus(0.07, 0.011, 0xf2f0fa, { at: [x, y + 0.03, f + 0.011] });
      text(b, 'Y', x, y + 0.03, f + 0.011, 0.014, 0xf2f0fa);
      text(b, 'YOTTA', x, y - 0.065, f + 0.011, 0.0095, 0xf2f0fa);
    }
  }
}

const BANKS: Readonly<Record<'lockers' | 'lockersLogo' | 'lockersOpen', BankLook>> = {
  lockers: { violet: [false, true, false], logo: -1, names: ['PRIYA', null, 'TOM?'], open: -1 },
  lockersLogo: { violet: [true, false, true], logo: 0, names: [null, 'DEV 3', null], open: -1 },
  lockersOpen: { violet: [false, false, true], logo: 2, names: ['SAM', null, null], open: 1 },
};

/** The On Call cat's grey fur, and Segfault's a shade lighter so it reads in the dark locker. */
const CAT_FUR = 0x8a8580;
const SEGFAULT_FUR = 0xa49f99;

/**
 * Segfault asleep in the open locker of a `lockersOpen` bank, built at the
 * bank's origin: the On Call cat, small, curled on the locker's floor.
 * Its own model, so the scene can make it breathe.
 */
export function segfaultInLocker(): Model {
  const m = segfaultCat.model(0);
  const s = 0.5;
  const turn = new THREE.Matrix4().compose(
    new THREE.Vector3(0, PLINTH + 0.02, 0.02),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3, 0)),
    new THREE.Vector3(s, s, s),
  );
  for (const g of [m.body, m.glow, m.glass]) g?.applyMatrix4(turn);
  const from = new THREE.Color(CAT_FUR);
  const to = new THREE.Color(SEGFAULT_FUR);
  const colors = m.body.getAttribute('color');
  for (let i = 0; i < colors.count; i++)
    if (
      Math.abs(colors.getX(i) - from.r) < 1e-3 &&
      Math.abs(colors.getY(i) - from.g) < 1e-3 &&
      Math.abs(colors.getZ(i) - from.b) < 1e-3
    )
      colors.setXYZ(i, to.r, to.g, to.b);
  colors.needsUpdate = true;
  return m;
}

/** A coat stand: a steel pole on a round foot, hooks, three coats and a scarf, a tote on a hook. */
function coatStand(b: ModelBuilder): void {
  b.cylinder(0.14, 0.15, 0.02, 0x3a3f46, { at: [0, 0.01, 0] }, 20);
  b.cylinder(0.016, 0.016, 0.78, 0x6a7078, { at: [0, 0.4, 0] }, 10);
  b.sphere(0.03, 0x6a7078, { at: [0, 0.8, 0] });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    b.box(
      0.1,
      0.012,
      0.012,
      0x6a7078,
      { at: [Math.cos(a) * 0.05, 0.74, Math.sin(a) * 0.05], rot: [0, -a, 0.5] },
      0,
    );
  }
  // The coats: long shapes hanging off the hooks, folded collars.
  for (const [k, a, len] of [
    [0, 0.5, 0.46],
    [3, 2.1, 0.38],
    [1, 3.9, 0.42],
  ] as const) {
    const x = Math.cos(a) * 0.1;
    const z = Math.sin(a) * 0.1 + 0.02;
    b.box(
      0.18,
      len,
      0.08,
      nth(k),
      { at: [x, 0.74 - len / 2, z], rot: [0, -a + Math.PI / 2, 0.04] },
      0.03,
    );
    b.box(
      0.12,
      0.05,
      0.09,
      tint(nth(k), -0.15),
      { at: [x, 0.72, z], rot: [0, -a + Math.PI / 2, 0] },
      0.02,
    );
  }
  b.box(0.05, 0.3, 0.03, 0xa04848, { at: [0.02, 0.6, 0.1], rot: [0, 0, 0.1] }, 0.012);
}

/** Bags: a backpack slumped against a laptop bag, a tote on top. */
function bags(b: ModelBuilder): void {
  b.box(0.36, 0.2, 0.14, nth(1), { at: [-0.08, 0.1, 0.02], rot: [0, 0.1, 0] }, 0.03);
  b.box(0.2, 0.012, 0.012, 0x2a2d33, { at: [-0.08, 0.215, 0.02], rot: [0, 0.1, 0] }, 0);
  b.box(0.26, 0.32, 0.18, nth(0), { at: [0.14, 0.16, -0.02], rot: [0.08, -0.3, 0] }, 0.06);
  b.box(
    0.18,
    0.12,
    0.05,
    tint(nth(0), -0.12),
    { at: [0.15, 0.1, 0.08], rot: [0.08, -0.3, 0] },
    0.03,
  );
  b.box(0.22, 0.2, 0.06, 0xc8bfa8, { at: [-0.12, 0.31, 0.0], rot: [-0.2, 0.3, 0.15] }, 0.02);
  b.torus(0.06, 0.008, 0xc8bfa8, { at: [-0.12, 0.43, 0.0], rot: [0, 0.3, 0] }, Math.PI);
}

/** A phone on a little stand, screen toward +z, lit. */
function phone(b: ModelBuilder, x: number, y: number, z: number, glow: number, yaw = 0): void {
  b.box(0.07, 0.012, 0.06, 0x3a3f46, { at: [x, y + 0.006, z], rot: [0, yaw, 0] }, 0);
  b.box(0.07, 0.13, 0.012, 0x22252a, { at: [x, y + 0.075, z + 0.01], rot: [-0.25, yaw, 0] }, 0.006);
  b.screen(0.058, 0.11, glow, {
    at: [x + Math.sin(yaw) * 0.008, y + 0.076, z + 0.018],
    rot: [-0.25, yaw, 0],
  });
}

/** Device-testing shelves: a two-shelf white rack with phones on stands, cables down to a hub. */
function phoneShelf(b: ModelBuilder): void {
  const w = 0.82;
  b.box(w, 0.02, 0.3, 0xd8dcdc, { at: [0, 0.01, 0] }, 0);
  b.box(w, 0.02, 0.26, 0xd8dcdc, { at: [0, 0.26, -0.02] }, 0);
  for (const s of [-1, 1])
    b.box(0.02, 0.28, 0.26, 0xb8bcbc, { at: [s * (w / 2 - 0.01), 0.14, -0.02] }, 0);
  const glows = [0x5a8ac0, 0x4aa07a, 0xc08a4a, 0x7a6ac0, 0x5a8ac0];
  for (let k = 0; k < 5; k++)
    phone(b, -0.32 + k * 0.16, 0.02, 0.04, glows[k] ?? 0x5a8ac0, (k - 2) * 0.08);
  for (let k = 0; k < 3; k++) phone(b, -0.2 + k * 0.2, 0.27, 0.0, glows[k + 1] ?? 0x5a8ac0);
  b.box(0.16, 0.04, 0.08, 0x2a2d33, { at: [0.3, 0.3, -0.06] }, 0.01);
  b.led(0.008, 0x4cd964, { at: [0.25, 0.3, -0.018] });
}

/** A tablet rack: tablets slotted upright in a steel rack, one lying on top lit. */
function tabletRack(b: ModelBuilder): void {
  b.box(0.6, 0.06, 0.3, 0x6a7078, { at: [0, 0.03, 0] }, 0.01);
  for (let k = 0; k < 5; k++) {
    const x = -0.24 + k * 0.12;
    b.box(
      0.02,
      0.26,
      0.2,
      k % 2 ? 0x2a2d33 : 0x3a3e44,
      { at: [x, 0.19, 0], rot: [0, 0, (k - 2) * 0.04] },
      0.008,
    );
    b.box(0.005, 0.2, 0.16, 0x1c2a3a, { at: [x + 0.012, 0.19, 0], rot: [0, 0, (k - 2) * 0.04] }, 0);
  }
  b.box(0.3, 0.014, 0.22, 0x22252a, { at: [0.05, 0.33, 0.02], rot: [0, 0.2, 0] }, 0.006);
  b.screen(0.27, 0.19, 0x6a8fb0, { at: [0.05, 0.34, 0.02], rot: [-Math.PI / 2, 0, -0.2] });
  b.box(0.16, 0.035, 0.003, PAPER, { at: [0, 0.04, 0.151] }, 0);
  text(b, 'TEST KIT', 0, 0.04, 0.153, 0.0045, INK);
}

/** A grey tub of test devices: DEVICES on its label, phones and a charger cable spilling. */
function deviceBin(b: ModelBuilder): void {
  b.box(0.42, 0.16, 0.3, 0x8a9096, { at: [0, 0.08, 0] }, 0.02);
  b.box(0.38, 0.01, 0.26, 0x3a3e44, { at: [0, 0.155, 0] }, 0);
  for (let k = 0; k < 4; k++)
    b.box(
      0.07,
      0.012,
      0.14,
      k % 2 ? 0x2a2d33 : 0xd8d8dc,
      {
        at: [-0.12 + k * 0.08, 0.17 + (k % 2) * 0.01, -0.02 + (k % 3) * 0.03],
        rot: [0.1 * k, 0.4 * k, 0.12],
      },
      0.004,
    );
  b.box(0.2, 0.05, 0.003, PAPER, { at: [0, 0.08, 0.151] }, 0);
  text(b, 'DEVICES', 0, 0.08, 0.153, 0.0055, INK);
  b.torus(0.08, 0.006, 0xeeeeee, { at: [0.16, 0.06, 0.16], rot: [0.3, 0, 0] }, Math.PI * 1.4);
  // A sticky note: DO NOT UPDATE.
  b.box(0.07, 0.07, 0.003, 0xf2e27a, { at: [-0.14, 0.11, 0.152], rot: [0, 0, 0.1] }, 0);
}

/** The one Friday cake: a small round side table, a cake with one slice gone, plates, a knife. */
function cakeTable(b: ModelBuilder): void {
  b.cylinder(0.2, 0.2, 0.025, 0xb8b4ac, { at: [0, 0.3, 0] }, 24);
  b.cylinder(0.02, 0.02, 0.28, 0x6a7078, { at: [0, 0.15, 0] }, 10);
  b.cylinder(0.1, 0.11, 0.015, 0x6a7078, { at: [0, 0.008, 0] }, 16);
  // The cake: chocolate sponge under white icing, a slice cut out toward the room.
  const cake = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 24, 1, false, 0.5, Math.PI * 2 - 0.9);
  b.add(cake, 0x6a4430, { at: [0, 0.353, 0] });
  const icing = new THREE.CylinderGeometry(
    0.102,
    0.102,
    0.02,
    24,
    1,
    false,
    0.5,
    Math.PI * 2 - 0.9,
  );
  b.add(icing, 0xf2ece4, { at: [0, 0.4, 0] });
  b.cylinder(0.12, 0.12, 0.006, 0xe8e8e8, { at: [0, 0.315, 0] }, 24);
  b.cylinder(0.004, 0.004, 0.05, 0x7a5cd0, { at: [-0.03, 0.435, -0.02] }, 6);
  b.led(0.008, 0xffc860, { at: [-0.03, 0.465, -0.02] });
  // Paper plates, a knife.
  b.cylinder(0.045, 0.04, 0.008, 0xf4f4f0, { at: [0.13, 0.317, 0.1] }, 14);
  b.cylinder(0.045, 0.04, 0.008, 0xf4f4f0, { at: [-0.14, 0.317, 0.08] }, 14);
  b.box(0.12, 0.006, 0.014, 0xc8ccd0, { at: [0.08, 0.32, -0.1], rot: [0, 0.6, 0] }, 0);
}

/** A meeting-room plant: a tall snake plant in a slate pot. */
function meetingPlant(b: ModelBuilder): void {
  b.cylinder(0.13, 0.1, 0.26, 0x4a4e56, { at: [0, 0.13, 0] }, 16);
  b.cylinder(0.12, 0.12, 0.02, 0x4a3828, { at: [0, 0.255, 0] }, 16);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const h = 0.28 + (k % 3) * 0.07;
    b.box(
      0.045,
      h,
      0.012,
      k % 2 ? 0x4a6a48 : 0x5a7a50,
      {
        at: [Math.cos(a) * 0.05, 0.26 + h / 2, Math.sin(a) * 0.05],
        rot: [Math.sin(a) * 0.15, -a, Math.cos(a) * 0.15],
      },
      0.01,
    );
  }
}

/** What stands on the wall tops, by kind. */
export const UPPER_TOPS: Readonly<Record<TopKind, () => Model>> = {
  lockers: prop((b) => {
    lockerBank(b, BANKS.lockers);
  }),
  lockersLogo: prop((b) => {
    lockerBank(b, BANKS.lockersLogo);
  }),
  lockersOpen: prop((b) => {
    lockerBank(b, BANKS.lockersOpen);
  }),
  coatStand: prop(coatStand, 0.9),
  bags: prop(bags),
  phoneShelf: prop(phoneShelf),
  tabletRack: prop(tabletRack),
  deviceBin: prop(deviceBin),
  cakeTable: prop(cakeTable),
  meetingPlant: prop(meetingPlant),
};

/** The locker banks on full-height walls: two short tiers. */
export const UPPER_SHORT_LOCKERS: Readonly<
  Record<'lockers' | 'lockersLogo' | 'lockersOpen', () => Model>
> = {
  lockers: prop((b) => {
    lockerBank(b, BANKS.lockers, LOCKER_H_SHORT);
  }),
  lockersLogo: prop((b) => {
    lockerBank(b, BANKS.lockersLogo, LOCKER_H_SHORT);
  }),
  lockersOpen: prop((b) => {
    lockerBank(b, BANKS.lockersOpen, LOCKER_H_SHORT);
  }),
};

/** The tallest a front-wall prop gets (over the wall's top). */
export const UPPER_FRONT_MAX_HEIGHT = 0.3;

/** What lies on the hot-desk floor's low front wall, by kind: a hand high at most. */
export const UPPER_FRONTS: Readonly<Record<FrontKind, () => Model>> = {
  gymBag: prop((b) => {
    b.box(0.46, 0.17, 0.2, nth(0), { at: [0, 0.085, 0] }, 0.07);
    b.box(0.44, 0.012, 0.012, 0x2a2d33, { at: [0, 0.17, 0] }, 0);
    b.torus(0.08, 0.01, 0x2a2d33, { at: [0, 0.17, 0] }, Math.PI);
    b.box(0.1, 0.04, 0.003, 0xd8dade, { at: [0.12, 0.09, 0.1] }, 0);
  }),
  coatPile: prop((b) => {
    b.box(0.44, 0.07, 0.3, nth(2), { at: [0, 0.035, 0], rot: [0, 0.2, 0] }, 0.03);
    b.box(0.36, 0.06, 0.26, nth(4), { at: [0.03, 0.1, 0.01], rot: [0, -0.15, 0.05] }, 0.03);
    b.box(0.06, 0.02, 0.36, 0x8a8f96, { at: [-0.1, 0.14, 0.02], rot: [0, 0.4, 0] }, 0.008);
  }),
  mugTray: prop((b) => {
    b.box(0.44, 0.02, 0.26, 0x4a4e56, { at: [0, 0.01, 0] }, 0.006);
    const mugs = [0xe4e4de, 0x6a52b0, 0xe4e4de, 0x3a4660, 0xc8bfa8];
    mugs.forEach((c, k) => {
      const x = -0.15 + (k % 3) * 0.15;
      const z = k < 3 ? -0.05 : 0.07;
      b.cylinder(0.045, 0.04, 0.1, c, { at: [x + (k >= 3 ? 0.07 : 0), 0.07, z] }, 14);
      b.cylinder(0.038, 0.038, 0.004, 0x3a2418, { at: [x + (k >= 3 ? 0.07 : 0), 0.11, z] }, 12);
    });
  }),
  laptopStack: prop((b) => {
    // Three laptop bags dumped one on another, each turned a little.
    for (let k = 0; k < 3; k++) {
      const c = nth(k + 1);
      const y = 0.035 + k * 0.07;
      b.box(
        0.42 - k * 0.03,
        0.065,
        0.3 - k * 0.02,
        c,
        { at: [0.01 * k, y, 0], rot: [0, (k - 1) * 0.18, 0] },
        0.02,
      );
      b.box(
        0.2,
        0.01,
        0.012,
        0x2a2d33,
        { at: [0.01 * k, y + 0.036, 0.1 - k * 0.01], rot: [0, (k - 1) * 0.18, 0] },
        0,
      );
    }
  }),
  headsetBox: prop((b) => {
    // A grey tub of spare headsets, HEADSETS on a label, two spilling over the rim.
    b.box(0.4, 0.14, 0.28, 0x7e858c, { at: [0, 0.07, 0] }, 0.015);
    b.box(0.36, 0.01, 0.24, 0x3a3e44, { at: [0, 0.135, 0] }, 0);
    for (const [x, z, a] of [
      [-0.08, -0.02, 0.3],
      [0.1, 0.04, -0.5],
      [0.02, 0.0, 1.2],
    ] as const) {
      b.torus(0.06, 0.012, 0x2a2d33, { at: [x, 0.16, z], rot: [Math.PI / 2 - 0.4, a, 0] }, Math.PI);
      b.cylinder(
        0.03,
        0.03,
        0.02,
        0x3a3e44,
        { at: [x - 0.06, 0.15, z], rot: [0, 0, Math.PI / 2] },
        10,
      );
    }
    b.box(0.18, 0.04, 0.003, PAPER, { at: [0, 0.07, 0.141] }, 0);
    text(b, 'HEADSETS', 0, 0.07, 0.143, 0.004, INK);
  }),
  laptopBag: prop((b) => {
    b.box(0.42, 0.06, 0.3, nth(1), { at: [0, 0.03, 0], rot: [0, -0.2, 0] }, 0.02);
    b.box(0.36, 0.022, 0.25, 0x9aa0a6, { at: [0.02, 0.075, 0], rot: [0, 0.1, 0] }, 0.008);
    b.box(0.34, 0.004, 0.2, 0x6a7078, { at: [0.02, 0.088, -0.01], rot: [0, 0.1, 0] }, 0);
  }),
};
