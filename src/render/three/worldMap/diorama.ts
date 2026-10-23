import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { WorldMap } from '../../../flow/worldMap';
import { tileHash } from '../../mapShape';
import { type Vec3, gridToWorld } from '../../projection';
import { type KitMaterials, ModelBuilder } from '../kit';
import { MAP_PALETTE, matte } from '../look';
import { BACKLOT, type GroundKind, type GroundTile } from './cityPlan';
import { LABEL, markerSpots } from './markers';

/**
 * The world map diorama, built in code: an island of square land tiles
 * (grass on dirt, a sandy shore) in the sea, the road with its dashed
 * middle line, and a flag for each level with its number on the ground.
 * Static pieces are merged or instanced, so the whole map is a few dozen
 * draw calls.
 */

/** Height of the grass tops, and how much they vary from tile to tile. */
const GROUND_TOP = 0;
const GROUND_JITTER = 0.05;
/** The grass cap on each tile: just smaller than the tile, so the seams barely show. */
const CAP = { size: 0.985, height: 0.12, bevel: 0.035 };
/** How deep the dirt under a tile reaches (under the sea). */
const EARTH_DEPTH = 1.2;
/** The shore ring: lower than the land; some tiles are left out so the coast is ragged. */
const SHORE_TOP = -0.22;
const SHORE_KEEP = 0.8;
const SEA_LEVEL = -0.34;
const SEA_SIZE = 400;
/** How much a tile's grass color varies, lighter or darker. */
const SHADE_JITTER = 0.07;
/** Shallow water round the coast: a lighter band this many tiles wide. */
const SHALLOWS = 1.6;
/** Over how many tiles before a chapter border the grass turns toward the next chapter's. */
const GRASS_BLEND = 1.5;

/** The road: a light edge under the asphalt, the dashes on top, a round stop at each flag. */
const ROAD = {
  y: GROUND_TOP + GROUND_JITTER + 0.035,
  edge: 0.74,
  width: 0.56,
  stopEdge: 0.5,
  stop: 0.4,
  dashWidth: 0.06,
  dashLength: 0.22,
  dashEvery: 0.5,
  /** Space between road samples when resampling it smooth. */
  step: 0.12,
};
/** The road's top, where the van's wheels stand. */
export const ROAD_SURFACE = ROAD.y + 0.01;

/** Level flags: a plate, a pole with a gold ball and a cloth in the chapter's color. */
const FLAG = {
  plate: 0.3,
  pole: 1.45,
  cloth: { width: 0.62, height: 0.4, depth: 0.04 },
};

export interface Diorama {
  root: THREE.Group;
  /** Each node's flag: its cloth (waved every frame) and where its foot stands. */
  flags: { cloth: THREE.Mesh; foot: Vec3 }[];
}

/** Builds the diorama for `map`; `chapterIds` names each region's chapter (for its colors), `ground` paves its tiles. */
export function buildDiorama(
  map: WorldMap,
  chapterIds: readonly string[],
  ground: readonly GroundTile[],
  materials: KitMaterials,
): Diorama {
  const root = new THREE.Group();
  root.add(...terrain(map, chapterIds, ground), sea(), shallows(map), road(map, materials));
  const flags: Diorama['flags'] = [];
  // Every flag's stand in one mesh; the cloths wave one by one.
  const stands = new ModelBuilder();
  markerSpots(map).forEach((marker, i) => {
    const foot = gridToWorld(marker.foot.x, marker.foot.y, ROAD.y);
    const chapterId = chapterIds[map.nodeChapters[i] ?? -1] ?? '';
    flagStand(stands, foot);
    const cloth = flagCloth(chapterId);
    cloth.position.x += foot.x;
    cloth.position.y += foot.y;
    cloth.position.z += foot.z;
    root.add(cloth);
    flags.push({ cloth, foot });
    const label = labelMesh(levelNumber(map, i));
    const at = gridToWorld(marker.label.x, marker.label.y, ROAD.y - 0.02);
    label.position.set(at.x, at.y, at.z);
    root.add(label);
  });
  const standMesh = new THREE.Mesh(stands.build().body, materials.body);
  standMesh.castShadow = true;
  root.add(standMesh);
  return { root, flags };
}

/** "2-3": the chapter and the level's place in it, both from 1. */
function levelNumber(map: WorldMap, index: number): string {
  const chapter = map.nodeChapters[index] ?? 0;
  let place = 0;
  for (let i = 0; i <= index; i++) if (map.nodeChapters[i] === chapter) place++;
  return `${chapter + 1}-${place}`;
}

/** A pseudo-random number in [0, 1) for tile (x, y), the same every time. */
function hash01(x: number, y: number, salt = 0): number {
  let h = tileHash(x + salt * 131, y - salt * 71);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** The land tiles (grass or paving caps over dirt columns) and the ragged sandy shore round them. */
function terrain(
  map: WorldMap,
  chapterIds: readonly string[],
  ground: readonly GroundTile[],
): THREE.Object3D[] {
  interface Tile {
    x: number;
    y: number;
    top: number;
    color: number;
    /** Under the cap: dirt on the island's sides, a darker shade in the seams inside. */
    seam: number;
  }
  const top = -BACKLOT;
  const tiles: Tile[] = ground.map(({ x, y, kind, chapter }) => {
    const paved = kind !== 'grass' && kind !== 'lawn';
    const base = groundColor(map, chapterIds, x, y, kind, chapter);
    const shade = (hash01(x, y, 1) * 2 - 1) * (paved ? SHADE_JITTER * 0.4 : SHADE_JITTER);
    const color = shadeColor(base, shade);
    return {
      x,
      y,
      top: GROUND_TOP + hash01(x, y, 2) * (paved ? GROUND_JITTER * 0.3 : GROUND_JITTER),
      color,
      seam: shadeColor(base, paved ? -0.12 : -0.35),
    };
  });
  // The shore: a ring of lower sand tiles, some missing, so the coast isn't a straight line.
  for (let y = top - 1; y <= map.height; y++) {
    for (let x = -1; x <= map.width; x++) {
      const ring = x === -1 || y === top - 1 || x === map.width || y === map.height;
      if (!ring || hash01(x, y, 3) > SHORE_KEEP) continue;
      const shade = (hash01(x, y, 4) * 2 - 1) * SHADE_JITTER;
      tiles.push({
        x,
        y,
        top: SHORE_TOP,
        color: shadeColor(MAP_PALETTE.sand, shade),
        seam: MAP_PALETTE.earth,
      });
    }
  }

  const capGeometry = new RoundedBoxGeometry(CAP.size, CAP.height, CAP.size, 2, CAP.bevel);
  capGeometry.translate(0, -CAP.height / 2, 0);
  const caps = new THREE.InstancedMesh(capGeometry, matte(0xffffff, 0.9), tiles.length);
  const earthGeometry = new THREE.BoxGeometry(1, EARTH_DEPTH, 1);
  earthGeometry.translate(0, -EARTH_DEPTH / 2, 0);
  const earth = new THREE.InstancedMesh(earthGeometry, matte(0xffffff, 0.95), tiles.length);
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  tiles.forEach((tile, i) => {
    // Tiles are centered on their map point + 0.5, like level tiles on their grid cell.
    const p = gridToWorld(tile.x + 0.5, tile.y + 0.5, tile.top);
    m.makeTranslation(p.x, p.y, p.z);
    caps.setMatrixAt(i, m);
    caps.setColorAt(i, color.setHex(tile.color));
    m.makeTranslation(p.x, p.y - CAP.height * 0.6, p.z);
    earth.setMatrixAt(i, m);
    const edge =
      tile.x <= 0 || tile.y <= top || tile.x >= map.width - 1 || tile.y >= map.height - 1;
    earth.setColorAt(i, color.setHex(edge ? MAP_PALETTE.earth : tile.seam));
  });
  caps.receiveShadow = true;
  earth.receiveShadow = true;
  return [caps, earth];
}

/**
 * A ground tile's color: grass in its chapter's green (blended into the
 * next chapter's over the last tiles before the border), a mown lawn in
 * stripes, or paving.
 */
function groundColor(
  map: WorldMap,
  chapterIds: readonly string[],
  x: number,
  y: number,
  kind: GroundKind,
  chapter: number,
): number {
  if (kind === 'lawn') return x % 2 === 0 ? MAP_PALETTE.lawn : MAP_PALETTE.lawnStripe;
  if (kind !== 'grass') return MAP_PALETTE.paving[kind];
  const grass = (c: number): number =>
    MAP_PALETTE.ground[chapterIds[c] ?? ''] ?? MAP_PALETTE.groundFallback;
  const region = map.regions[chapter];
  const next = map.regions[chapter + 1];
  const here = new THREE.Color(grass(chapter));
  if (!region || !next) return here.getHex();
  const fromEnd = region.x + region.width - (x + 0.5);
  const share = Math.max(0, (GRASS_BLEND - fromEnd) / (GRASS_BLEND * 2));
  // Rows vary where the blend starts, so the border is ragged.
  const ragged = hash01(x, y, 5) < 0.5 ? share : share * 0.6;
  return here.lerp(new THREE.Color(grass(chapter + 1)), ragged).getHex();
}

/** `color` made lighter (positive `amount`) or darker. */
function shadeColor(color: number, amount: number): number {
  const c = new THREE.Color(color);
  return amount >= 0
    ? c.lerp(new THREE.Color(0xffffff), amount).getHex()
    : c.multiplyScalar(1 + amount).getHex();
}

/** The sea round the island, far past the camera's view. */
function sea(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE).rotateX(-Math.PI / 2),
    matte(MAP_PALETTE.sea, 0.55),
  );
  mesh.position.y = SEA_LEVEL;
  mesh.receiveShadow = true;
  return mesh;
}

/** A lighter band of shallow water round the island, so the coast doesn't stand on a flat sea. */
function shallows(map: WorldMap): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(map.width + SHALLOWS * 2, map.height + BACKLOT + SHALLOWS * 2).rotateX(
      -Math.PI / 2,
    ),
    matte(MAP_PALETTE.shallows, 0.5),
  );
  const center = gridToWorld(map.width / 2, (map.height - BACKLOT) / 2, SEA_LEVEL + 0.01);
  mesh.position.set(center.x, center.y, center.z);
  mesh.receiveShadow = true;
  return mesh;
}

/** The road resampled into evenly spaced, smooth world points on the ground. */
function roadPath(map: WorldMap): THREE.Vector3[] {
  const points = map.road.map((p) => {
    const w = gridToWorld(p.x, p.y, ROAD.y);
    return new THREE.Vector3(w.x, w.y, w.z);
  });
  if (points.length < 2) return points;
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return curve.getSpacedPoints(Math.max(2, Math.ceil(curve.getLength() / ROAD.step)));
}

/** The road, its stops and its dashes, merged into one mesh. */
function road(map: WorldMap, materials: KitMaterials): THREE.Mesh {
  const path = roadPath(map);
  const builder = new ModelBuilder();
  builder.add(ribbon(path, ROAD.edge, 0), MAP_PALETTE.roadEdge, {});
  builder.add(ribbon(path, ROAD.width, 0.004), MAP_PALETTE.road, {});
  for (const node of map.nodes) {
    const at = gridToWorld(node.x, node.y, ROAD.y);
    builder.add(disc(ROAD.stopEdge), MAP_PALETTE.roadEdge, { at: [at.x, at.y + 0.006, at.z] });
    builder.add(disc(ROAD.stop), MAP_PALETTE.road, { at: [at.x, at.y + 0.009, at.z] });
  }
  // Dashes along the middle, skipping the stops.
  let along = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    along += a.distanceTo(b);
    if (along < ROAD.dashEvery) continue;
    along = 0;
    const nearStop = map.nodes.some((n) => {
      const w = gridToWorld(n.x, n.y);
      return Math.hypot(b.x - w.x, b.z - w.z) < ROAD.stop + ROAD.dashLength;
    });
    if (nearStop) continue;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    builder.add(
      new THREE.PlaneGeometry(ROAD.dashWidth, ROAD.dashLength).rotateX(-Math.PI / 2),
      MAP_PALETTE.roadDash,
      { at: [b.x, b.y + 0.012, b.z], rot: [0, yaw, 0] },
    );
  }
  const mesh = new THREE.Mesh(builder.build().body, materials.body);
  mesh.receiveShadow = true;
  return mesh;
}

/** A flat strip `width` wide along `path`, lifted by `lift`, facing up. */
function ribbon(path: readonly THREE.Vector3[], width: number, lift: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  path.forEach((p, i) => {
    const a = path[Math.max(0, i - 1)] ?? p;
    const b = path[Math.min(path.length - 1, i + 1)] ?? p;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Sideways, on the ground.
    const sx = (-dz / len) * (width / 2);
    const sz = (dx / len) * (width / 2);
    positions.push(p.x + sx, p.y + lift, p.z + sz, p.x - sx, p.y + lift, p.z - sz);
    normals.push(0, 1, 0, 0, 1, 0);
    if (i > 0) {
      const k = (i - 1) * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

function disc(radius: number): THREE.BufferGeometry {
  return new THREE.CircleGeometry(radius, 28).rotateX(-Math.PI / 2);
}

/** A flag's plate, pole and gold ball, standing at `foot`. */
function flagStand(b: ModelBuilder, foot: Vec3): void {
  const { x, y, z } = foot;
  b.cylinder(FLAG.plate, FLAG.plate + 0.04, 0.08, MAP_PALETTE.plate, { at: [x, y + 0.04, z] }, 24)
    .cylinder(0.035, 0.035, FLAG.pole, MAP_PALETTE.pole, { at: [x, y + FLAG.pole / 2, z] }, 10)
    .sphere(0.08, MAP_PALETTE.finial, { at: [x, y + FLAG.pole + 0.05, z] });
}

/** A flag's cloth in its chapter's color, hinged at the pole of a flag standing at the origin. */
function flagCloth(chapterId: string): THREE.Mesh {
  const { width, height, depth } = FLAG.cloth;
  const clothGeometry = new THREE.BoxGeometry(width, height, depth);
  // Hinged at the pole.
  clothGeometry.translate(width / 2, 0, 0);
  const cloth = new THREE.Mesh(
    clothGeometry,
    matte(MAP_PALETTE.flag[chapterId] ?? MAP_PALETTE.flagFallback, 0.8),
  );
  cloth.position.set(0.03, FLAG.pole - height / 2 - 0.04, 0);
  cloth.castShadow = true;
  return cloth;
}

/** The level number, big and white with a soft shadow, as a plane lying on the ground. */
function labelMesh(text: string): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '900 104px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // A darker copy a little lower: the number looks raised off the ground.
    ctx.fillStyle = 'rgba(20, 30, 20, 0.45)';
    ctx.fillText(text, 128, 72);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    roughness: 0.8,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(LABEL.width, LABEL.height).rotateX(-Math.PI / 2),
    material,
  );
  mesh.receiveShadow = true;
  return mesh;
}
