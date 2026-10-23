import * as THREE from 'three';
import { CONVEYOR_TICKS, TICKS_PER_SECOND } from '../../sim/balance';
import { type LevelMap, type Tile, conveyorAt, getTile, isWorkSurface } from '../../sim/level';
import type { MapLook } from '../mapLook';
import { type WallPiece, tileHash, wallDeco, wallPiece } from '../mapShape';
import { VIEW3D_PITCH, type Vec3, gridToWorld } from '../projection';
import { type KitMaterials, type Model, ModelBuilder, kitMaterials } from './kit';
import {
  SLAB_DEPTH,
  STATION_HEIGHT,
  WALL_HEIGHT,
  facingYaw,
  heroPlacement,
  stationFacing,
} from './layout';
import { WALL_TOP_PROPS } from './setDressing';
import { PALETTE } from './look';
import {
  STATION_MODELS,
  conveyorModel,
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
  whiteboard: 'W',
  merge: 'G',
};
/** Each floor tile's brightness wobbles by up to this much, so the floor doesn't look printed. */
const FLOOR_WOBBLE = 0.06;

interface Placement {
  at: Vec3;
  yaw: number;
  /** Instance tint; white keeps the model's colors. */
  tint?: number;
}

/** One wall in this many gets clutter on top. */
const CLUTTER_EVERY = 6;

/**
 * What stands on top of the wall on tile (x, y), if anything: plants, books
 * or a plant and a mug, on some full-height walls. Never next to a counter or
 * station (it'd look like something to pick up), never on a wall with floor
 * behind it (it'd hide someone standing there), never on glass.
 */
function wallClutter(
  map: LevelMap,
  x: number,
  y: number,
  piece: WallPiece,
  look: MapLook,
): (() => Model) | undefined {
  if (piece === 'wall-front' || look.walls === 'glass') return undefined;
  const h = tileHash(x, y);
  if (h % CLUTTER_EVERY !== 0) return undefined;
  if (getTile(map, x, y - 1) === 'floor') return undefined;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (isWorkSurface(getTile(map, x + dx, y + dy))) return undefined;
    }
  }
  return WALL_TOP_PROPS[Math.floor(h / CLUTTER_EVERY) % WALL_TOP_PROPS.length];
}

/** The level in 3D, and `update` for what moves on it (the belts). */
export interface MapView {
  root: THREE.Group;
  update(timeMs: number): void;
}

/** Grid steps to the four neighbours, with the yaw that turns a model's front (+z) toward each. */
const SIDES: readonly { dx: number; dy: number; yaw: number }[] = [
  { dx: 0, dy: 1, yaw: 0 },
  { dx: 1, dy: 0, yaw: Math.PI / 2 },
  { dx: 0, dy: -1, yaw: Math.PI },
  { dx: -1, dy: 0, yaw: -Math.PI / 2 },
];

/**
 * The level itself in 3D: the wooden slab (following the map's outline),
 * the floor, gaps, belts and every block on it, built from the office kit
 * (`models.ts`). Each model kind is one instanced mesh (plus one for its
 * screens and one for its glass), so the whole map is a few dozen draw calls.
 */
export function buildMap(map: LevelMap, look: MapLook): MapView {
  const root = new THREE.Group();
  const materials = kitMaterials();
  const { width, height } = map;

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
      if (!tile || tile === 'void') continue;
      if (tile === 'gap') {
        // A drop: a lower floor seen through it, shaft walls and a railing where it meets the office.
        place('pit', pitFloorModel, { at: gridToWorld(x, y, -PIT_DEPTH), yaw: 0 });
        for (const side of SIDES) {
          const next = getTile(map, x + side.dx, y + side.dy);
          if (next === 'gap') continue;
          // Wall pieces face into the pit: turned from the neighbour toward this tile.
          place('pitWall', pitWallModel, { at: gridToWorld(x, y), yaw: side.yaw + Math.PI });
          if (next === 'floor')
            place('railing', railingModel, { at: gridToWorld(x, y), yaw: side.yaw });
        }
        continue;
      }
      // The slab under every tile but drops: the level's outline, edges and all.
      place('slab', slabModel, { at: gridToWorld(x, y), yaw: 0 });
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
        const clutter = wallClutter(map, x, y, piece, look);
        if (clutter) {
          // Square to the wall, give or take a little.
          const h = tileHash(y, x);
          const turn = ((h % 4) * Math.PI) / 2 + (((h >> 2) % 3) - 1) * 0.15;
          place(`clutter:${WALL_TOP_PROPS.indexOf(clutter)}`, clutter, {
            at: gridToWorld(x, y, WALL_HEIGHT),
            yaw: turn,
          });
        }
        const decoModel = deco ? WALL_DECO_MODELS[deco] : undefined;
        if (deco && decoModel) place(`deco:${deco}`, decoModel, { at: gridToWorld(x, y), yaw: 0 });
        continue;
      }
      if (tile === 'conveyor') {
        const belt = conveyorAt(map, x, y);
        place('conveyor', conveyorModel, {
          at: gridToWorld(x, y),
          yaw: belt ? facingYaw(belt.dir) : 0,
        });
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
    root.add(...instances(model(), at, materials, !NO_SHADOW.has(key)));
  }
  const belts = beltTops(map);
  if (belts) root.add(belts.mesh);
  return {
    root,
    update(timeMs) {
      // The stripes run along every belt toward its arrow.
      if (belts) belts.texture.offset.y = (timeMs / 1000) * BELT_STRIPE_SPEED;
    },
  };
}

/** Flat pieces that never shadow anything. */
const NO_SHADOW: ReadonlySet<string> = new Set(['floor', 'slab', 'pit', 'pitWall']);
/** How deep a gap drops: well below the ground outside, which never covers the level. */
const PIT_DEPTH = 1.6;
/** Belt stripes per second, in texture repeats; one repeat is one tile. */
const BELT_STRIPE_SPEED = 1 / (CONVEYOR_TICKS / TICKS_PER_SECOND);

function slabModel(): Model {
  return new ModelBuilder()
    .box(1.002, SLAB_DEPTH, 1.002, PALETTE.slab, { at: [0, -SLAB_DEPTH / 2 - 0.013, 0] }, 0)
    .build();
}

/** The floor below a gap: the office downstairs, darker. */
function pitFloorModel(): Model {
  const b = new ModelBuilder();
  b.box(1, 0.02, 1, 0x2e3a48, { at: [0, -0.01, 0] }, 0);
  b.box(0.42, 0.02, 0.42, 0x3c4a5a, { at: [0.18, 0.005, -0.15] }, 0);
  return b.build();
}

/** One side of a gap's shaft, facing into it (+z), from the floor down. */
function pitWallModel(): Model {
  return new ModelBuilder()
    .box(1, PIT_DEPTH, 0.04, 0x232a33, { at: [0, -PIT_DEPTH / 2, -0.48] }, 0)
    .box(1, 0.06, 0.06, 0xb8c4d0, { at: [0, -0.03, -0.47] }, 0)
    .build();
}

/** A glass railing along a gap's edge where it meets the floor, on the floor side (−z of the gap). */
function railingModel(): Model {
  const b = new ModelBuilder();
  b.pane(1, 0.32, 0.03, 0xd6f0fa, { at: [0, 0.2, 0.47] });
  b.box(1, 0.04, 0.06, 0xb8c4d0, { at: [0, 0.38, 0.47] }, 0);
  for (const x of [-0.48, 0.48]) b.box(0.04, 0.38, 0.04, 0x8a96a3, { at: [x, 0.19, 0.47] }, 0);
  return b.build();
}

/** The belts' running surfaces: one instanced plane with a shared scrolling stripe texture. */
function beltTops(map: LevelMap): { mesh: THREE.InstancedMesh; texture: THREE.Texture } | null {
  if (map.conveyors.length === 0) return null;
  const texture = beltTexture();
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.62, 1).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }),
    map.conveyors.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  map.conveyors.forEach((c, i) => {
    const at = gridToWorld(c.x, c.y, STATION_HEIGHT + 0.004);
    q.setFromAxisAngle(up, facingYaw(c.dir));
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(at.x, at.y, at.z), q, one));
  });
  mesh.receiveShadow = true;
  return { mesh, texture };
}

/** Dark rubber with yellow chevrons pointing along +z (the belt's way), one per repeat. */
function beltTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#2b2f38';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 7;
    ctx.beginPath();
    // Canvas y runs down; texture v runs up, and the plane's +v points along −z, so draw the chevron pointing down.
    ctx.moveTo(size * 0.18, size * 0.3);
    ctx.lineTo(size * 0.5, size * 0.62);
    ctx.lineTo(size * 0.82, size * 0.3);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
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
