import * as THREE from 'three';
import { type KitMaterials, ModelBuilder } from '../kit';

/**
 * The company's moving van, built in code: a box truck with a sunny cargo
 * box (a stripe and a curly-brace logo on its sides), an orange cab with a
 * windscreen, headlights that glow and four wheels that spin. It stands on
 * the ground at its group's origin, facing +z.
 */

export const VAN_COLORS = {
  box: 0xffc83d,
  cab: 0xf08a24,
  stripe: 0xffffff,
  logo: 0x2f6fb4,
  chassis: 0x3a3f47,
  bumper: 0xc9ccd2,
  window: 0x2b4a66,
  tyre: 0x2a2d33,
  hub: 0xd9dbe0,
  headlight: 0xfff3c4,
  taillight: 0xff4a3d,
} as const;

/** Sizes in map tiles: about 1.4 tiles long, so it reads next to a flag without hiding its number. */
const VAN = {
  length: 1.4,
  width: 0.66,
  wheel: { radius: 0.15, width: 0.11, front: 0.4, back: -0.42 },
  /** The chassis rides this high; the body sits on it (and bounces on its springs). */
  ride: 0.17,
};

export interface Van {
  root: THREE.Group;
  /** The body above the axles: bounces and tilts. */
  body: THREE.Group;
  /** Turned round their axles as the van drives. */
  wheels: THREE.Mesh[];
  wheelRadius: number;
  /** The body's resting height. */
  ride: number;
}

export function buildVan(materials: KitMaterials): Van {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = VAN.ride;
  root.add(body);

  const half = VAN.length / 2;
  const w = VAN.width;
  const c = VAN_COLORS;
  const boxFront = 0.18;
  const boxLength = boxFront + half - 0.02;
  const boxHeight = 0.62;
  const boxZ = boxFront - boxLength / 2;
  const cabLength = half - boxFront - 0.02;
  const cabZ = boxFront + 0.01 + cabLength / 2;

  const b = new ModelBuilder()
    // Chassis and bumpers.
    .box(w - 0.08, 0.1, VAN.length - 0.06, c.chassis, { at: [0, 0.02, 0] })
    .box(w - 0.02, 0.09, 0.08, c.bumper, { at: [0, 0.04, half - 0.03] })
    .box(w - 0.02, 0.09, 0.06, c.bumper, { at: [0, 0.04, -half + 0.02] })
    // The cargo box.
    .box(w, boxHeight, boxLength, c.box, { at: [0, 0.07 + boxHeight / 2, boxZ] }, 0.05)
    // The cab: a lower hood and a taller, narrower cabin behind it.
    .box(w - 0.04, 0.24, cabLength, c.cab, { at: [0, 0.19, cabZ] }, 0.05)
    .box(w - 0.06, 0.26, cabLength * 0.62, c.cab, {
      at: [0, 0.42, cabZ - cabLength * 0.17],
    })
    // Roof spoiler over the cab, up to the box.
    .box(w - 0.08, 0.06, cabLength * 0.5, c.cab, {
      at: [0, 0.56, boxFront - cabLength * 0.2],
      rot: [-0.25, 0, 0],
    })
    // Back doors: a seam and two handles.
    .box(0.015, boxHeight - 0.1, 0.01, c.chassis, { at: [0, 0.07 + boxHeight / 2, -half - 0.01] })
    .box(0.05, 0.03, 0.02, c.bumper, { at: [-0.06, 0.38, -half - 0.01] })
    .box(0.05, 0.03, 0.02, c.bumper, { at: [0.06, 0.38, -half - 0.01] });

  // Each side of the box: a stripe along it and a blue logo disc with a white "{ }".
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 0.005);
    b.box(0.02, 0.07, boxLength - 0.1, c.stripe, { at: [x, 0.2, boxZ] });
    b.cylinder(0.15, 0.15, 0.02, c.logo, { at: [x, 0.46, boxZ], rot: [0, 0, Math.PI / 2] }, 24);
    for (const brace of [-1, 1]) {
      const bx = x + side * 0.012;
      const bz = boxZ + brace * 0.055;
      b.box(0.012, 0.16, 0.025, c.stripe, { at: [bx, 0.46, bz] });
      b.box(0.012, 0.025, 0.04, c.stripe, { at: [bx, 0.53, bz - brace * 0.02] });
      b.box(0.012, 0.025, 0.04, c.stripe, { at: [bx, 0.39, bz - brace * 0.02] });
      b.box(0.012, 0.025, 0.035, c.stripe, { at: [bx, 0.46, bz + brace * 0.025] });
    }
    // Side window and mirror on the cab.
    b.box(0.02, 0.15, cabLength * 0.4, c.window, {
      at: [side * ((w - 0.06) / 2 + 0.005), 0.46, cabZ - cabLength * 0.15],
    });
    b.box(0.06, 0.07, 0.03, c.chassis, { at: [side * (w / 2 + 0.02), 0.42, cabZ + 0.05] });
  }
  // The windscreen, leaning back, and a grille under it.
  b.box(w - 0.12, 0.2, 0.03, c.window, {
    at: [0, 0.44, cabZ + cabLength * 0.14],
    rot: [-0.35, 0, 0],
  });
  b.box(w - 0.24, 0.07, 0.02, c.chassis, { at: [0, 0.18, half - 0.005] });
  // Headlights (glowing) and taillights.
  for (const side of [-1, 1]) {
    b.led(0.045, c.headlight, { at: [side * (w / 2 - 0.09), 0.2, half - 0.01] });
    b.box(0.07, 0.07, 0.02, c.taillight, { at: [side * (w / 2 - 0.07), 0.14, -half - 0.01] });
  }
  const model = b.build();
  const shell = new THREE.Mesh(model.body, materials.body);
  shell.castShadow = true;
  body.add(shell);
  if (model.glow) body.add(new THREE.Mesh(model.glow, materials.glow));

  // The wheels: a tyre with a light hub, the axle along x.
  const { radius, width, front, back } = VAN.wheel;
  const wheelModel = new ModelBuilder()
    .cylinder(radius, radius, width, c.tyre, { rot: [0, 0, Math.PI / 2] }, 16)
    .cylinder(radius * 0.5, radius * 0.5, width + 0.01, c.hub, { rot: [0, 0, Math.PI / 2] }, 12)
    .box(width + 0.012, radius * 0.25, radius * 1.1, c.chassis, {}, 0)
    .build();
  const wheels: THREE.Mesh[] = [];
  for (const z of [front, back]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelModel.body, materials.body);
      wheel.position.set(side * (w / 2 - width / 2 + 0.02), radius, z);
      wheel.castShadow = true;
      root.add(wheel);
      wheels.push(wheel);
    }
  }
  return { root, body, wheels, wheelRadius: radius, ride: VAN.ride };
}
