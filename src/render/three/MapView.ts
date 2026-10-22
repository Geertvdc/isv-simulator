import * as THREE from 'three';
import { type LevelMap, type Tile, getTile } from '../../sim/level';
import type { MapLook } from '../MapRenderer';
import { tileHash, wallDeco, wallPiece } from '../mapShape';
import { type Vec3, gridToWorld } from '../projection';
import { type KitMaterials, type Model, kitMaterials } from './kit';
import { SLAB_DEPTH, STATION_HEIGHT, facingYaw, stationFacing } from './layout';
import { PALETTE, matte } from './look';
import { STATION_MODELS, WALL_DECO_MODELS, floorModel, wallModel } from './models';

/** Letters on the station fronts, matching the order cards in the HUD. */
const STATION_LETTERS: Partial<Record<Tile, string>> = {
  inbox: 'I',
  bugQueue: 'B',
  keyboard: 'K',
  testBench: 'T',
  review: 'R',
  pipeline: 'P',
  ship: 'S',
};
/** Each floor tile's brightness wobbles by up to this much, so the floor doesn't look printed. */
const FLOOR_WOBBLE = 0.06;
/** Screens and LEDs draw this much brighter than their color: over white, so they (and only they) bloom. */
export const GLOW_BOOST = 2.5;

interface Placement {
  at: Vec3;
  yaw: number;
  /** Instance tint; white keeps the model's colors. */
  tint?: number;
}

/**
 * The level itself in 3D: the wooden slab, the floor and every block on it,
 * built from the office kit (`models.ts`). Static; each model kind is one
 * instanced mesh (plus one for its screens and one for its glass), so the
 * whole map is a few dozen draw calls.
 */
export function buildMap(map: LevelMap, look: MapLook): THREE.Group {
  const root = new THREE.Group();
  const materials = kitMaterials();
  materials.glow.color.setScalar(GLOW_BOOST);
  const { width, height } = map;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.1, SLAB_DEPTH, height + 0.1),
    matte(PALETTE.slab, 0.85),
  );
  put(slab, gridToWorld((width - 1) / 2, (height - 1) / 2, -SLAB_DEPTH / 2 - 0.013));
  slab.receiveShadow = true;
  root.add(slab);

  const placements = new Map<string, { model: () => Model; at: Placement[] }>();
  const place = (key: string, model: () => Model, p: Placement) => {
    let entry = placements.get(key);
    if (!entry) {
      entry = { model, at: [] };
      placements.set(key, entry);
    }
    entry.at.push(p);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = getTile(map, x, y);
      if (!tile) continue;
      // Floor runs under blocks too, so no gaps show at their feet.
      const wobble = 1 - FLOOR_WOBBLE + ((tileHash(x, y) % 100) / 100) * FLOOR_WOBBLE * 2;
      const checker = (x + y) % 2 === 0 ? 1 : 0.95;
      place('floor', () => floorModel(look.floor), {
        at: gridToWorld(x, y),
        yaw: 0,
        tint: new THREE.Color(1, 1, 1).multiplyScalar(wobble * checker).getHex(),
      });
      if (tile === 'floor') continue;
      if (tile === 'wall') {
        const piece = wallPiece(map, x, y);
        place(`wall:${piece}`, () => wallModel(look.walls, piece), {
          at: gridToWorld(x, y),
          yaw: 0,
        });
        const deco = piece === 'wall' ? wallDeco(x, y, look.walls) : null;
        const decoModel = deco ? WALL_DECO_MODELS[deco] : undefined;
        if (deco && decoModel) place(`deco:${deco}`, decoModel, { at: gridToWorld(x, y), yaw: 0 });
        continue;
      }
      const yaw = facingYaw(stationFacing(map, x, y));
      place(`station:${tile}`, STATION_MODELS[tile], {
        at: gridToWorld(x, y),
        yaw,
      });
      const letter = STATION_LETTERS[tile];
      if (letter) root.add(letterBadge(letter, gridToWorld(x, y), yaw));
    }
  }

  for (const [key, { model, at }] of placements) {
    root.add(...instances(model(), at, materials, key !== 'floor'));
  }
  return root;
}

/** The model's meshes, one instance per placement. */
function instances(
  model: Model,
  at: readonly Placement[],
  materials: KitMaterials,
  castShadow: boolean,
): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  const layers: [THREE.BufferGeometry | null, THREE.Material, boolean][] = [
    [model.body, materials.body, true],
    [model.glow, materials.glow, false],
    [model.glass, materials.glass, false],
  ];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const color = new THREE.Color();
  for (const [geometry, material, lit] of layers) {
    if (!geometry?.getAttribute('position')) continue;
    const mesh = new THREE.InstancedMesh(geometry, material, at.length);
    at.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.at.x, p.at.y, p.at.z), q, one));
      if (p.tint !== undefined) mesh.setColorAt(i, color.set(p.tint));
    });
    mesh.castShadow = castShadow && lit;
    mesh.receiveShadow = lit;
    out.push(mesh);
  }
  return out;
}

/** A round badge with the station's letter on its front, like the HUD's order cards. */
function letterBadge(text: string, at: Vec3, yaw: number): THREE.Mesh {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fdfdf6';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1a1d24';
    ctx.stroke();
    ctx.font = `bold ${size * 0.55}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1a1d24';
    ctx.fillText(text, size / 2, size / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
  // On the front face, over the doors, turned with the station.
  const r = 0.452;
  put(mesh, { x: at.x + Math.sin(yaw) * r, y: STATION_HEIGHT - 0.2, z: at.z + Math.cos(yaw) * r });
  mesh.rotation.y = yaw;
  return mesh;
}

function put(obj: THREE.Object3D, p: Vec3): void {
  obj.position.set(p.x, p.y, p.z);
}
