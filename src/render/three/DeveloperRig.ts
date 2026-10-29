import * as THREE from 'three';
import { isRoleId, type RoleId } from '../../sim/roles';
import type { PlayerId } from '../../sim/state';
import { playerColor } from '../playerColors';
import { type KitMaterials, ModelBuilder, tint } from './kit';
import { PALETTE } from './look';
import type { Pose } from './pose';

/** Compact angular production crew. Shared targets/cadence, different garment and head cuts. */
export const DEVELOPER_TOP = 1.54;
const UP = new THREE.Vector3(0, 1, 0);
const TROUSERS = 0x29384e;
const CREAM = 0xf2e5cf;
const SKINS = [0xf2c6a0, 0x8d5a3b, 0xc68b59, 0xe8b48a] as const;
const HAIRS = [0x302728, 0x171c23, 0x885030, 0x493834] as const;
export const DEVELOPER_PRESENTATIONS = ['male', 'female'] as const;
export type DeveloperPresentation = (typeof DEVELOPER_PRESENTATIONS)[number];

/** Cosmetics belong to the person, never to their profession. */
export interface DeveloperAppearance {
  skin: number;
  hair: number;
  presentation?: DeveloperPresentation;
}

export function developerAppearance(id: PlayerId): Required<DeveloperAppearance> {
  return {
    skin: SKINS[(id - 1) % SKINS.length] ?? PALETTE.skin,
    hair: HAIRS[(id - 1) % HAIRS.length] ?? HAIRS[0],
    presentation: id % 2 === 0 ? 'female' : 'male',
  };
}

interface Arm {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  elbow: THREE.Mesh;
  hand: THREE.Mesh;
  shoulder: THREE.Object3D;
}
interface Leg {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  shoe: THREE.Mesh;
}
export interface DeveloperRig {
  roleId: RoleId;
  presentation: DeveloperPresentation;
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  waist: THREE.Mesh;
  arms: [Arm, Arm];
  legs: [Leg, Leg];
  geometries: THREE.BufferGeometry[];
}

const CUTS = {
  generalist: { width: 0.5, height: 0.32, shoulder: 0.24, nod: 1 },
  frontend: { width: 0.55, height: 0.26, shoulder: 0.26, nod: 1.15 },
  backend: { width: 0.54, height: 0.34, shoulder: 0.26, nod: 0.8 },
  qa: { width: 0.43, height: 0.43, shoulder: 0.21, nod: 1.3 },
  platform: { width: 0.53, height: 0.35, shoulder: 0.25, nod: 0.9 },
} satisfies Record<RoleId, { width: number; height: number; shoulder: number; nod: number }>;

export function createDeveloperRig(
  roleId: RoleId,
  id: PlayerId,
  materials: KitMaterials,
  appearance: DeveloperAppearance = developerAppearance(id),
): DeveloperRig {
  if (!isRoleId(roleId)) throw new Error(`Unknown developer role: ${String(roleId)}`);
  const cut = CUTS[roleId];
  const color = playerColor(id);
  const { skin, hair } = appearance;
  const presentation = appearance.presentation ?? developerAppearance(id).presentation;
  const female = presentation === 'female';
  const root = new THREE.Group();
  root.name = `developer-${roleId}`;
  const torso = new THREE.Group();
  const head = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const mesh = (builder: ModelBuilder): THREE.Mesh => {
    const geometry = builder.build().body;
    geometries.push(geometry);
    const made = new THREE.Mesh(geometry, materials.body);
    made.castShadow = made.receiveShadow = true;
    return made;
  };
  root.add(torso);
  torso.add(head);
  head.position.y = 0.33;

  const jacket = new ModelBuilder()
    .box(cut.width, cut.height, 0.3, color, { at: [0, 0.12, 0] }, 0.035)
    .box(0.35, 0.16, 0.29, tint(color, -0.18), { at: [0, -0.07, 0] }, 0.02);
  switch (roleId) {
    case 'generalist':
      jacket
        .box(0.08, 0.33, 0.025, CREAM, { at: [-0.08, 0.12, 0.16], rot: [0, 0, -0.28] })
        .box(0.15, 0.1, 0.03, tint(color, -0.35), { at: [0.12, 0.08, 0.17] })
        .box(0.07, 0.29, 0.025, CREAM, { at: [0.04, 0.1, -0.16], rot: [0, 0, 0.3] });
      break;
    case 'frontend':
      jacket
        .box(0.23, 0.27, 0.032, CREAM, { at: [-0.12, 0.12, 0.16] })
        .box(0.12, 0.08, 0.035, TROUSERS, { at: [0.15, 0.17, 0.17] })
        .box(0.25, 0.12, 0.032, CREAM, { at: [0.1, 0.08, -0.16] });
      break;
    case 'backend':
      jacket
        .box(0.32, 0.34, 0.032, TROUSERS, { at: [0, 0.11, 0.16] })
        .box(0.32, 0.33, 0.025, TROUSERS, { at: [0, 0.12, -0.16] })
        .box(0.3, 0.09, 0.32, tint(color, -0.3), { at: [0, 0.31, 0] })
        .box(0.025, 0.3, 0.025, CREAM, { at: [0, 0.12, 0.183] });
      break;
    case 'qa':
      jacket
        .box(0.15, 0.44, 0.025, CREAM, { at: [-0.1, 0.08, 0.16] })
        .box(0.15, 0.44, 0.025, CREAM, { at: [0.1, 0.08, 0.16] })
        .box(0.14, 0.1, 0.03, TROUSERS, { at: [0.1, -0.02, 0.18] })
        .box(0.035, 0.38, 0.025, CREAM, { at: [0, 0.1, -0.16] });
      break;
    case 'platform':
      jacket
        .box(0.18, 0.31, 0.04, tint(color, -0.4), { at: [-0.15, 0.1, 0.17] })
        .box(0.18, 0.31, 0.04, tint(color, -0.4), { at: [0.15, 0.1, 0.17] })
        .box(0.12, 0.1, 0.05, CREAM, { at: [-0.15, 0.01, 0.2] })
        .box(0.12, 0.1, 0.05, CREAM, { at: [0.15, 0.01, 0.2] })
        .box(0.42, 0.065, 0.025, CREAM, { at: [0, 0.19, -0.16] });
      break;
  }
  // Matching front/back pictograms survive rear views and grayscale.
  for (const z of [0.205, -0.18]) badge(jacket, roleId, 0.1, 0.19, z);
  torso.add(mesh(jacket));

  const face = new ModelBuilder()
    .box(female ? 0.36 : 0.39, 0.37, 0.34, skin, { at: [0, 0.17, 0] }, female ? 0.065 : 0.055)
    .box(female ? 0.085 : 0.1, 0.07, 0.11, skin, { at: [0, 0.14, 0.2] }, 0.02);
  switch (roleId) {
    case 'generalist':
      face
        .box(0.35, 0.13, 0.28, hair, { at: [-0.025, 0.35, -0.025], rot: [0.12, 0, 0.3] })
        .box(0.09, 0.2, 0.25, hair, { at: [-0.17, 0.25, -0.05] }, 0.02);
      if (female) {
        face
          .box(0.32, 0.19, 0.08, hair, { at: [0, 0.21, -0.16] })
          .box(0.16, 0.2, 0.13, hair, { at: [-0.08, 0.1, -0.22], rot: [-0.25, 0, 0.15] })
          .box(0.17, 0.035, 0.14, CREAM, { at: [-0.08, 0.18, -0.22] });
      }
      break;
    case 'frontend':
      face
        .box(0.29, 0.15, 0.32, hair, { at: [-0.07, 0.36, -0.025], rot: [0, 0, 0.2] })
        .box(female ? 0.15 : 0.08, female ? 0.34 : 0.16, 0.29, hair, {
          at: [female ? -0.2 : -0.17, female ? 0.22 : 0.3, -0.045],
        })
        .box(0.06, 0.18, 0.3, hair, { at: [0.18, 0.29, -0.04] });
      if (female) face.sphere(0.027, CREAM, { at: [0.205, 0.08, 0.04] });
      break;
    case 'backend':
      face
        .box(0.39, 0.075, 0.33, hair, { at: [0, 0.36, -0.02] })
        .box(0.34, 0.18, 0.08, hair, { at: [0, 0.22, -0.16] });
      if (female) {
        face
          .box(0.27, 0.1, 0.2, hair, { at: [0.06, 0.34, 0.075], rot: [0, 0, -0.18] })
          .box(0.2, 0.16, 0.14, hair, { at: [0, 0.14, -0.23] });
      } else {
        face.box(0.37, 0.12, 0.09, hair, { at: [0, 0.07, 0.145] });
      }
      break;
    case 'qa':
      face
        .box(0.47, 0.15, 0.36, hair, { at: [0, 0.37, -0.04] }, 0.05)
        .box(0.1, female ? 0.3 : 0.13, 0.3, hair, { at: [-0.21, female ? 0.21 : 0.3, -0.05] })
        .box(0.1, female ? 0.3 : 0.13, 0.3, hair, { at: [0.21, female ? 0.21 : 0.3, -0.05] })
        .box(0.41, 0.05, 0.035, TROUSERS, { at: [0, 0.23, -0.205] });
      for (const x of [-0.085, 0.085]) {
        face.box(0.155, 0.13, 0.045, TROUSERS, { at: [x, 0.22, 0.19] }, 0.02);
        face.box(0.115, 0.09, 0.02, CREAM, { at: [x, 0.22, 0.218] });
      }
      break;
    case 'platform':
      face
        .box(0.37, 0.09, 0.32, hair, { at: [0, 0.36, -0.02] })
        .torus(0.235, 0.028, TROUSERS, { at: [0, 0.22, 0], rot: [0, 0, 0] }, Math.PI)
        .box(0.09, 0.17, 0.18, TROUSERS, { at: [-0.235, 0.21, 0] })
        .box(0.09, 0.17, 0.18, TROUSERS, { at: [0.235, 0.21, 0] })
        .box(0.025, 0.025, 0.16, TROUSERS, { at: [0.23, 0.14, 0.13] })
        .sphere(0.035, CREAM, { at: [0.23, 0.14, 0.22] });
      if (female) {
        face
          .box(0.32, 0.22, 0.07, hair, { at: [0, 0.22, -0.17] })
          .box(0.22, 0.16, 0.13, hair, { at: [0, 0.23, -0.22] });
      }
      break;
  }
  for (const sign of [-1, 1]) {
    face
      .sphere(0.036, CREAM, { at: [sign * 0.08, 0.22, 0.177] }, [1, 1.18, 0.4])
      .sphere(
        0.02,
        PALETTE.ink,
        { at: [sign * 0.08, 0.215, roleId === 'qa' ? 0.235 : 0.195] },
        [1, 1.2, 0.5],
      )
      .box(0.075, female ? 0.018 : 0.025, 0.025, hair, {
        at: [sign * 0.08, 0.29, 0.18],
        rot: [0, 0, sign * (female ? 0.18 : 0.1)],
      })
      .sphere(0.045, skin, { at: [sign * 0.195, 0.13, 0] });
  }
  face.box(0.08, 0.018, 0.025, roleId === 'backend' && !female ? CREAM : PALETTE.ink, {
    at: [0, 0.065, 0.2],
  });
  head.add(mesh(face));
  const waist = mesh(new ModelBuilder().cylinder(0.13, 0.14, 1, tint(color, -0.18), {}, 8));
  root.add(waist);
  const makeArm = (sign: number): Arm => {
    const shoulder = new THREE.Object3D();
    shoulder.position.set(sign * cut.shoulder, 0.16, 0);
    torso.add(shoulder);
    const upper = mesh(new ModelBuilder().cylinder(0.085, 0.07, 1, color, {}, 8));
    const lower = mesh(new ModelBuilder().cylinder(0.06, 0.055, 1, skin, {}, 8));
    const elbow = mesh(new ModelBuilder().sphere(0.068, skin));
    const hand = mesh(new ModelBuilder().box(0.13, 0.12, 0.14, skin, {}, 0.025));
    root.add(upper, lower, elbow, hand);
    return { upper, lower, elbow, hand, shoulder };
  };
  const makeLeg = (): Leg => {
    const upper = mesh(new ModelBuilder().cylinder(0.085, 0.07, 1, TROUSERS, {}, 8));
    const lower = mesh(new ModelBuilder().cylinder(0.07, 0.06, 1, TROUSERS, {}, 8));
    const shoe = mesh(
      new ModelBuilder()
        .box(0.18, 0.1, 0.3, tint(color, -0.6), { at: [0, 0.065, 0.055] }, 0.04)
        .box(0.19, 0.035, 0.31, CREAM, { at: [0, 0.02, 0.055] }, 0.012),
    );
    root.add(upper, lower, shoe);
    return { upper, lower, shoe };
  };
  return {
    roleId,
    presentation,
    root,
    torso,
    head,
    waist,
    arms: [makeArm(-1), makeArm(1)],
    legs: [makeLeg(), makeLeg()],
    geometries,
  };
}

function badge(b: ModelBuilder, role: RoleId, x: number, y: number, z: number): void {
  b.box(0.12, 0.11, 0.018, CREAM, { at: [x, y, z] });
  const front = z + Math.sign(z) * 0.012;
  switch (role) {
    case 'generalist':
      b.box(0.07, 0.018, 0.01, TROUSERS, { at: [x, y, front] }).box(0.018, 0.07, 0.01, TROUSERS, {
        at: [x, y, front],
      });
      break;
    case 'frontend':
      b.box(0.08, 0.065, 0.01, TROUSERS, { at: [x, y, front] }).box(0.06, 0.018, 0.012, CREAM, {
        at: [x, y + 0.013, front + Math.sign(z) * 0.006],
      });
      break;
    case 'backend':
    case 'platform':
      for (const dy of [-0.027, 0, 0.027]) {
        b.box(role === 'backend' ? 0.065 : 0.085, 0.015, 0.01, TROUSERS, {
          at: [x, y + dy, front],
        });
      }
      if (role === 'platform')
        b.box(0.012, 0.07, 0.012, CREAM, { at: [x + 0.02, y, front + Math.sign(z) * 0.006] });
      break;
    case 'qa':
      b.box(0.018, 0.04, 0.01, TROUSERS, { at: [x - 0.02, y - 0.01, front], rot: [0, 0, 0.7] }).box(
        0.018,
        0.075,
        0.01,
        TROUSERS,
        { at: [x + 0.01, y, front], rot: [0, 0, -0.6] },
      );
      break;
  }
}

function segment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  const delta = to.clone().sub(from);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, delta.clone().normalize());
  mesh.scale.y = delta.length();
}

/** Elastic two-segment arms keep exact wrist anchors through the common throw arc. */
function elbowAt(shoulder: THREE.Vector3, hand: THREE.Vector3, sign: number): THREE.Vector3 {
  const axis = hand.clone().sub(shoulder);
  const distance = axis.length();
  if (distance > 1.12) throw new Error('Developer hand target exceeds arm reach');
  axis.normalize();
  const out = new THREE.Vector3(sign, 0, -0.3);
  out.addScaledVector(axis, -out.dot(axis)).normalize();
  const length = Math.max(0.24, distance / 2 + 0.025);
  return shoulder
    .clone()
    .add(hand)
    .multiplyScalar(0.5)
    .addScaledVector(out, Math.sqrt(length ** 2 - (distance / 2) ** 2));
}

export function poseDeveloperRig(c: DeveloperRig, pose: Pose): void {
  const wind = pose.windUp;
  const duck = Math.sin(Math.PI * wind);
  const bend = duck * 1.15;
  // The study's leftward duck clears the actual folder/tab envelope without moving the ticket.
  c.torso.position.set(
    -0.19 * Math.sin(bend),
    0.36 + 0.19 * Math.cos(bend) + pose.bob,
    -0.3 * duck - Math.max(0, pose.squash.x - 1) * 0.7,
  );
  c.torso.rotation.set(pose.lean * 0.5 + wind * 0.5, 0, pose.roll + bend);
  c.torso.scale.set(pose.squash.x, pose.squash.y, pose.squash.x);
  c.head.scale.set(1 / pose.squash.x, 1 / pose.squash.y, 1 / pose.squash.x);
  c.head.rotation.x = 0.12 + pose.nod * CUTS[c.roleId].nod;
  c.root.updateMatrixWorld(true);
  const waistTop = c.root.worldToLocal(c.torso.localToWorld(new THREE.Vector3(0, -0.1, 0)));
  segment(c.waist, new THREE.Vector3(0, 0.36 + pose.bob, 0), waistTop);
  c.arms.forEach((arm, i) => {
    const target = i === 0 ? pose.leftHand : pose.rightHand;
    const hand = new THREE.Vector3(target.x, target.y + pose.bob, target.z);
    const shoulder = c.root.worldToLocal(arm.shoulder.getWorldPosition(new THREE.Vector3()));
    const elbow = elbowAt(shoulder, hand, i === 0 ? -1 : 1);
    segment(arm.upper, shoulder, elbow);
    segment(arm.lower, elbow, hand);
    arm.elbow.position.copy(elbow);
    arm.hand.position.copy(hand);
  });
  c.legs.forEach((leg, i) => {
    const sign = i === 0 ? -1 : 1;
    const stride = pose.stride + i * Math.PI;
    const swing = Math.sin(stride) * pose.walk;
    const lift = Math.max(0, Math.cos(stride)) * 0.09 * pose.walk;
    const foot = new THREE.Vector3(sign * 0.13, lift, swing * 0.16);
    leg.shoe.position.copy(foot);
    const hip = new THREE.Vector3(sign * 0.13, 0.4 + pose.bob, 0);
    const knee = new THREE.Vector3(sign * 0.13, 0.23 + lift, swing * 0.08 + 0.025);
    segment(leg.upper, hip, knee);
    segment(leg.lower, knee, foot.clone().add(new THREE.Vector3(0, 0.1, 0)));
  });
}
