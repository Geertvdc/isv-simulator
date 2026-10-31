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
import { carryPoint, windUpCurve } from './layout';
import { PALETTE } from './look';
import { COLOR } from './palette';
import type { Pose } from './pose';
import { bakeCreases } from './sculpt';

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
const NECK_Y = 0.325;
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
  /** The hand's two shapes: hanging relaxed, or clamped round a carried folder's edge. */
  open: THREE.BufferGeometry;
  grip: THREE.BufferGeometry;
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
  /** The head's two faces: the role's own, and a shocked one while stumbling. */
  face: { mesh: THREE.Mesh; calm: THREE.BufferGeometry; shocked: THREE.BufferGeometry };
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
    if (!geometries.includes(geometry)) {
      geometries.push(geometry);
      bakeCreases(geometry);
    }
    const made = new THREE.Mesh(geometry, materials.character);
    made.castShadow = made.receiveShadow = true;
    return made;
  };
  root.add(torso);
  torso.add(head);
  head.position.y = NECK_Y;
  torso.add(mesh(outfit.torso));
  const calm = buildHead(roleId, { skin, hair, hairstyle }, color);
  const face = {
    mesh: mesh(calm),
    calm,
    shocked: buildHead(roleId, { skin, hair, hairstyle }, color, true),
  };
  geometries.push(face.shocked);
  bakeCreases(face.shocked);
  head.add(face.mesh);

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
    const open = handGeometry(outfit.arm, sign);
    const grip = handGeometry(outfit.arm, sign, true);
    geometries.push(grip);
    bakeCreases(grip);
    const arm = {
      upper: mesh(upper),
      lower: mesh(lowerGeometry),
      elbow: mesh(joint),
      hand: mesh(open),
      open,
      grip,
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
    face,
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

/** Upper arm and forearm length: arms only stretch past this when a hold needs it. */
const ARM = 0.235;
/** Thigh and shin: the knees bend whenever the hips are nearer the feet than this. */
const THIGH = 0.175;
const SHIN = 0.16;

/** Something perpendicular to `axis`, leaning toward `pole` (or straight down if they line up). */
function across(axis: THREE.Vector3, pole: THREE.Vector3): THREE.Vector3 {
  const out = pole.clone().addScaledVector(axis, -pole.dot(axis));
  if (out.lengthSq() < 1e-6) out.set(0, -1, 0).addScaledVector(axis, -axis.y);
  if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
  return out.normalize();
}

/** The elbow between `shoulder` and `hand`, bending toward `pole`; arms stretch rather than miss a hold. */
function elbowAt(
  shoulder: THREE.Vector3,
  hand: THREE.Vector3,
  pole: THREE.Vector3,
  slack = 0,
): THREE.Vector3 {
  const axis = hand.clone().sub(shoulder);
  const distance = axis.length();
  if (distance > 1.12) throw new Error('Developer hand target exceeds arm reach');
  axis.normalize();
  // `slack` stretches a reaching arm a touch more so its elbow still cocks (cartoon reach).
  const length = Math.max(ARM, distance / 2 + 0.008, distance * (0.5 + slack));
  return shoulder
    .clone()
    .add(hand)
    .multiplyScalar(0.5)
    .addScaledVector(across(axis, pole), Math.sqrt(length ** 2 - (distance / 2) ** 2));
}

/** The knee between `hip` and `ankle` (two-bone, bending toward `pole`; straight when stretched). */
function kneeAt(hip: THREE.Vector3, ankle: THREE.Vector3, pole: THREE.Vector3): THREE.Vector3 {
  const axis = ankle.clone().sub(hip);
  const d = axis.length();
  axis.normalize();
  if (d >= THIGH + SHIN - 1e-4)
    return hip.clone().addScaledVector(axis, (d * THIGH) / (THIGH + SHIN));
  const along = (THIGH ** 2 - SHIN ** 2 + d ** 2) / (2 * d);
  const out = Math.sqrt(Math.max(0, THIGH ** 2 - along ** 2));
  return hip.clone().addScaledVector(axis, along).addScaledVector(across(axis, pole), out);
}

/** Turns a hand: fingers along `along`, palm toward `palm`. */
function orientHand(hand: THREE.Mesh, along: THREE.Vector3, palm: THREE.Vector3): void {
  const y = along.clone().normalize();
  const z = palm.clone().addScaledVector(y, -palm.dot(y));
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function clampSwing(a: number): number {
  return Math.max(-SWING_LIMIT, Math.min(SWING_LIMIT, a));
}

function blend(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  return t <= 0 ? a : a.lerp(b, Math.min(1, t));
}

/**
 * Poses a developer from the shared `pose`. Developers read the same targets
 * as everyone (exact carry grips, typing taps), but move their whole body:
 * a real stride with knees, counter-swinging arms, a wind-up that turns the
 * shoulders away from the throw, a sprinting dash and a two-handed shove.
 */
export function poseDeveloperRig(c: DeveloperRig, pose: Pose): void {
  // Loads fast, so the turn and lean read from the first frames of a wind-up.
  const wind = pose.carrying ? windUpCurve(pose.windUp) : 0;
  const walk = pose.walk;
  const s = pose.stride;
  const dash = pose.dash;
  const carrying = pose.carrying;
  const typing = carrying ? 0 : Math.min(1, Math.max(0, pose.nod / 0.25));
  const thrust = carrying ? 0 : pose.thrust;
  const stumble = pose.stumble;
  const release = carrying ? 0 : pose.release;
  const turn = carrying ? carryPoint(pose.windUp).yaw : 0;

  // The body: highest as the legs pass, lowest at heel strike; sunk into bent knees for effort.
  const run = Math.max(walk, dash);
  const stepBob = run * (0.03 * Math.abs(Math.cos(s)) - 0.022) * (1 + dash * 0.4);
  // Hands full: stay upright and tall so the chest and hair never run into the folder.
  const hold = carrying ? 0.1 : 1;
  const crouch = 0.06 * wind + 0.03 * dash * hold + 0.035 * thrust + 0.02 * stumble;
  const lift = stepBob - crouch;
  const forward = (0.03 * dash + 0.05 * thrust) * hold - 0.07 * stumble + 0.04 * release;
  const tilt =
    0.1 * walk * (1 - dash) * hold +
    0.18 * typing +
    0.5 * dash * hold +
    0.26 * thrust +
    0.3 * release -
    0.3 * stumble -
    0.28 * wind;
  // A wind-up also leans away from the folder, loading the back leg.
  const roll = pose.roll * 0.7 * (1 - 0.85 * wind) + 0.14 * wind;
  // Shoulders counter the hips on a walk; a wind-up turns them most of the way round.
  // A throw's follow-through unwinds them past square, the other way.
  const twist = -Math.sin(s) * 0.12 * walk * (1 - dash * 0.5) * hold + turn * 0.95 - 0.45 * release;
  const pelvisYaw = Math.sin(s) * 0.07 * walk + turn * 0.4 - 0.2 * release;
  const pelvis = new THREE.Quaternion().setFromAxisAngle(UP, pelvisYaw);

  const hips = new THREE.Vector3(0, 0.4 + lift, forward);
  c.torso.rotation.set(tilt, twist, roll, 'XZY');
  c.torso.position
    .copy(hips)
    .add(new THREE.Vector3(0, 0.15, 0).applyQuaternion(c.torso.quaternion));
  const squash = dash > 0 ? { x: 1, y: 1 } : pose.squash;
  c.torso.scale.set(squash.x, squash.y, squash.x);
  // The head stays level and keeps looking where they are going (or at the throw's target).
  const look = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      0.1 + pose.nod * c.nod + tilt * 0.25 - 0.32 * stumble,
      twist * 0.15,
      roll * 0.4 + 0.22 * stumble,
      'YXZ',
    ),
  );
  c.head.quaternion.copy(c.torso.quaternion).invert().multiply(look);
  c.head.scale.set(1 / squash.x, 1 / squash.y, 1 / squash.x);
  c.face.mesh.geometry = stumble > 0.25 ? c.face.shocked : c.face.calm;

  // Hanging pieces stay roughly plumb, bounce with the walk, stream back on a dash and never swing into the body.
  const bounce = run * (0.5 + 0.5 * Math.sin(s * 2));
  for (const sw of c.swings) {
    if (sw.hang === 'front') {
      sw.mesh.rotation.set(
        clampSwing(Math.min(0, -tilt * (1 - 0.7 * dash) - bounce * sw.amp)),
        0,
        clampSwing(-roll),
      );
    } else if (sw.hang === 'back') {
      sw.mesh.rotation.set(
        clampSwing(Math.max(0, -tilt + bounce * sw.amp + 0.6 * dash)),
        0,
        clampSwing(-roll),
      );
    } else {
      const sway = -roll + bounce * sw.amp * 0.5;
      sw.mesh.rotation.set(
        clampSwing(-tilt + Math.sin(s) * walk * sw.amp + 0.5 * dash),
        0,
        clampSwing(sw.side > 0 ? Math.max(0, sway) : Math.min(0, sway)),
      );
    }
  }

  c.root.updateMatrixWorld(true);
  const base = new THREE.Vector3(0, 0.36 + lift, forward);
  const waistTop = c.root.worldToLocal(c.torso.localToWorld(new THREE.Vector3(0, -0.1, 0)));
  c.waist.position.copy(base);
  c.waist.quaternion.setFromUnitVectors(UP, waistTop.sub(base).normalize());
  c.waist.scale.set(1, 1, 1);

  const chest = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));
  c.arms.forEach((arm, i) => {
    const sign = i === 0 ? -1 : 1;
    const shoulder = c.root.worldToLocal(arm.shoulder.getWorldPosition(new THREE.Vector3()));
    const target = i === 0 ? pose.leftHand : pose.rightHand;
    let hand: THREE.Vector3;
    let pole: THREE.Vector3;
    let palm: THREE.Vector3;
    let fingersUp = 0;
    let slack = 0;
    if (carrying) {
      // Clamped round the ticket's short side, elbows out and down, palms in.
      hand = new THREE.Vector3(target.x, target.y + pose.bob, target.z);
      pole = new THREE.Vector3(sign * 0.9, -1, -0.25).applyQuaternion(
        new THREE.Quaternion().setFromAxisAngle(UP, turn),
      );
      palm = new THREE.Vector3(-sign * chest.z, 0, sign * chest.x);
      // Cocked: elbows bent and dropped under the folder, not aimed out like a rifle.
      slack = 0.09 * wind;
      pole.y -= 0.8 * wind;
    } else {
      // Hanging relaxed just ahead of the thighs, swinging against the legs.
      const swing = Math.sin(s) * walk * -sign;
      hand = new THREE.Vector3(
        sign * (0.34 - 0.02 * walk),
        0.37 + lift + Math.abs(Math.sin(s)) * 0.05 * walk,
        0.08 + swing * 0.2 + forward,
      );
      pole = new THREE.Vector3(sign * 0.35, -0.3, -1);
      palm = new THREE.Vector3(-sign, 0, 0.25);
      // Sprinting: arms swept back, still pumping a little.
      blend(hand, new THREE.Vector3(sign * 0.3, 0.6 + lift, -0.36 + forward + swing * 0.08), dash);
      if (dash > 0) pole.lerp(new THREE.Vector3(sign * 0.4, 0.4, -0.6), dash);
      // Typing: upper arms by the ribs, forearms out to the keys, palms down.
      if (typing > 0) {
        blend(hand, new THREE.Vector3(sign * 0.15, target.y + pose.bob, 0.39), typing);
        pole.lerp(new THREE.Vector3(sign * 0.35, -1, -0.35), typing);
        palm.lerp(new THREE.Vector3(0, -1, 0.05), typing);
      }
      // Shoving: both arms punched out, palms forward.
      if (thrust > 0) {
        blend(hand, new THREE.Vector3(sign * 0.19, 0.74 + lift, 0.52 + forward), thrust);
        pole.lerp(new THREE.Vector3(sign * 0.7, -1, 0), thrust);
        palm.lerp(new THREE.Vector3(0, 0, 1), thrust);
        fingersUp = thrust * 0.85;
      }
      // Just let go of a throw: both arms flung out after it, across the body.
      if (release > 0) {
        blend(hand, new THREE.Vector3(sign * 0.13 - 0.08, 0.68 + lift, 0.5 + forward), release);
        pole.lerp(new THREE.Vector3(sign * 0.6, -1, 0), release);
        palm.lerp(new THREE.Vector3(0, -0.6, 1), release);
      }
      // Knocked flying: arms flung wide and up, fingers splayed, windmilling for balance.
      if (stumble > 0) {
        blend(
          hand,
          new THREE.Vector3(sign * 0.56, 0.98 + lift + sign * pose.roll * 0.2, -0.02 + forward),
          stumble,
        );
        pole.lerp(new THREE.Vector3(sign, -0.9, -0.3), stumble);
        palm.lerp(new THREE.Vector3(0, 0.2, 1), stumble);
        fingersUp = Math.max(fingersUp, 0.5 * stumble);
      }
    }
    const elbow = elbowAt(shoulder, hand, pole, slack);
    segment(arm.upper, shoulder, elbow);
    segment(arm.lower, elbow, hand);
    arm.elbow.position.copy(elbow);
    arm.elbow.quaternion.copy(arm.upper.quaternion);
    arm.hand.position.copy(hand);
    arm.hand.geometry = carrying ? arm.grip : arm.open;
    const along = hand.clone().sub(elbow).normalize();
    if (fingersUp > 0) along.lerp(new THREE.Vector3(0, 1, 0.25).normalize(), fingersUp);
    orientHand(arm.hand, along, palm);
  });

  c.legs.forEach((leg, i) => {
    const sign = i === 0 ? -1 : 1;
    const stride = s + i * Math.PI;
    const swing = Math.sin(stride) * run;
    const raise = Math.max(0, Math.cos(stride)) * (0.1 + 0.05 * dash) * run;
    // Heel strike in front; toe-off behind (heel high on a sprint).
    let pitch = swing > 0 ? -0.3 * swing : -(0.3 + 0.5 * dash) * swing;
    let x = sign * 0.13;
    let z = swing * (0.22 + 0.06 * dash) - 0.06 * dash + forward;
    // Wind-up: lead foot forward, back foot planted behind and out, its knee taking the weight.
    x += sign * 0.05 * wind;
    z += -sign * (sign > 0 ? 0.17 : 0.13) * wind;
    // Shove: lead (left) foot steps in, back foot pushes off on its toes.
    const push = Math.max(thrust, release);
    z += (sign < 0 ? 0.2 : -0.2) * push;
    if (sign > 0) pitch += 0.45 * push;
    // Stumble: hopping back, one foot reaching back on its toes to catch the fall, the other kicked up.
    z += (sign > 0 ? -0.18 : 0.06) * stumble;
    pitch += (sign > 0 ? 0.3 : -0.25) * stumble;
    const hop = sign < 0 ? 0.07 * stumble : 0;
    const foot = new THREE.Vector3(x, raise + hop + soleRise(leg.hull, pitch) + 1e-5, z);
    leg.shoe.position.copy(foot);
    leg.shoe.rotation.set(pitch, sign * 0.12 * wind, 0, 'YXZ');
    const hip = hips.clone().add(new THREE.Vector3(sign * 0.1, 0, 0).applyQuaternion(pelvis));
    const ankle = foot.clone().add(new THREE.Vector3(0, 0.1, 0.1 * Math.sin(pitch)));
    const knee = kneeAt(hip, ankle, new THREE.Vector3(sign * 0.15, 0, 1).applyQuaternion(pelvis));
    segment(leg.upper, hip, knee);
    leg.knee.position.copy(knee);
    segment(leg.lower, knee, ankle);
  });
}
