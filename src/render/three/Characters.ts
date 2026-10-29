import * as THREE from 'three';
import type { PlayerId } from '../../sim/state';
import type { RoleId } from '../../sim/roles';
import {
  type DeveloperAppearance,
  type DeveloperRig,
  createDeveloperRig,
  poseDeveloperRig,
} from './DeveloperRig';
import { type KitMaterials, ModelBuilder, tint } from './kit';
import { PALETTE } from './look';
import type { Pose } from './pose';

/**
 * Production developers use the compact angular role rig. The manager
 * and background people retain the original diorama bodies and behavior.
 *
 * Built with the kit (vertex colors, one shared material). Each character
 * is a few meshes moved by a `Pose` every frame.
 */

/**
 * Bodies and heads are modeled small and drawn this much bigger: chunky like
 * Overcooked. Hands aren't scaled, so they stay where a carried ticket is.
 */
export const CHARACTER_SCALE = 1.2;
const MANAGER_SCALE = 1.35;
/** Where the head sits on the body (the neck), in the body's space: on the shoulders. */
const NECK = 0.58;
const HEAD_RADIUS = 0.25;
/** The head leans forward a little, so the face shows to a camera looking down. */
const HEAD_TILT = 0.15;
export const HAND_RADIUS = 0.09;
const SKIN = [0xf2c6a0, 0xc68b59, 0xe8b48a, 0x8d5a3b] as const;
const HAIR = [0x3b2a20, 0x14110f, 0xb5651d, 0x2a1d14] as const;
const DENIM = 0x34425e;
const GLOVE = 0xfdfdf6;

export interface Character {
  rig?: DeveloperRig;
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftHand: THREE.Mesh;
  rightHand: THREE.Mesh;
  /** How much bigger than modeled the body and head draw. */
  scale: number;
  /** Geometries only this character uses, freed with it. */
  geometries: THREE.BufferGeometry[];
}

/** Moves a character's parts into `pose`. */
export function applyPose(c: Character, pose: Pose): void {
  if (c.rig) {
    poseDeveloperRig(c.rig, pose);
    return;
  }
  c.body.position.y = pose.bob;
  c.body.rotation.set(pose.lean, 0, pose.roll);
  const k = c.scale;
  c.body.scale.set(pose.squash.x * k, pose.squash.y * k, pose.squash.x * k);
  // The head keeps its shape when the body squashes.
  c.head.scale.set(1 / pose.squash.x, 1 / pose.squash.y, 1 / pose.squash.x);
  c.head.rotation.x = HEAD_TILT + pose.nod;
  c.leftHand.position.set(pose.leftHand.x, pose.leftHand.y + pose.bob, pose.leftHand.z);
  c.rightHand.position.set(pose.rightHand.x, pose.rightHand.y + pose.bob, pose.rightHand.z);
}

export function createDeveloper(
  id: PlayerId,
  materials: KitMaterials,
  roleId: RoleId = 'generalist',
  appearance?: DeveloperAppearance,
): Character {
  const rig = createDeveloperRig(roleId, id, materials, appearance);
  return {
    rig,
    root: rig.root,
    body: rig.torso,
    head: rig.head,
    leftHand: rig.arms[0].hand,
    rightHand: rig.arms[1].hand,
    scale: 1,
    geometries: rig.geometries,
  };
}

/** Only owned geometries are released; kit materials belong to the scene. */
export function disposeCharacter(c: Character): void {
  c.root.removeFromParent();
  for (const geometry of c.geometries) geometry.dispose();
}

/** Muted, darker hoodie colors for people in the background, so they never look like players. */
const EXTRA_COLORS = [0x5f6a74, 0x7a6e60, 0x56685e, 0x6e6072, 0x7f735c, 0x545f70] as const;
/** People in the background are a little smaller than the players. */
const EXTRA_SCALE = 0.85 * CHARACTER_SCALE;

/**
 * Someone in the background (`seed` picks their look): no hat, a muted
 * hoodie, so the players stay the only ones that stand out.
 */
export function createExtra(seed: number, materials: KitMaterials): Character {
  const n = Math.abs(Math.floor(seed));
  const skin = SKIN[(n >> 2) % SKIN.length] ?? PALETTE.skin;
  // Bare hands, not the players' white gloves.
  return createPerson(
    {
      color: EXTRA_COLORS[n % EXTRA_COLORS.length] ?? EXTRA_COLORS[0],
      skin,
      hair: HAIR[(n >> 4) % HAIR.length] ?? HAIR[0],
      hands: skin,
      scale: EXTRA_SCALE,
    },
    materials,
  );
}

interface PersonLook {
  color: number;
  skin: number;
  hair: number;
  hands: number;
  scale: number;
}

function createPerson(look: PersonLook, materials: KitMaterials): Character {
  const { color, skin, hair } = look;

  // The body: tapered jeans at the bottom, a round hoodie with a pocket and strings.
  const torso = new ModelBuilder()
    .cylinder(0.21, 0.17, 0.2, DENIM, { at: [0, 0.12, 0] }, 20)
    .sphere(0.17, DENIM, { at: [0, 0.08, 0] }, [1.05, 0.5, 1.05])
    .capsule(0.22, 0.16, color, { at: [0, 0.38, 0] })
    .box(0.24, 0.1, 0.05, tint(color, -0.15), { at: [0, 0.3, 0.2] }, 0.02)
    .torus(0.15, 0.05, tint(color, -0.1), {
      at: [0, NECK - 0.03, -0.02],
      rot: [Math.PI / 2, 0, 0],
    })
    .cylinder(0.009, 0.009, 0.12, GLOVE, { at: [-0.05, 0.47, 0.21] }, 6)
    .cylinder(0.009, 0.009, 0.12, GLOVE, { at: [0.05, 0.47, 0.21] }, 6)
    .build().body;

  const r = HEAD_RADIUS;
  const head = new ModelBuilder()
    .sphere(r, skin, { at: [0, r * 0.9, 0] }, [1, 0.95, 1])
    // Hair over the back and top, its front edge high, so the face shows.
    .sphere(r * 1.04, hair, { at: [0, r * 1.12, -0.05] }, [1, 0.8, 0.95])
    .box(0.3, 0.06, 0.1, hair, { at: [0, r * 1.62, 0.13], rot: [0.6, 0, 0] }, 0.03)
    // Big eyes, rosy cheeks and ears.
    .sphere(0.04, PALETTE.ink, { at: [-0.085, r * 1.05, r * 0.9] }, [0.85, 1.2, 0.6])
    .sphere(0.04, PALETTE.ink, { at: [0.085, r * 1.05, r * 0.9] }, [0.85, 1.2, 0.6])
    .sphere(0.012, 0xffffff, { at: [-0.075, r * 1.12, r * 0.98] })
    .sphere(0.012, 0xffffff, { at: [0.095, r * 1.12, r * 0.98] })
    .sphere(0.035, 0xf0908a, { at: [-0.15, r * 0.78, r * 0.75] }, [1, 0.6, 0.5])
    .sphere(0.035, 0xf0908a, { at: [0.15, r * 0.78, r * 0.75] }, [1, 0.6, 0.5])
    .sphere(0.05, tint(skin, -0.1), { at: [-r, r * 0.85, 0] }, [0.5, 1, 0.8])
    .sphere(0.05, tint(skin, -0.1), { at: [r, r * 0.85, 0] }, [0.5, 1, 0.8]);
  const headGeometry = head.build().body;

  const handGeometry = glove(look.hands);
  return assemble(torso, headGeometry, handGeometry, materials, look.scale);
}

/** A round glove. */
function glove(color: number): THREE.BufferGeometry {
  return new ModelBuilder().sphere(HAND_RADIUS, color, {}, [1, 0.9, 1.1]).build().body;
}

/** The manager: bigger, square-shouldered in a blue-grey suit, clipboard and coffee in hand. */
export function createManager(materials: KitMaterials): Character {
  const suit = 0x4a5266;
  const torso = new ModelBuilder()
    .cylinder(0.24, 0.2, 0.22, tint(suit, -0.25), { at: [0, 0.12, 0] }, 20)
    // A boxy jacket with shoulder pads.
    .box(0.56, 0.38, 0.38, suit, { at: [0, 0.4, 0] }, 0.08)
    .box(0.6, 0.1, 0.36, suit, { at: [0, 0.56, 0] }, 0.05)
    // A thin white collar all round, low on the neck (shows from behind), shirt, tie and lapels in front.
    .torus(0.15, 0.025, PALETTE.white, { at: [0, NECK - 0.05, -0.01], rot: [Math.PI / 2, 0, 0] })
    .cone(0.1, 0.22, PALETTE.white, { at: [0, NECK - 0.09, 0.19], rot: [Math.PI, 0, 0] }, 3)
    .box(0.055, 0.24, 0.03, 0xd2322d, { at: [0, NECK - 0.18, 0.205] }, 0)
    .box(0.08, 0.05, 0.035, 0xd2322d, { at: [0, NECK - 0.05, 0.2] }, 0)
    .box(0.04, 0.05, 0.02, 0xffd166, { at: [0.18, 0.5, 0.195] }, 0)
    .build().body;
  const skin = PALETTE.skin;
  const r = HEAD_RADIUS * 0.92;
  const lift = 0.06;
  const head = new ModelBuilder()
    .sphere(r, skin, { at: [0, r * 0.9 + lift, 0] }, [1, 0.95, 1])
    // Slicked-back grey hair, glasses and a stern brow.
    .sphere(r * 1.04, 0x9aa0aa, { at: [0, r * 1.12 + lift, -0.05] }, [1, 0.75, 0.95])
    .torus(0.045, 0.018, PALETTE.ink, { at: [-0.075, r + lift, r * 0.92] })
    .torus(0.045, 0.018, PALETTE.ink, { at: [0.075, r + lift, r * 0.92] })
    .sphere(0.022, PALETTE.ink, { at: [-0.075, r + lift, r * 0.9] })
    .sphere(0.022, PALETTE.ink, { at: [0.075, r + lift, r * 0.9] })
    .box(
      0.08,
      0.018,
      0.02,
      PALETTE.ink,
      {
        at: [-0.075, r * 1.32 + lift, r * 0.85],
        rot: [0, 0, -0.25],
      },
      0,
    )
    .box(
      0.08,
      0.018,
      0.02,
      PALETTE.ink,
      {
        at: [0.075, r * 1.32 + lift, r * 0.85],
        rot: [0, 0, 0.25],
      },
      0,
    )
    .build().body;
  const c = assemble(torso, head, glove(skin), materials, MANAGER_SCALE);
  // Coffee in the right hand, a clipboard in the left.
  const mug = new ModelBuilder()
    .cylinder(0.06, 0.055, 0.13, PALETTE.white, { at: [0, 0.07, 0.03] })
    .torus(0.04, 0.013, PALETTE.white, { at: [0.065, 0.07, 0.03], rot: [0, 0, Math.PI / 2] })
    .cylinder(0.052, 0.052, 0.004, 0x5a3a22, { at: [0, 0.135, 0.03] })
    .build().body;
  const clipboard = new ModelBuilder()
    // Held flat-ish, face up toward the camera.
    .box(0.2, 0.02, 0.28, 0x8c5f3d, { at: [0, 0.02, 0.1], rot: [0.5, 0, 0] }, 0)
    .box(0.17, 0.01, 0.22, PALETTE.white, { at: [0, 0.035, 0.1], rot: [0.5, 0, 0] }, 0)
    .box(0.08, 0.03, 0.03, 0xb8bec8, { at: [0, 0.1, -0.02], rot: [0.5, 0, 0] }, 0)
    .build().body;
  for (const [geometry, hand] of [
    [mug, c.rightHand],
    [clipboard, c.leftHand],
  ] as const) {
    const mesh = new THREE.Mesh(geometry, materials.body);
    mesh.castShadow = true;
    hand.add(mesh);
    c.geometries.push(geometry);
  }
  return c;
}

function assemble(
  torso: THREE.BufferGeometry,
  headGeometry: THREE.BufferGeometry,
  handGeometry: THREE.BufferGeometry,
  materials: KitMaterials,
  scale: number,
): Character {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const torsoMesh = new THREE.Mesh(torso, materials.body);
  const head = new THREE.Group();
  head.position.y = NECK;
  const headMesh = new THREE.Mesh(headGeometry, materials.body);
  head.add(headMesh);
  body.add(torsoMesh, head);
  const leftHand = new THREE.Mesh(handGeometry, materials.body);
  const rightHand = new THREE.Mesh(handGeometry, materials.body);
  root.add(body, leftHand, rightHand);
  for (const mesh of [torsoMesh, headMesh, leftHand, rightHand]) mesh.castShadow = true;
  return {
    root,
    body,
    head,
    leftHand,
    rightHand,
    scale,
    geometries: [torso, headGeometry, handGeometry],
  };
}
