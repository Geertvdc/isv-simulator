import * as THREE from 'three';
import { isRoleId, type RoleId } from '../../sim/roles';
import type { PlayerId } from '../../sim/state';
import { playerColor } from '../playerColors';
import { DEVELOPER_HAIRSTYLES, type DeveloperHairstyle, buildHead } from './developerHead';
import {
  elbow as elbowGeometry,
  hand as handGeometry,
  knee as kneeGeometry,
  lowerArm,
  pelvis,
  shin,
  shoe as shoeGeometry,
  soleHull,
  soleRise,
  thigh,
  upperArm,
} from './developerLimbs';
import { type SwingPart, buildOutfit } from './developerOutfit';
import type { KitMaterials } from './kit';
import { PALETTE } from './look';
import { COLOR } from './palette';
import type { Pose } from './pose';

export { DEVELOPER_HAIRSTYLES, type DeveloperHairstyle };

/**
 * The production crew: chunky sculpted developers (big heads, big hands, big
 * shoes) in their role's kit, cut in the owner's color. Shared targets and
 * cadence; each role differs in silhouette, garments and gear.
 */
export const DEVELOPER_TOP = 1.54;
const UP = new THREE.Vector3(0, 1, 0);
const SKINS = [COLOR.skinLight, COLOR.skinDeep, COLOR.skinTan, COLOR.skinWarm] as const;
const HAIRS = [COLOR.hairDark, 0x171c23, 0x885030, 0x493834] as const;
/** The neck on the torso. */
const NECK_Y = 0.31;
/** Torso swing pieces never rock further than this. */
const SWING_LIMIT = 0.9;

/** Cosmetics belong to the person, never to their profession. */
export interface DeveloperAppearance {
  skin: number;
  hair: number;
  hairstyle?: DeveloperHairstyle;
}

export function developerAppearance(id: PlayerId): Required<DeveloperAppearance> {
  return {
    skin: SKINS[(id - 1) % SKINS.length] ?? PALETTE.skin,
    hair: HAIRS[(id - 1) % HAIRS.length] ?? HAIRS[0],
    hairstyle: DEVELOPER_HAIRSTYLES[(id - 1) % DEVELOPER_HAIRSTYLES.length] ?? 'swept',
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
  knee: THREE.Mesh;
  lower: THREE.Mesh;
  shoe: THREE.Mesh;
  /** The shoe's lower side-view hull, `[y, z]`, to keep it on the floor when it rocks. */
  hull: [number, number][];
}
interface Swing {
  mesh: THREE.Mesh;
  hang: SwingPart['hang'];
  amp: number;
  /** −1 on the right of the body, +1 on the left. */
  side: number;
}
export interface DeveloperRig {
  roleId: RoleId;
  hairstyle: DeveloperHairstyle;
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  waist: THREE.Mesh;
  arms: [Arm, Arm];
  legs: [Leg, Leg];
  /** Badges, scarf tails, tools: pieces hanging from the torso that swing as they move. */
  swings: Swing[];
  /** How hard this role nods into the work. */
  nod: number;
  geometries: THREE.BufferGeometry[];
}

export function createDeveloperRig(
  roleId: RoleId,
  id: PlayerId,
  materials: KitMaterials,
  appearance: DeveloperAppearance = developerAppearance(id),
): DeveloperRig {
  if (!isRoleId(roleId)) throw new Error(`Unknown developer role: ${String(roleId)}`);
  const color = playerColor(id);
  const { skin, hair } = appearance;
  const hairstyle = appearance.hairstyle ?? developerAppearance(id).hairstyle;
  const outfit = buildOutfit(roleId, color, skin);
  const root = new THREE.Group();
  root.name = `developer-${roleId}`;
  const torso = new THREE.Group();
  const head = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const mesh = (geometry: THREE.BufferGeometry): THREE.Mesh => {
    if (!geometries.includes(geometry)) geometries.push(geometry);
    const made = new THREE.Mesh(geometry, materials.character);
    made.castShadow = made.receiveShadow = true;
    return made;
  };
  root.add(torso);
  torso.add(head);
  head.position.y = NECK_Y;
  torso.add(mesh(outfit.torso));
  head.add(mesh(buildHead(roleId, { skin, hair, hairstyle }, color)));

  const swings = outfit.swings.map((part): Swing => {
    const made = mesh(part.geometry);
    made.position.set(...part.pivot);
    torso.add(made);
    return { mesh: made, hang: part.hang, amp: part.amp, side: Math.sign(part.pivot[0]) || 1 };
  });

  const waist = mesh(pelvis(outfit.leg));
  root.add(waist);
  const upper = upperArm(outfit.arm);
  const joint = elbowGeometry(outfit.arm);
  const lowerGeometry = lowerArm(outfit.arm);
  const makeArm = (sign: number): Arm => {
    const shoulder = new THREE.Object3D();
    shoulder.position.set(sign * outfit.shoulder, 0.16, 0);
    torso.add(shoulder);
    const arm = {
      upper: mesh(upper),
      lower: mesh(lowerGeometry),
      elbow: mesh(joint),
      hand: mesh(handGeometry(outfit.arm, sign)),
      shoulder,
    };
    root.add(arm.upper, arm.lower, arm.elbow, arm.hand);
    return arm;
  };
  const kneeShape = kneeGeometry(outfit.leg);
  const shinShape = shin(outfit.leg);
  const makeLeg = (sign: number): Leg => {
    const shoeShape = shoeGeometry(outfit.leg, roleId, sign);
    const leg = {
      upper: mesh(thigh(outfit.leg, sign)),
      knee: mesh(kneeShape),
      lower: mesh(shinShape),
      shoe: mesh(shoeShape),
      hull: soleHull(shoeShape),
    };
    root.add(leg.upper, leg.knee, leg.lower, leg.shoe);
    return leg;
  };
  return {
    roleId,
    hairstyle,
    root,
    torso,
    head,
    waist,
    arms: [makeArm(-1), makeArm(1)],
    legs: [makeLeg(-1), makeLeg(1)],
    swings,
    nod: outfit.nod,
    geometries,
  };
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

/** Turns a hand along its forearm with the palm toward `palm` (inward, or down to type). */
function orientHand(hand: THREE.Mesh, elbow: THREE.Vector3, palm: THREE.Vector3): void {
  const y = hand.position.clone().sub(elbow).normalize();
  const z = palm.clone().addScaledVector(y, -palm.dot(y));
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function clampSwing(a: number): number {
  return Math.max(-SWING_LIMIT, Math.min(SWING_LIMIT, a));
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
  const tilt = pose.lean * 0.5 + wind * 0.5;
  const twist = Math.sin(pose.stride) * 0.07 * pose.walk * (1 - wind);
  c.torso.rotation.set(tilt, twist, pose.roll + bend);
  c.torso.scale.set(pose.squash.x, pose.squash.y, pose.squash.x);
  // Walk sway and stumbles roll the body about the hem, so the hem never sweeps into the legs.
  const pivot = new THREE.Vector3(0, -0.2, 0).multiply(c.torso.scale);
  const unrolled = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, twist, bend));
  c.torso.position
    .add(pivot.clone().applyQuaternion(unrolled))
    .sub(pivot.applyQuaternion(c.torso.quaternion));
  c.head.scale.set(1 / pose.squash.x, 1 / pose.squash.y, 1 / pose.squash.x);
  c.head.rotation.set(0.12 + pose.nod * c.nod, -twist * 0.8, 0);

  // Hanging pieces stay roughly plumb, bounce with the walk and never swing into the body.
  const roll = pose.roll + bend;
  const bounce = pose.walk * (0.5 + 0.5 * Math.sin(pose.stride * 2));
  for (const s of c.swings) {
    if (s.hang === 'front') {
      s.mesh.rotation.set(clampSwing(Math.min(0, -tilt - bounce * s.amp)), 0, clampSwing(-roll));
    } else if (s.hang === 'back') {
      s.mesh.rotation.set(clampSwing(Math.max(0, -tilt + bounce * s.amp)), 0, clampSwing(-roll));
    } else {
      const sway = -roll + bounce * s.amp * 0.5;
      s.mesh.rotation.set(
        clampSwing(-tilt + Math.sin(pose.stride) * pose.walk * s.amp),
        0,
        clampSwing(s.side > 0 ? Math.max(0, sway) : Math.min(0, sway)),
      );
    }
  }

  c.root.updateMatrixWorld(true);
  const base = new THREE.Vector3(0, 0.36 + pose.bob, 0);
  const waistTop = c.root.worldToLocal(c.torso.localToWorld(new THREE.Vector3(0, -0.1, 0)));
  c.waist.position.copy(base);
  c.waist.quaternion.setFromUnitVectors(UP, waistTop.sub(base).normalize());
  c.waist.scale.set(pose.squash.x, 1, pose.squash.x);

  const typing = Math.min(1, Math.max(0, pose.nod / 0.25));
  c.arms.forEach((arm, i) => {
    const sign = i === 0 ? -1 : 1;
    const target = i === 0 ? pose.leftHand : pose.rightHand;
    const hand = new THREE.Vector3(target.x, target.y + pose.bob, target.z);
    const shoulder = c.root.worldToLocal(arm.shoulder.getWorldPosition(new THREE.Vector3()));
    const elbow = elbowAt(shoulder, hand, sign);
    segment(arm.upper, shoulder, elbow);
    segment(arm.lower, elbow, hand);
    arm.elbow.position.copy(elbow);
    arm.elbow.quaternion.copy(arm.upper.quaternion);
    arm.hand.position.copy(hand);
    const palm = new THREE.Vector3(-sign * (1 - typing), -typing, 0.15 * (1 - typing));
    orientHand(arm.hand, elbow, palm);
  });
  c.legs.forEach((leg, i) => {
    const sign = i === 0 ? -1 : 1;
    const stride = pose.stride + i * Math.PI;
    const swing = Math.sin(stride) * pose.walk;
    const lift = Math.max(0, Math.cos(stride)) * 0.09 * pose.walk;
    // Heel strike in front, toe-off behind.
    const pitch = -0.28 * swing;
    const foot = new THREE.Vector3(
      sign * 0.13,
      lift + soleRise(leg.hull, pitch) + 1e-5,
      swing * 0.16,
    );
    leg.shoe.position.copy(foot);
    leg.shoe.rotation.set(pitch, 0, 0);
    const hip = new THREE.Vector3(sign * 0.1, 0.4 + pose.bob, 0);
    const knee = new THREE.Vector3(sign * 0.13, 0.23 + lift, swing * 0.08 + 0.025);
    const ankle = foot.clone().add(new THREE.Vector3(0, 0.1, 0.1 * Math.sin(pitch)));
    segment(leg.upper, hip, knee);
    leg.knee.position.copy(knee);
    segment(leg.lower, knee, ankle);
  });
}
