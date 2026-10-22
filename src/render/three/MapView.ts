import * as THREE from 'three';
import { type LevelMap, type Tile, getTile } from '../../sim/level';
import type { MapLook } from '../MapRenderer';
import { tileHash, wallDeco, wallPiece } from '../mapShape';
import { VIEW3D_PITCH, type Vec3, gridToWorld } from '../projection';
import { type KitMaterials, type Model, kitMaterials } from './kit';
import {
  SLAB_DEPTH,
  STATION_HEIGHT,
  WALL_HEIGHT,
  facingYaw,
  heroPlacement,
  stationFacing,
} from './layout';
import { WALL_TOP_PROPS } from './setDressing';
import { PALETTE, matte } from './look';
import {
  STATION_MODELS,
  type StationModel,
  type StationTile,
  WALL_DECO_MODELS,
  floorModel,
  wallModel,
} from './models';

/** Letters on the station tops, matching the order cards in the HUD. */
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
  const { width, height } = map;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.1, SLAB_DEPTH, height + 0.1),
    matte(PALETTE.slab, 0.85),
  );
  put(slab, gridToWorld((width - 1) / 2, (height - 1) / 2, -SLAB_DEPTH / 2 - 0.013));
  slab.receiveShadow = true;
  root.add(slab);

  const placements = new Map<string, { model: () => Model; at: Placement[] }>();
  // Each station kind is built once; its base and hero are instanced separately.
  const stations = new Map<StationTile, StationModel>();
  const stationModel = (tile: StationTile): StationModel => {
    let model = stations.get(tile);
    if (!model) {
      model = STATION_MODELS[tile]();
      stations.set(tile, model);
    }
    return model;
  };
  const badges = new Map<string, THREE.MeshBasicMaterial>();
  const badgeGeometry = new THREE.PlaneGeometry(BADGE_SIZE, BADGE_SIZE).rotateX(-VIEW3D_PITCH);
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
      // Floor runs under stations too, so no gaps show at their feet; walls cover theirs.
      const wobble = 1 - FLOOR_WOBBLE + ((tileHash(x, y) % 100) / 100) * FLOOR_WOBBLE * 2;
      const checker = (x + y) % 2 === 0 ? 1 : 0.95;
      if (tile !== 'wall')
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
        // Only on walls with open floor in front: not behind a station or counter.
        const open = getTile(map, x, y + 1) === 'floor';
        const deco = piece === 'wall' && open ? wallDeco(x, y, look.walls) : null;
        // Clutter on top of full walls: plants, books, a mug, a laptop (not on glass).
        const full = piece !== 'wall-front' && look.walls !== 'glass';
        const clutter = full ? WALL_TOP_PROPS[(tileHash(x, y) >> 3) % 9] : undefined;
        if (clutter) {
          const turn = ((tileHash(y, x) % 8) / 8) * Math.PI * 2;
          place(`clutter:${WALL_TOP_PROPS.indexOf(clutter)}`, clutter, {
            at: gridToWorld(x, y, WALL_HEIGHT),
            yaw: turn,
          });
        }
        const decoModel = deco ? WALL_DECO_MODELS[deco] : undefined;
        if (deco && decoModel) place(`deco:${deco}`, decoModel, { at: gridToWorld(x, y), yaw: 0 });
        continue;
      }
      const yaw = facingYaw(stationFacing(map, x, y));
      const station = stationModel(tile);
      place(`station:${tile}`, () => station.base, { at: gridToWorld(x, y), yaw });
      if (station.hero) {
        const hero = station.hero;
        const h = heroPlacement(yaw, station.heroAt);
        place(`hero:${tile}`, () => hero, { at: gridToWorld(x + h.dx, y + h.dz), yaw: h.yaw });
      }
      const letter = STATION_LETTERS[tile];
      if (letter) {
        const b = heroPlacement(yaw, BADGE_AT);
        // Its bottom edge on the top, leaning back to face the camera.
        const lift = (BADGE_SIZE / 2) * Math.sin(VIEW3D_PITCH);
        const at = gridToWorld(x + b.dx, y + b.dz, STATION_HEIGHT + lift);
        root.add(letterBadge(badgeGeometry, badges, letter, at));
      }
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

/** Where the letter badge lies on a station's top: the front left corner, in the station's space. */
const BADGE_AT: [number, number] = [-0.32, 0.36];
const BADGE_SIZE = 0.3;

/**
 * A round badge with the station's letter standing on its top, square on to
 * the camera like a sign, matching the HUD's order cards. One material per
 * letter, shared.
 */
function letterBadge(
  geometry: THREE.BufferGeometry,
  materials: Map<string, THREE.MeshBasicMaterial>,
  text: string,
  at: Vec3,
): THREE.Mesh {
  let material = materials.get(text);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ map: letterTexture(text), transparent: true });
    materials.set(text, material);
  }
  const mesh = new THREE.Mesh(geometry, material);
  put(mesh, at);
  return mesh;
}

function letterTexture(text: string): THREE.Texture {
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
  return texture;
}

function put(obj: THREE.Object3D, p: Vec3): void {
  obj.position.set(p.x, p.y, p.z);
}
