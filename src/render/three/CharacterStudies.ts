/**
 * Phase 21a only. Three competing hat-free languages, not a production cast.
 * The study rig uses the game's hand targets but adds attached, jointed limbs.
 */
import * as THREE from 'three';
import type { PlayerId } from '../../sim/state';
import { playerColor } from '../playerColors';
import { type KitMaterials, ModelBuilder, tint } from './kit';
import { carryPoint } from './layout';
import { PALETTE } from './look';
import { COLOR } from './palette';
import { type PoseInput, playerPose } from './pose';

export const STUDY_STYLES = ['angular', 'clay', 'cartoon'] as const;
export type StudyStyle = (typeof STUDY_STYLES)[number];
export const STUDY_NAMES: Record<StudyStyle, string> = {
  angular: 'Compact angular',
  clay: 'Rounded stop-motion',
  cartoon: 'Workplace cartoon',
};

/** Study bounds only; the playable cast's overlay/hat bounds are unchanged. */
export const STUDY_HEAD_TOP = 1.54;
const MAX_ARM_LENGTH = 0.56;
const UP = new THREE.Vector3(0, 1, 0);
const SKIN = [COLOR.skinLight, COLOR.skinDeep, COLOR.skinTan, COLOR.skinWarm] as const;
const HAIR = COLOR.hairDark;
const TROUSERS = COLOR.denim;
const SOLE = COLOR.cream;

const SHAPES = {
  angular: { hip: 0.13, shoulder: 0.24, torsoY: 0.55, neck: 0.33, beat: 1 },
  clay: { hip: 0.14, shoulder: 0.22, torsoY: 0.5, neck: 0.36, beat: 0.75 },
  cartoon: { hip: 0.1, shoulder: 0.29, torsoY: 0.61, neck: 0.33, beat: 1.3 },
} as const;

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

export interface StudyCharacter {
  style: StudyStyle;
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  waist: THREE.Mesh;
  arms: [Arm, Arm];
  legs: [Leg, Leg];
  geometries: THREE.BufferGeometry[];
}

export function createStudy(
  style: StudyStyle,
  playerId: PlayerId,
  materials: KitMaterials,
): StudyCharacter {
  const root = new THREE.Group();
  const torso = new THREE.Group();
  const head = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const color = playerColor(playerId);
  const skin = SKIN[(playerId - 1) % SKIN.length] ?? SKIN[0];
  const shape = SHAPES[style];
  const mesh = (builder: ModelBuilder): THREE.Mesh => {
    const geometry = builder.build().body;
    geometries.push(geometry);
    const made = new THREE.Mesh(geometry, materials.body);
    made.castShadow = true;
    made.receiveShadow = true;
    return made;
  };
  root.add(torso);
  torso.add(head);
  head.position.y = shape.neck;

  const jacket = new ModelBuilder();
  const face = new ModelBuilder();
  if (style === 'angular') {
    jacket
      .box(0.5, 0.32, 0.3, color, { at: [0, 0.12, 0] }, 0.035)
      .box(0.35, 0.16, 0.29, tint(color, -0.18), { at: [0, -0.07, 0] }, 0.02)
      .box(0.08, 0.33, 0.025, SOLE, { at: [-0.08, 0.12, 0.16], rot: [0, 0, -0.28] })
      .box(0.14, 0.1, 0.03, tint(color, -0.35), { at: [0.13, 0.1, 0.17] });
    face
      .box(0.39, 0.37, 0.34, skin, { at: [0, 0.17, 0] }, 0.055)
      .box(0.35, 0.13, 0.28, HAIR, { at: [-0.025, 0.35, -0.025], rot: [0.12, 0, 0.3] }, 0.025)
      .box(0.09, 0.2, 0.25, HAIR, { at: [-0.17, 0.25, -0.05] }, 0.02)
      .box(0.1, 0.07, 0.11, skin, { at: [0, 0.14, 0.2] }, 0.02);
  } else if (style === 'clay') {
    jacket
      .sphere(0.27, color, { at: [0, 0.04, 0] }, [1.08, 1, 0.76])
      .sphere(0.2, color, { at: [0, 0.19, 0] }, [0.95, 0.65, 0.9])
      .box(0.25, 0.13, 0.04, tint(color, -0.3), { at: [0, -0.015, 0.21] }, 0.035)
      .sphere(0.035, SOLE, { at: [0.06, 0.18, 0.18] });
    face.sphere(0.245, skin, { at: [0, 0.17, 0] }, [1.02, 0.95, 0.83]);
    // Scalloped hair follows the scalp, not an accessory perched above it.
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI;
      face.sphere(0.105, HAIR, {
        at: [Math.cos(a) * 0.19, 0.22 + Math.sin(a) * 0.16, -0.055],
      });
    }
    face.sphere(0.065, skin, { at: [0, 0.14, 0.215] }, [1, 0.85, 0.8]);
  } else {
    jacket
      .box(0.6, 0.15, 0.28, color, { at: [0, 0.2, 0] }, 0.055)
      .cylinder(0.23, 0.13, 0.35, color, { at: [0, 0.055, 0] }, 4)
      .box(0.14, 0.31, 0.04, SOLE, { at: [0, 0.1, 0.18] })
      .box(0.045, 0.22, 0.035, 0xb34536, { at: [0, 0.11, 0.21], rot: [0, 0, -0.12] })
      .box(0.1, 0.06, 0.03, tint(color, -0.4), { at: [0.18, 0.19, 0.16] });
    face
      .sphere(0.215, skin, { at: [0, 0.16, 0] }, [0.86, 1.2, 0.85])
      .box(0.38, 0.15, 0.31, skin, { at: [0, 0.035, 0.015] }, 0.06)
      .sphere(0.16, HAIR, { at: [0.025, 0.37, -0.04] }, [1.35, 0.7, 0.95])
      .sphere(0.13, HAIR, { at: [0.12, 0.43, 0.015] }, [0.9, 0.75, 0.8])
      .sphere(0.055, skin, { at: [0, 0.14, 0.24] }, [0.8, 0.85, 1.65]);
  }
  const eyeX = style === 'cartoon' ? 0.065 : 0.08;
  const faceZ = style === 'angular' ? 0.177 : 0.19;
  for (const sign of [-1, 1]) {
    face
      .sphere(0.036, SOLE, { at: [sign * eyeX, 0.22, faceZ] }, [1, 1.18, 0.4])
      .sphere(0.018, PALETTE.ink, { at: [sign * eyeX, 0.215, faceZ + 0.014] }, [1, 1.2, 0.5])
      .box(0.075, 0.025, 0.025, HAIR, {
        at: [sign * eyeX, 0.28, faceZ],
        rot: [0, 0, sign * (style === 'cartoon' ? 0.3 : 0.1)],
      })
      .sphere(0.045, skin, { at: [sign * (style === 'clay' ? 0.24 : 0.195), 0.13, 0] });
  }
  face.box(0.08, 0.018, 0.025, PALETTE.ink, { at: [0, 0.065, faceZ] });
  torso.add(mesh(jacket));
  head.add(mesh(face));
  const waist = mesh(new ModelBuilder().cylinder(0.13, 0.14, 1, tint(color, -0.18)));
  root.add(waist);
  const makeArm = (sign: number): Arm => {
    const shoulder = new THREE.Object3D();
    shoulder.position.set(sign * shape.shoulder, 0.16, 0);
    torso.add(shoulder);
    const upper = mesh(new ModelBuilder().cylinder(0.085, 0.07, 1, color));
    const lower = mesh(new ModelBuilder().cylinder(0.06, 0.055, 1, skin));
    const elbow = mesh(new ModelBuilder().sphere(0.068, skin));
    const hand = mesh(
      style === 'angular'
        ? new ModelBuilder().box(0.13, 0.12, 0.14, skin, {}, 0.025)
        : new ModelBuilder().sphere(0.075, skin, {}, [1, 0.9, 1.05]),
    );
    root.add(upper, lower, elbow, hand);
    return { upper, lower, elbow, hand, shoulder };
  };
  const makeLeg = (): Leg => {
    const upper = mesh(new ModelBuilder().cylinder(0.085, 0.07, 1, TROUSERS));
    const lower = mesh(new ModelBuilder().cylinder(0.07, 0.06, 1, TROUSERS));
    const shoeBuilder = new ModelBuilder()
      .box(
        style === 'clay' ? 0.21 : 0.18,
        0.1,
        0.3,
        tint(color, -0.6),
        { at: [0, 0.065, 0.055] },
        0.04,
      )
      .box(style === 'clay' ? 0.22 : 0.19, 0.035, 0.31, SOLE, { at: [0, 0.02, 0.055] }, 0.012);
    const shoe = mesh(shoeBuilder);
    root.add(upper, lower, shoe);
    return { upper, lower, shoe };
  };
  const c: StudyCharacter = {
    style,
    root,
    torso,
    head,
    waist,
    arms: [makeArm(-1), makeArm(1)],
    legs: [makeLeg(), makeLeg()],
    geometries,
  };
  return c;
}

/** Endpoints for a sleeve or trouser segment modeled along +y. */
function segment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  const delta = to.clone().sub(from);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, delta.clone().normalize());
  mesh.scale.y = delta.length();
}

/** Rubber-hose study limbs extend for throws, with compact elbows at rest. */
export function studyElbow(
  shoulder: THREE.Vector3,
  hand: THREE.Vector3,
  sign: number,
): THREE.Vector3 {
  const axis = hand.clone().sub(shoulder);
  const distance = axis.length();
  if (distance > MAX_ARM_LENGTH * 2) throw new Error('Study hand target exceeds arm reach');
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

export function poseStudy(c: StudyCharacter, input: PoseInput, timeMs: number): void {
  const shape = SHAPES[c.style];
  const pose = playerPose(input, timeMs);
  const wind = Math.max(0, Math.min(1, input.windUp));
  // The carryPoint arc swings round below the head, so no duck is needed any more.
  const duck = 0;
  const bend = 0;
  const waistHeight = shape.torsoY - 0.36;
  c.torso.position.set(
    -waistHeight * Math.sin(bend),
    0.36 + waistHeight * Math.cos(bend) + pose.bob,
    -0.3 * duck,
  );
  // The shoulders turn with the folder as it swings round for a throw.
  const turn = input.carrying ? carryPoint(wind).yaw * 0.9 : 0;
  c.torso.rotation.set(pose.lean * 0.5, turn, pose.roll * shape.beat + bend, 'XZY');
  c.head.rotation.x = 0.12 + pose.nod * shape.beat;
  c.head.rotation.z = Math.sin(timeMs / 550 + input.phase) * 0.025 * shape.beat;
  c.root.updateMatrixWorld(true);
  const waistTop = c.root.worldToLocal(c.torso.localToWorld(new THREE.Vector3(0, -0.1, 0)));
  segment(c.waist, new THREE.Vector3(0, 0.36 + pose.bob, 0), waistTop);
  c.arms.forEach((arm, i) => {
    const target = i === 0 ? pose.leftHand : pose.rightHand;
    const hand = new THREE.Vector3(target.x, target.y + pose.bob, target.z);
    const shoulder = arm.shoulder.getWorldPosition(new THREE.Vector3());
    c.root.worldToLocal(shoulder);
    const elbow = studyElbow(shoulder, hand, i === 0 ? -1 : 1);
    segment(arm.upper, shoulder, elbow);
    segment(arm.lower, elbow, hand);
    arm.elbow.position.copy(elbow);
    arm.hand.position.copy(hand);
  });
  const walk = Math.min(1, input.speed / Math.max(0.01, input.fullSpeed));
  c.legs.forEach((leg, i) => {
    const sign = i === 0 ? -1 : 1;
    const stride = input.stride + i * Math.PI;
    const swing = Math.sin(stride) * walk;
    const lift = Math.max(0, Math.cos(stride)) * 0.09 * walk;
    const foot = new THREE.Vector3(sign * shape.hip, lift, swing * 0.16 * shape.beat);
    leg.shoe.position.copy(foot);
    const hip = new THREE.Vector3(sign * shape.hip, 0.4 + pose.bob, 0);
    const knee = new THREE.Vector3(sign * shape.hip, 0.23 + lift, swing * 0.08 + 0.025);
    segment(leg.upper, hip, knee);
    segment(leg.lower, knee, foot.clone().add(new THREE.Vector3(0, 0.1, 0)));
  });
}

export function studyTicketTarget(windUp: number): THREE.Vector3 {
  const hold = carryPoint(windUp);
  return new THREE.Vector3(hold.side, hold.height, hold.reach);
}

/** Shared kit materials belong to the preview, not to an individual study. */
export function disposeStudy(c: StudyCharacter): void {
  c.root.removeFromParent();
  for (const geometry of c.geometries) geometry.dispose();
}
