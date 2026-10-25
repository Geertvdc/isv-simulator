import * as THREE from 'three';
import type { MapPoint } from '../../../flow/worldMap';
import { gateSign } from '../../../sim/content';
import { gridToWorld } from '../../projection';
import { type KitMaterials, ModelBuilder } from '../kit';
import type { Puff } from './locks';

/**
 * The world map's locks, built in code: the bank of not-yet-rendered
 * wireframe clouds over a locked chapter, the striped barrier with its "★ N" sign at a closed gate, a
 * padlock for a locked level's flag and the little stars over a played one.
 */

export const LOCK_COLORS = {
  /**
   * The locked land's cloud: faceted like an unrendered mesh, pale blueprint
   * blue on top and a deeper blue under, with a glowing wireframe over it.
   */
  cloudTop: 0x6f9be6,
  cloudBottom: 0x2f56a3,
  cloudWire: 0xbfe0ff,
  boomRed: 0xe0433a,
  boomWhite: 0xf6f3ec,
  post: 0x5b6270,
  /** The gate's sign: a little terminal screen. */
  signBoard: 0x1b2130,
  signBorder: '#d6453d',
  signText: '#e8edf7',
  signStar: '#ffc83d',
  signPrompt: '#5fe08a',
  padlock: 0xf2b632,
  shackle: 0xc9ccd2,
  keyhole: 0x3a3f47,
  /** The grey of a locked level's flag. */
  lockedCloth: 0x9aa1aa,
  starEarned: 0xffc83d,
  starMissing: 0x7d8a9a,
} as const;

/** The clouds drift to and fro and bob, slowly; rolling away they shrink, rise and fade. */
const CLOUD_MOTION = { driftMs: 9000, bobMs: 4200, bob: 0.08, rise: 1.2, spread: 0.35 };

export interface CloudBank {
  mesh: THREE.InstancedMesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  /** Places the puffs at `timeMs`; `gone` runs from 0 (all there) to 1 (rolled away). */
  update(timeMs: number, gone: number): void;
}

/**
 * A cloud bank from `puffs` (map units) that looks not rendered yet: flat
 * shaded low-poly puffs with a glowing wireframe drawn over them.
 */
export function buildCloudBank(puffs: readonly Puff[], drift: number): CloudBank {
  // Detail 1, flat shaded: facets that read as a mesh waiting for its render.
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  // Light on top, a deeper blue underneath.
  const top = new THREE.Color(LOCK_COLORS.cloudTop);
  const bottom = new THREE.Color(LOCK_COLORS.cloudBottom);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    c.copy(bottom).lerp(top, Math.min(1, Math.max(0, (positions.getY(i) + 0.6) / 1.2)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
    emissive: 0x1a2c55,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, puffs.length));
  mesh.count = puffs.length;
  mesh.castShadow = true;
  // The puffs move about: never culled.
  mesh.frustumCulled = false;
  // The wireframe: the same puffs a hair bigger, drawn as glowing lines.
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: LOCK_COLORS.cloudWire,
    wireframe: true,
    transparent: true,
    opacity: 0.8,
  });
  const wire = new THREE.InstancedMesh(geometry, wireMaterial, Math.max(1, puffs.length));
  wire.count = puffs.length;
  wire.frustumCulled = false;
  mesh.add(wire);
  const wireScale = new THREE.Vector3();
  let cx = 0;
  let cy = 0;
  for (const p of puffs) {
    cx += p.x / puffs.length;
    cy += p.y / puffs.length;
  }
  const m = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const update = (timeMs: number, gone: number): void => {
    const k = gone * gone;
    puffs.forEach((p, i) => {
      const drifting = Math.sin((timeMs / CLOUD_MOTION.driftMs) * Math.PI * 2 + p.phase) * drift;
      const bob = Math.sin((timeMs / CLOUD_MOTION.bobMs) * Math.PI * 2 + p.phase * 1.7);
      const x = p.x + drifting + (p.x - cx) * CLOUD_MOTION.spread * k;
      const y = p.y + (p.y - cy) * CLOUD_MOTION.spread * k;
      at.set(x, p.z + bob * CLOUD_MOTION.bob + CLOUD_MOTION.rise * k, y);
      const r = p.r * (1 - gone * 0.85);
      size.set(r, r * p.squash, r);
      turn.setFromEuler(euler.set(0, p.phase, 0));
      mesh.setMatrixAt(i, m.compose(at, turn, size));
      wire.setMatrixAt(i, m.compose(at, turn, wireScale.copy(size).multiplyScalar(1.004)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    wire.instanceMatrix.needsUpdate = true;
    const fading = gone > 0;
    if (material.transparent !== fading) {
      material.transparent = fading;
      material.needsUpdate = true;
    }
    // They shrink and rise first and only then fade, so they stay white clouds, not fog.
    material.opacity = 1 - Math.min(1, Math.max(0, (gone - 0.35) / 0.65));
    wireMaterial.opacity = 0.8 * material.opacity;
    mesh.visible = gone < 1;
  };
  update(0, 0);
  return { mesh, update };
}

/** The barrier: a post, a striped boom across the road (raised up to this angle) and the sign. */
const BARRIER = {
  /** The post stands this far off the road's middle; the boom reaches across to the far side. */
  aside: 0.52,
  postHeight: 0.42,
  boomLength: 1.15,
  boomThick: 0.07,
  stripe: 0.115,
  raised: 1.4,
  sign: { aside: 0.66, ahead: 0.25, height: 0.75, width: 0.95, tall: 0.6, tilt: -0.5 },
};

export interface GateModel {
  root: THREE.Group;
  /** Turned round its hinge to raise the boom: 0 down, 1 up. */
  setRaised(share: number): void;
  /** The "★ N" sign: shrinks away once the gate opens. */
  sign: THREE.Group;
}

/**
 * A closed gate on the road at `at` (map units, the road going `tangent`
 * there, its top at height `ground`): the post on the camera's side of the road, the boom across it and
 * the sign showing `stars` on the far side.
 */
export function buildGate(
  at: MapPoint,
  tangent: MapPoint,
  stars: number,
  ground: number,
  materials: KitMaterials,
): GateModel {
  const root = new THREE.Group();
  root.position.y = ground;
  // Across the road, toward the camera (map y grows toward it).
  let side = { x: -tangent.y, y: tangent.x };
  if (side.y < 0) side = { x: -side.x, y: -side.y };

  const post = gridToWorld(at.x + side.x * BARRIER.aside, at.y + side.y * BARRIER.aside);
  const hinge = new THREE.Group();
  hinge.position.set(post.x, 0, post.z);
  // Local +x points across the road, away from the camera.
  hinge.rotation.y = Math.atan2(side.y, -side.x);
  root.add(hinge);

  const fixed = new ModelBuilder()
    .cylinder(0.05, 0.06, BARRIER.postHeight, LOCK_COLORS.post, {
      at: [0, BARRIER.postHeight / 2, 0],
    })
    .box(0.14, 0.16, 0.14, LOCK_COLORS.boomRed, { at: [0, BARRIER.postHeight - 0.02, 0] })
    // The fork the boom rests in on the far side.
    .cylinder(0.025, 0.03, BARRIER.postHeight - 0.08, LOCK_COLORS.post, {
      at: [BARRIER.boomLength - 0.05, (BARRIER.postHeight - 0.08) / 2, 0],
    });
  const fixedMesh = new THREE.Mesh(fixed.build().body, materials.body);
  fixedMesh.castShadow = true;
  hinge.add(fixedMesh);

  const arm = new THREE.Group();
  arm.position.y = BARRIER.postHeight + 0.02;
  hinge.add(arm);
  const boom = new ModelBuilder();
  const count = Math.round(BARRIER.boomLength / BARRIER.stripe);
  for (let k = 0; k < count; k++) {
    const color = k % 2 === 0 ? LOCK_COLORS.boomRed : LOCK_COLORS.boomWhite;
    boom.box(
      BARRIER.stripe,
      BARRIER.boomThick,
      BARRIER.boomThick,
      color,
      {
        at: [0.06 + BARRIER.stripe * (k + 0.5), 0, 0],
      },
      0,
    );
  }
  // A counterweight behind the hinge.
  boom.box(0.2, 0.11, 0.1, LOCK_COLORS.post, { at: [-0.12, 0, 0] });
  const boomMesh = new THREE.Mesh(boom.build().body, materials.body);
  boomMesh.castShadow = true;
  arm.add(boomMesh);

  const sign = new THREE.Group();
  const s = BARRIER.sign;
  const spot = gridToWorld(
    at.x - side.x * s.aside + tangent.x * s.ahead,
    at.y - side.y * s.aside + tangent.y * s.ahead,
  );
  sign.position.set(spot.x, 0, spot.z);
  const signPost = new ModelBuilder()
    .cylinder(0.03, 0.035, s.height, LOCK_COLORS.post, { at: [0, s.height / 2, 0] })
    .box(s.width + 0.06, s.tall + 0.06, 0.05, LOCK_COLORS.post, {
      at: [0, s.height + s.tall / 2 - 0.04, -0.03],
      rot: [s.tilt, 0, 0],
    });
  const signMesh = new THREE.Mesh(signPost.build().body, materials.body);
  signMesh.castShadow = true;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(s.width, s.tall),
    new THREE.MeshBasicMaterial({ map: signTexture(gateSign(stars)) }),
  );
  face.position.set(0, s.height + s.tall / 2 - 0.04, 0);
  face.rotation.x = s.tilt;
  face.translateZ(0.002);
  sign.add(signMesh, face);
  root.add(sign);

  return {
    root,
    sign,
    setRaised: (share) => {
      arm.rotation.z = BARRIER.raised * share;
    },
  };
}

/** The sign's face: a little terminal screen with "★ N" after a green prompt, in a red frame. */
function signTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 164;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = LOCK_COLORS.signBorder;
    ctx.fillRect(0, 0, 256, 164);
    ctx.fillStyle = '#' + new THREE.Color(LOCK_COLORS.signBoard).getHexString();
    ctx.fillRect(12, 12, 232, 140);
    ctx.font = '800 80px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle';
    // A prompt, then the star (up to the first space) in gold and the number light.
    const prompt = '>';
    const space = text.indexOf(' ');
    const star = space < 0 ? '' : text.slice(0, space + 1);
    const number = space < 0 ? text : text.slice(space + 1);
    const parts: [string, string][] = [
      [prompt, LOCK_COLORS.signPrompt],
      [star, LOCK_COLORS.signStar],
      [number, LOCK_COLORS.signText],
    ];
    let x = 128 - parts.reduce((sum, [t]) => sum + ctx.measureText(t).width, 0) / 2;
    for (const [t, color] of parts) {
      ctx.fillStyle = color;
      ctx.fillText(t, x, 86);
      x += ctx.measureText(t).width;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A small padlock, standing at the origin facing the camera, to hang on a locked flag's pole. */
export function padlockGeometry(): THREE.BufferGeometry {
  return new ModelBuilder()
    .torus(0.055, 0.017, LOCK_COLORS.shackle, { at: [0, 0.07, 0] }, Math.PI)
    .box(0.18, 0.15, 0.08, LOCK_COLORS.padlock, { at: [0, 0, 0] }, 0.02)
    .box(0.03, 0.06, 0.01, LOCK_COLORS.keyhole, { at: [0, -0.01, 0.042] }, 0)
    .build().body;
}

/** A chunky five-pointed star `radius` across its points, facing +z, centered. */
export function starGeometry(radius: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.48;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: radius * 0.3,
    bevelEnabled: true,
    bevelThickness: radius * 0.12,
    bevelSize: radius * 0.1,
    bevelSegments: 1,
  });
  geometry.center();
  return geometry;
}
