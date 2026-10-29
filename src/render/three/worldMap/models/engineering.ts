import * as THREE from 'three';
import { COLOR } from '../../palette';
import { type CityPiece, styleOf } from '../cityPlan';
import { C, choose, frac, type Parts } from './shared';

/** Engineering: server cabinets, dishes, masts, solar panels, cooling, drones and robots. */

/** Status LEDs on a server: mostly green, some blue, now and then an amber one. */
const LED_COLORS = [0x5fe08a, 0x5fe08a, 0x5fe08a, COLOR.ledCyan, 0xffc23d];

/** An outdoor server cabinet: dark, with vents, a row of servers and their LEDs behind the door glass. */
export function serverRack(p: CityPiece, { body: b, glow, blink }: Parts, rng: () => number): void {
  const style = styleOf(p);
  const h = p.h;
  const z = p.d / 2;
  const shell = choose([0x2c3340, 0x3a3a44, 0x2c3a3a, 0x3d4250], frac(p.variant * 6.1));
  b.box(p.w, h, p.d, shell, { at: [0, h / 2, 0] }, 0.03);
  b.box(p.w + 0.03, 0.04, p.d + 0.03, COLOR.slate, { at: [0, h + 0.02, 0] }, 0.01);
  b.box(p.w + 0.02, 0.06, p.d + 0.02, 0x1d222b, { at: [0, 0.03, 0] }, 0);
  // Servers behind the door, each with a little row of LEDs.
  const units = Math.max(3, Math.round((h - 0.2) / 0.13));
  for (let u = 0; u < units; u++) {
    const y = 0.16 + u * ((h - 0.28) / (units - 1));
    b.box(p.w - 0.1, 0.07, 0.01, 0x3d4657, { at: [0, y, z + 0.006] }, 0);
    for (let k = 0; k < 3; k++) {
      glow.led(0.016, choose(LED_COLORS, rng()), {
        at: [-p.w / 2 + 0.1 + k * 0.05, y, z + 0.014],
      });
    }
  }
  // Vent slats on the side.
  for (let k = 0; k < 4; k++)
    b.box(0.01, 0.03, p.d * 0.6, 0x1d222b, { at: [p.w / 2 + 0.004, h * 0.55 + k * 0.06, 0] }, 0);
  if (style === 1) {
    // A fan on top, and cable trunking down into the ground.
    b.cylinder(0.12, 0.12, 0.05, C.steel, { at: [0, h + 0.06, 0] }, 14);
    b.cylinder(0.09, 0.09, 0.01, C.ink, { at: [0, h + 0.09, 0] }, 14);
    b.box(0.06, h * 0.7, 0.06, COLOR.slate, { at: [-p.w / 2 - 0.04, h * 0.35, -p.d * 0.2] }, 0);
  } else if (style === 2) {
    // A little antenna whip and a solar panel.
    b.cylinder(0.006, 0.008, 0.35, C.steel, { at: [-p.w * 0.3, h + 0.2, 0] }, 5);
    b.box(
      p.w * 0.8,
      0.02,
      p.d * 0.7,
      COLOR.solarPanel,
      { at: [0.02, h + 0.08, 0], rot: [-0.35, 0, 0] },
      0,
    );
  }
  // The light on top that blinks with the cranes'.
  blink.led(0.03, 0x5fe08a, { at: [p.w * 0.3, h + 0.07, 0] });
}

/** A satellite dish on a short post (or on an equipment hut), its bowl turned up toward the sky and the camera. */
export function dish(p: CityPiece, { body: b, glow }: Parts): void {
  const hut = styleOf(p) === 1;
  if (hut) {
    b.box(0.42, 0.3, 0.36, C.concrete, { at: [0, 0.15, 0] }, 0.02);
    b.box(0.12, 0.2, 0.02, C.ink, { at: [0.1, 0.1, 0.19] }, 0);
    glow.led(0.02, 0x5fe08a, { at: [-0.12, 0.24, 0.185] });
  } else b.box(0.22, 0.06, 0.22, C.concrete, { at: [0, 0.03, 0] }, 0.01);
  const base = hut ? 0.3 : 0;
  b.cylinder(0.025, 0.03, hut ? 0.2 : 0.4, C.steel, { at: [0, base + (hut ? 0.1 : 0.26), 0] }, 8);
  // Which way the bowl faces: up and toward the camera, a little more or less per dish.
  const tilt = 0.75 + frac(p.variant * 7) * 0.35;
  const size = hut ? 0.75 : 1;
  const y0 = hut ? base + 0.26 : 0.5;
  const face = (k: number): [number, number, number] => [
    0,
    y0 + Math.cos(tilt) * k,
    Math.sin(tilt) * k,
  ];
  const rot: [number, number, number] = [tilt, 0, 0];
  b.cylinder(0.3 * size, 0.07 * size, 0.12 * size, C.white, { at: face(0), rot }, 20);
  b.cylinder(0.25 * size, 0.25 * size, 0.01, 0xc9d0da, { at: face(0.062 * size), rot }, 20);
  // The feed on its arm, out in front of the bowl.
  b.cylinder(0.012, 0.012, 0.24 * size, C.steel, { at: face(0.18 * size), rot }, 6);
  glow.led(0.03, COLOR.ledCyan, { at: face(0.3 * size) });
}

/** A radio mast: a tapering steel tower with antenna panels and a blinking light on top. */
export function antenna(p: CityPiece, { body: b, blink }: Parts): void {
  const h = p.h;
  b.box(0.36, 0.08, 0.36, C.concrete, { at: [0, 0.04, 0] }, 0.01);
  if (styleOf(p) === 1) {
    // A monopole: one tapering mast with two rings of panels and a dish.
    b.cylinder(0.025, 0.05, h, 0xb8bec6, { at: [0, h / 2, 0] }, 10);
    for (const y of [h - 0.25, h - 0.6]) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + y;
        b.box(
          0.06,
          0.2,
          0.025,
          C.white,
          { at: [Math.sin(a) * 0.07, y, Math.cos(a) * 0.07], rot: [0, a, 0] },
          0.01,
        );
      }
    }
    b.cylinder(0.08, 0.02, 0.04, C.white, { at: [0, h * 0.5, 0.06], rot: [Math.PI / 2, 0, 0] }, 12);
    blink.led(0.04, C.warn, { at: [0, h + 0.04, 0] });
    return;
  }
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    // Each leg leans in toward the top.
    b.cylinder(
      0.012,
      0.02,
      h,
      C.steel,
      {
        at: [x * 0.07, h / 2, z * 0.07],
        rot: [z * 0.05, 0, -x * 0.05],
      },
      6,
    );
  }
  for (let y = 0.3; y < h - 0.2; y += 0.28) {
    const s = 0.2 - (y / h) * 0.12;
    b.box(s, 0.015, 0.015, C.steel, { at: [0, y, s / 2] }, 0);
    b.box(0.015, 0.015, s, C.steel, { at: [s / 2, y, 0] }, 0);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    b.box(
      0.07,
      0.22,
      0.03,
      C.white,
      {
        at: [Math.sin(a) * 0.09, h - 0.3, Math.cos(a) * 0.09],
        rot: [0, a, 0],
      },
      0.01,
    );
  }
  b.cylinder(0.008, 0.01, 0.25, C.steel, { at: [0, h + 0.1, 0] }, 6);
  blink.led(0.04, C.warn, { at: [0, h + 0.24, 0] });
}

// ---- More engineering and street furniture ----

/** Solar panels tilted to the sky on a low frame, two or three across. */
export function solar(p: CityPiece, { body: b }: Parts): void {
  const n = styleOf(p) === 0 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const x = -p.w / 2 + (p.w / n) * (i + 0.5);
    b.box(
      p.w / n - 0.04,
      0.025,
      p.d * 0.8,
      COLOR.solarPanel,
      { at: [x, 0.22, 0], rot: [-0.5, 0, 0] },
      0,
    );
    b.box(p.w / n - 0.04, 0.03, 0.01, COLOR.hazeBlue, { at: [x, 0.22, 0], rot: [-0.5, 0, 0] }, 0);
  }
  for (const x of [-p.w / 2 + 0.05, p.w / 2 - 0.05]) {
    b.box(0.03, 0.3, 0.03, C.steel, { at: [x, 0.15, -p.d * 0.25] }, 0);
    b.box(0.03, 0.12, 0.03, C.steel, { at: [x, 0.06, p.d * 0.25] }, 0);
  }
}

/** A cooling unit: a box with a big fan on top, or two fans side by side. */
export function cooling(p: CityPiece, { body: b, glow }: Parts): void {
  const twin = styleOf(p) === 1;
  b.box(p.w, p.h - 0.05, p.d, COLOR.lightSteel, { at: [0, (p.h - 0.05) / 2, 0] }, 0.03);
  for (let i = 0; i < 6; i++)
    b.box(p.w - 0.08, 0.012, 0.01, COLOR.steel, { at: [0, 0.08 + i * 0.05, p.d / 2 + 0.004] }, 0);
  const fans = twin ? [-p.w * 0.24, p.w * 0.24] : [0];
  for (const x of fans) {
    b.cylinder(twin ? 0.12 : 0.18, twin ? 0.12 : 0.18, 0.04, C.ink, { at: [x, p.h - 0.04, 0] }, 16);
    b.box(twin ? 0.2 : 0.3, 0.01, 0.03, C.steel, { at: [x, p.h - 0.015, 0] }, 0);
  }
  glow.led(0.018, 0x5fe08a, { at: [p.w / 2 - 0.06, p.h - 0.12, p.d / 2 + 0.006] });
}

/** A cable spool on its side, wound in network cable. */
export function spool(p: CityPiece, { body: b }: Parts): void {
  const cable = choose(
    [COLOR.brightBlue, COLOR.sunYellow, COLOR.violet, C.teal],
    frac(p.variant * 4.7),
  );
  for (const z of [-0.1, 0.1])
    b.cylinder(0.16, 0.16, 0.03, COLOR.wood, { at: [0, 0.16, z], rot: [Math.PI / 2, 0, 0] }, 16);
  b.cylinder(0.12, 0.12, 0.18, cable, { at: [0, 0.16, 0], rot: [Math.PI / 2, 0, 0] }, 16);
  b.box(0.012, 0.012, 0.3, cable, { at: [0.08, 0.02, 0.2], rot: [0, 0.4, 0] }, 0);
}

/** A landing pad with a delivery drone sitting on it, a parcel underneath. */
export function dronePad(p: CityPiece, { body: b, glow }: Parts): void {
  const r = p.w / 2;
  b.cylinder(r, r, 0.03, COLOR.asphalt, { at: [0, 0.015, 0] }, 20);
  b.add(new THREE.RingGeometry(r * 0.7, r * 0.8, 20).rotateX(-Math.PI / 2), COLOR.sunYellow, {
    at: [0, 0.032, 0],
  });
  b.box(0.1, 0.07, 0.1, COLOR.cardboard, { at: [0, 0.07, 0] }, 0.01);
  b.box(0.14, 0.05, 0.14, C.white, { at: [0, 0.13, 0] }, 0.02);
  for (const a of [0.785, 2.356, 3.927, 5.498]) {
    b.box(
      0.14,
      0.012,
      0.02,
      C.ink,
      { at: [Math.cos(a) * 0.08, 0.15, Math.sin(a) * 0.08], rot: [0, -a, 0] },
      0,
    );
    b.cylinder(
      0.05,
      0.05,
      0.008,
      COLOR.lightSteel,
      { at: [Math.cos(a) * 0.15, 0.165, Math.sin(a) * 0.15] },
      12,
    );
  }
  glow.led(0.015, COLOR.ledCyan, { at: [0, 0.16, 0.07] });
}

/** A six-wheeled delivery robot with a flag on a whip. */
export function robot(p: CityPiece, { body: b, glow }: Parts): void {
  b.box(p.w, 0.12, p.d, C.white, { at: [0, 0.1, 0] }, 0.03);
  b.box(p.w * 0.9, 0.03, p.d * 0.9, COLOR.asphalt, { at: [0, 0.17, 0] }, 0.01);
  for (const x of [-1, 1])
    for (const z of [-1, 0, 1])
      b.cylinder(
        0.03,
        0.03,
        0.02,
        C.ink,
        { at: [x * p.w * 0.5, 0.035, z * p.d * 0.35], rot: [0, 0, Math.PI / 2] },
        8,
      );
  glow.led(0.012, COLOR.ledCyan, { at: [0, 0.12, p.d / 2 + 0.003] });
  b.cylinder(0.004, 0.004, 0.25, C.ink, { at: [-p.w * 0.3, 0.3, -p.d * 0.35] }, 4);
  b.box(0.06, 0.04, 0.004, COLOR.orange, { at: [-p.w * 0.3 + 0.03, 0.41, -p.d * 0.35] }, 0);
}

/** An EV charger post with its cable and a glowing ring. */
export function evCharger(p: CityPiece, { body: b, glow }: Parts): void {
  b.box(p.w, p.h, p.d * 0.7, COLOR.porcelain, { at: [0, p.h / 2, 0] }, 0.03);
  b.box(p.w * 0.7, 0.12, 0.01, C.ink, { at: [0, p.h * 0.7, p.d * 0.35 + 0.005] }, 0);
  glow.add(
    new THREE.RingGeometry(0.035, 0.05, 16),
    0x5fe08a,
    { at: [0, p.h * 0.45, p.d * 0.35 + 0.008] },
    'glow',
  );
  b.torus(0.06, 0.012, C.ink, { at: [p.w / 2 + 0.02, p.h * 0.35, 0], rot: [0, Math.PI / 2, 0] });
}
