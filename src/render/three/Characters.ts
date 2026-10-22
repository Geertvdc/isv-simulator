import * as THREE from 'three';
import type { PlayerId } from '../../sim/state';
import { type PlayerShape, playerColor, playerShape } from '../playerColors';
import { type KitMaterials, ModelBuilder, tint } from './kit';
import { PALETTE } from './look';
import type { Pose } from './pose';

/**
 * The people in the office, Overcooked style: a bean body, a big head and
 * two floating hands, no legs. Developers wear a hoodie in their player
 * color and their player's hat shape (in white, like 2D), so they tell
 * apart by color and by shape. The manager wears a suit and carries coffee.
 *
 * Built with the kit (vertex colors, one shared material). Each character
 * is a few meshes moved by a `Pose` every frame.
 */

/**
 * Bodies and heads are modeled small and drawn this much bigger: chunky like
 * Overcooked. Hands aren't scaled, so they stay where a carried ticket is.
 */
export const CHARACTER_SCALE = 1.2;
/** Where the head sits on the body (the neck), in the body's space. */
const NECK = 0.62;
const HEAD_RADIUS = 0.2;
const HAND_RADIUS = 0.075;
const SKIN = [0xf2c6a0, 0xc68b59, 0xe8b48a, 0x8d5a3b] as const;
const HAIR = [0x3b2a20, 0x14110f, 0xb5651d, 0x2a1d14] as const;
const DENIM = 0x34425e;
const GLOVE = 0xfdfdf6;

export interface Character {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftHand: THREE.Mesh;
  rightHand: THREE.Mesh;
  /** Geometries only this character uses, freed with it. */
  geometries: THREE.BufferGeometry[];
}

/** Moves a character's parts into `pose`. */
export function applyPose(c: Character, pose: Pose): void {
  c.body.position.y = pose.bob;
  c.body.rotation.set(pose.lean, 0, pose.roll);
  const k = CHARACTER_SCALE;
  c.body.scale.set(pose.squash.x * k, pose.squash.y * k, pose.squash.x * k);
  c.head.rotation.x = pose.nod;
  c.leftHand.position.set(pose.leftHand.x, pose.leftHand.y + pose.bob, pose.leftHand.z);
  c.rightHand.position.set(pose.rightHand.x, pose.rightHand.y + pose.bob, pose.rightHand.z);
}

/** A developer for player `id`. */
export function createDeveloper(id: PlayerId, materials: KitMaterials): Character {
  const color = playerColor(id);
  const i = (id - 1) % SKIN.length;
  const skin = SKIN[i] ?? PALETTE.skin;
  const hair = HAIR[i] ?? HAIR[0];

  // The body: jeans at the bottom, a hoodie with a pocket and strings.
  const torso = new ModelBuilder()
    .cylinder(0.25, 0.22, 0.2, DENIM, { at: [0, 0.12, 0] }, 20)
    .sphere(0.22, DENIM, { at: [0, 0.1, 0] }, [1.04, 0.5, 1.04])
    .capsule(0.26, 0.18, color, { at: [0, 0.4, 0] })
    .box(0.28, 0.12, 0.05, tint(color, -0.15), { at: [0, 0.32, 0.235] }, 0.02)
    .torus(0.17, 0.05, tint(color, -0.1), { at: [0, NECK - 0.02, -0.03], rot: [Math.PI / 2, 0, 0] })
    .cylinder(0.008, 0.008, 0.12, GLOVE, { at: [-0.05, 0.5, 0.25] }, 6)
    .cylinder(0.008, 0.008, 0.12, GLOVE, { at: [0.05, 0.5, 0.25] }, 6)
    .build().body;

  const headBuilder = new ModelBuilder()
    .sphere(HEAD_RADIUS, skin, { at: [0, HEAD_RADIUS * 0.9, 0] }, [1, 0.95, 1])
    // Hair: a cap over the back and top, a fringe at the front.
    .sphere(HEAD_RADIUS * 1.04, hair, { at: [0, HEAD_RADIUS * 1.0, -0.02] }, [1, 0.85, 1])
    .box(0.26, 0.05, 0.08, hair, { at: [0, HEAD_RADIUS * 1.55, 0.13], rot: [0.5, 0, 0] }, 0.025)
    // Eyes and cheeks on the face (+z).
    .sphere(0.028, PALETTE.ink, { at: [-0.07, HEAD_RADIUS * 0.95, 0.18] }, [0.8, 1.2, 0.6])
    .sphere(0.028, PALETTE.ink, { at: [0.07, HEAD_RADIUS * 0.95, 0.18] }, [0.8, 1.2, 0.6])
    .sphere(0.03, 0xf0908a, { at: [-0.12, HEAD_RADIUS * 0.7, 0.15] }, [1, 0.6, 0.5])
    .sphere(0.03, 0xf0908a, { at: [0.12, HEAD_RADIUS * 0.7, 0.15] }, [1, 0.6, 0.5])
    .sphere(0.04, tint(skin, -0.1), { at: [-HEAD_RADIUS, HEAD_RADIUS * 0.85, 0] }, [0.5, 1, 0.8])
    .sphere(0.04, tint(skin, -0.1), { at: [HEAD_RADIUS, HEAD_RADIUS * 0.85, 0] }, [0.5, 1, 0.8]);
  hat(headBuilder, playerShape(id), color);
  const headGeometry = headBuilder.build().body;

  const handGeometry = new ModelBuilder()
    .sphere(HAND_RADIUS, GLOVE, {}, [1, 0.9, 1.1])
    .build().body;
  return assemble(torso, headGeometry, handGeometry, materials);
}

/** The player's hat: white like the 2D hats, with a band in their color. */
function hat(b: ModelBuilder, shape: PlayerShape, color: number): void {
  const top = HEAD_RADIUS * 1.75;
  const white = PALETTE.white;
  switch (shape) {
    case 'circle':
      // A beanie with a bobble.
      b.sphere(HEAD_RADIUS * 1.06, white, { at: [0, HEAD_RADIUS * 1.15, -0.01] }, [1, 0.72, 1]);
      b.torus(HEAD_RADIUS * 0.98, 0.03, color, {
        at: [0, HEAD_RADIUS * 1.2, -0.01],
        rot: [Math.PI / 2, 0, 0],
      });
      b.sphere(0.06, white, { at: [0, top + 0.06, -0.02] });
      return;
    case 'triangle':
      // A party hat.
      b.cone(0.13, 0.28, white, { at: [0, top + 0.1, 0], rot: [-0.1, 0, 0] });
      b.torus(0.12, 0.022, color, { at: [0, top - 0.02, 0], rot: [Math.PI / 2 - 0.1, 0, 0] });
      b.sphere(0.035, color, { at: [0, top + 0.25, -0.02] });
      return;
    case 'square':
      // A flat square cap with a tassel.
      b.cylinder(HEAD_RADIUS * 0.95, HEAD_RADIUS * 0.95, 0.1, white, { at: [0, top - 0.02, 0] });
      b.box(0.34, 0.035, 0.34, white, { at: [0, top + 0.05, 0], rot: [0, Math.PI / 4, 0] }, 0.01);
      b.box(0.02, 0.1, 0.02, color, { at: [0.12, top, 0.12] }, 0.006);
      return;
    case 'diamond': {
      // A headband with a big diamond on top.
      b.torus(HEAD_RADIUS * 1.0, 0.03, color, {
        at: [0, HEAD_RADIUS * 1.25, 0],
        rot: [Math.PI / 2, 0, 0],
      });
      const gem = new THREE.OctahedronGeometry(0.11, 0);
      gem.scale(0.8, 1.2, 0.8);
      b.add(gem, white, { at: [0, top + 0.12, 0] });
      return;
    }
  }
}

/** The manager: taller, in a suit with a red tie, coffee in hand. */
export function createManager(materials: KitMaterials): Character {
  const suit = PALETTE.manager;
  const torso = new ModelBuilder()
    .cylinder(0.26, 0.24, 0.24, tint(suit, -0.2), { at: [0, 0.13, 0] }, 20)
    .capsule(0.27, 0.26, suit, { at: [0, 0.44, 0] })
    // Shirt, tie and lapels on the front.
    .cone(0.09, 0.2, PALETTE.white, { at: [0, NECK - 0.08, 0.235], rot: [Math.PI, 0, 0] }, 3)
    .box(0.05, 0.22, 0.03, 0xd2322d, { at: [0, NECK - 0.17, 0.262] }, 0.012)
    .box(0.07, 0.05, 0.035, 0xd2322d, { at: [0, NECK - 0.05, 0.255] }, 0.012)
    .build().body;
  const skin = PALETTE.skin;
  const head = new ModelBuilder()
    .sphere(HEAD_RADIUS, skin, { at: [0, HEAD_RADIUS * 0.9 + 0.06, 0] }, [1, 0.95, 1])
    // Slicked-back grey hair and a stern brow.
    .sphere(
      HEAD_RADIUS * 1.04,
      0x8a8f99,
      { at: [0, HEAD_RADIUS * 1.06 + 0.06, -0.035] },
      [1, 0.8, 1],
    )
    .sphere(0.026, PALETTE.ink, { at: [-0.07, HEAD_RADIUS * 0.95 + 0.06, 0.18] }, [0.8, 1.1, 0.6])
    .sphere(0.026, PALETTE.ink, { at: [0.07, HEAD_RADIUS * 0.95 + 0.06, 0.18] }, [0.8, 1.1, 0.6])
    .box(
      0.07,
      0.015,
      0.02,
      PALETTE.ink,
      { at: [-0.07, HEAD_RADIUS * 1.2 + 0.06, 0.18], rot: [0, 0, -0.25] },
      0.005,
    )
    .box(
      0.07,
      0.015,
      0.02,
      PALETTE.ink,
      { at: [0.07, HEAD_RADIUS * 1.2 + 0.06, 0.18], rot: [0, 0, 0.25] },
      0.005,
    )
    .build().body;
  // A hand holding a coffee mug, the other a plain hand.
  const hand = new ModelBuilder().sphere(HAND_RADIUS, skin, {}, [1, 0.9, 1.1]).build().body;
  const c = assemble(torso, head, hand, materials);
  const mug = new ModelBuilder()
    .cylinder(0.055, 0.05, 0.12, PALETTE.white, { at: [0, 0.07, 0.03] })
    .torus(0.035, 0.012, PALETTE.white, { at: [0.06, 0.07, 0.03], rot: [0, 0, Math.PI / 2] })
    .cylinder(0.047, 0.047, 0.004, 0x5a3a22, { at: [0, 0.128, 0.03] })
    .build().body;
  const mugMesh = new THREE.Mesh(mug, materials.body);
  mugMesh.castShadow = true;
  c.rightHand.add(mugMesh);
  c.geometries.push(mug);
  return c;
}

function assemble(
  torso: THREE.BufferGeometry,
  headGeometry: THREE.BufferGeometry,
  handGeometry: THREE.BufferGeometry,
  materials: KitMaterials,
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
    geometries: [torso, headGeometry, handGeometry],
  };
}
