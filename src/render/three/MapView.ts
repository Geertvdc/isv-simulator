import * as THREE from 'three';
import { CONVEYOR_TICKS, TICKS_PER_SECOND } from '../../sim/balance';
import { type LevelMap, type Tile, conveyorAt, getTile, isWorkSurface } from '../../sim/level';
import { type MapLook, tileColor } from '../mapLook';
import { GLYPHS, GLYPH_SIZE, GLYPH_STROKE, type GlyphId, cssHex } from '../stepLook';
import { type WallPiece, levelSalt, tileHash, wallDeco, wallPiece } from '../mapShape';
import { VIEW3D_PITCH, type Vec3, gridToWorld } from '../projection';
import { type KitMaterials, type Model, ModelBuilder, kitMaterials } from './kit';
import {
  FRONT_WALL_HEIGHT,
  SLAB_DEPTH,
  STATION_HEIGHT,
  WALL_HEIGHT,
  facingYaw,
  heroPlacement,
  stationFacing,
} from './layout';
import { COLOR } from './palette';
import { WALL_TOP_PROPS } from './setDressing';
import { atmosphereFor, lampSpots } from './atmosphere';
import { PALETTE } from './look';
import { WALL_DECO_MODELS, conveyorModel, floorModel, wallModel } from './roomModels';
import { ROOMS, floorDressing } from './rooms';
import { type CounterRun, counterRun, counterRunKey } from './rooms/counterRun';
import type { Place, RoomDressing, RoomPlacement } from './rooms/types';
import { STATION_MODELS, type StationModel, type StationTile } from './stationModels';

/** Station glyphs on the station tops, the same tiles as the step tiles on the order cards. */
const STATION_GLYPHS: Partial<Record<Tile, { glyph: GlyphId; color: number }>> = {
  inbox: { glyph: 'inbox', color: tileColor('inbox') },
  bugQueue: { glyph: 'bug', color: tileColor('bugQueue') },
  keyboard: { glyph: 'code', color: tileColor('keyboard') },
  testBench: { glyph: 'test', color: tileColor('testBench') },
  review: { glyph: 'review', color: tileColor('review') },
  pipeline: { glyph: 'pipeline', color: tileColor('pipeline') },
  ship: { glyph: 'ship', color: tileColor('ship') },
  whiteboard: { glyph: 'design', color: tileColor('whiteboard') },
  merge: { glyph: 'merge', color: tileColor('merge') },
};
/** Each floor tile's brightness wobbles by up to this much, so the floor doesn't look printed. */
const FLOOR_WOBBLE = 0.06;

type Placement = RoomPlacement;

/** One wall in this many gets clutter on top (a dressed room may place its own, see `RoomPlan.capProps`). */
const CLUTTER_EVERY = 5;
/** No two walls this close (in tiles, either way) carry the same clutter. */
const CLUTTER_SPREAD = 4;

/**
 * What stands on top of the wall on tile (x, y), if anything: plants, books,
 * mugs and the like, on some full-height walls. Never next to a counter or
 * station, nor with floor beside it (by the play area it'd look like
 * something to pick up), never on a wall with floor behind it (it'd hide
 * someone standing there), never on glass.
 */
function wallClutter(
  map: LevelMap,
  x: number,
  y: number,
  piece: WallPiece,
  look: MapLook,
  level: number,
  count: number,
): number | undefined {
  if (piece === 'wall-front' || look.walls === 'glass') return undefined;
  const h = (tileHash(x, y) ^ level) >>> 0;
  if (h % CLUTTER_EVERY !== 0) return undefined;
  if (getTile(map, x, y - 1) === 'floor') return undefined;
  if (getTile(map, x - 1, y) === 'floor' || getTile(map, x + 1, y) === 'floor') return undefined;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (isWorkSurface(getTile(map, x + dx, y + dy))) return undefined;
    }
  }
  return Math.floor(h / CLUTTER_EVERY) % count;
}

/**
 * `wanted`, or the next prop on from it that none of `placed` within
 * `CLUTTER_SPREAD` tiles of (x, y) carries: neighbours never match.
 */
function unlikeNeighbours(
  wanted: number,
  x: number,
  y: number,
  placed: readonly { x: number; y: number; index: number }[],
  count: number,
): number {
  const near = placed
    .filter((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= CLUTTER_SPREAD)
    .map((p) => p.index);
  let index = wanted;
  for (let t = 0; t < count && near.includes(index); t++) {
    index = (index + 1) % count;
  }
  return index;
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
 * (`stationModels.ts`, `roomModels.ts`), dressed the wall theme's way if it
 * has a dressing in `ROOMS` (`rooms/`). Each model kind is one instanced
 * mesh (plus one for its screens and one for its glass), so the whole map is
 * a few dozen draw calls.
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
  const dressing: RoomDressing | undefined = ROOMS[look.walls];
  const runCounters = new Map<string, StationModel>();
  const runCounterModel = (
    build: (run: CounterRun) => StationModel,
    k: string,
    c: CounterRun,
  ): StationModel => {
    let model = runCounters.get(k);
    if (!model) {
      model = build(c);
      runCounters.set(k, model);
    }
    return model;
  };
  const badges = new Map<string, THREE.MeshBasicMaterial>();
  const badgeGeometry = new THREE.PlaneGeometry(BADGE_SIZE, BADGE_SIZE).rotateX(-VIEW3D_PITCH);
  const place: Place = (key, model, p) => {
    let entry = placements.get(key);
    if (!entry) {
      entry = { model, at: [] };
      placements.set(key, entry);
    }
    entry.at.push(p);
  };

  const clutterPlaced: { x: number; y: number; index: number }[] = [];
  const tops = dressing?.wallTops ?? WALL_TOP_PROPS;
  // Each level its own clutter and decorations, even where two maps share a wall.
  const level = levelSalt(map);
  const plan = dressing?.plan(map) ?? {};
  const floor = floorDressing(look.floor, dressing);
  if (dressing) {
    dressing.placeStory?.(plan, map, place);
    const lamp = dressing.lamp;
    if (lamp) {
      // A fitting where each of the room's lamps shines from, on a wire strung wall to wall.
      const spots = lampSpots(atmosphereFor(look.scene), map).flatMap((at) => {
        const fit = lamp.fit ? lamp.fit(at, map) : at;
        return fit ? [fit] : [];
      });
      for (const at of spots) place('lampFitting', lamp.model, { at, yaw: 0 });
      if (lamp.wire) placeLampWires(map, spots, lamp.wire, place);
    }
    // Props on the wall tops in clusters, leaning toward a neighbour.
    plan.capProps?.forEach(({ x, y, slot, toward }) => {
      const index = (slot + level) % tops.length;
      const h = (tileHash(y, x) ^ level) >>> 0;
      const at = gridToWorld(x + toward.dx * CAP_LEAN, y + toward.dy * CAP_LEAN, WALL_HEIGHT);
      place(`cap:${index}`, tops[index] ?? (() => new ModelBuilder().build()), {
        at,
        yaw: (((h >> 2) % 5) - 2) * 0.12,
      });
    });
    const fronts = dressing.frontWallProps ?? [];
    plan.frontProps?.forEach(({ x, y, slot }) => {
      if (fronts.length === 0) return;
      const index = (slot + level) % fronts.length;
      const model = fronts[index];
      if (!model) return;
      const h = (tileHash(y, x) ^ level) >>> 0;
      place(`front:${index}`, model, {
        at: gridToWorld(x, y, FRONT_WALL_HEIGHT),
        yaw: (((h >> 2) % 5) - 2) * 0.1,
      });
    });
  }
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
      const hash = tileHash(x, y);
      const k = `${x},${y}`;
      // The foundation under every tile but drops: the level's outline, edges and all.
      const foundation = dressing?.foundation;
      if (foundation) {
        const f = ((hash ^ level) >>> 9) % foundation.looks;
        place(`slab:${f}`, () => foundation.model(f), { at: gridToWorld(x, y), yaw: 0 });
      } else place('slab', slabModel, { at: gridToWorld(x, y), yaw: 0 });
      // Floor runs under stations too, so no gaps show at their feet; walls cover theirs.
      const tone = floor?.tone
        ? floor.tone(x, y, level)
        : (1 - FLOOR_WOBBLE + ((hash % 100) / 100) * FLOOR_WOBBLE * 2) *
          ((x + y) % 2 === 0 ? 1 : 0.95);
      const floorLook = floor?.look ? floor.look(x, y, plan.floorWear?.[k] ?? 0) : 0;
      const swap = tile === 'wall' ? plan.swaps?.[k] : undefined;
      if (tile !== 'wall' || swap !== undefined)
        place(
          `floor:${floorLook}`,
          () => (floor ? floor.model(floorLook) : floorModel(look.floor, floorLook)),
          {
            at: gridToWorld(x, y),
            yaw: 0,
            tint: new THREE.Color(1, 1, 1).multiplyScalar(tone).getHex(),
          },
        );
      if (tile === 'floor') continue;
      if (swap !== undefined) {
        // Another model in place of the wall (a closed roll-up door).
        const model = dressing?.swapModels?.[swap];
        if (model) place(`swap:${swap}`, model, { at: gridToWorld(x, y), yaw: 0 });
        continue;
      }
      if (tile === 'wall') {
        const piece = wallPiece(map, x, y);
        const walls = dressing?.wall;
        const wallLook = walls ? ((hash ^ level) >>> 3) % walls.looks : 0;
        place(
          `wall:${piece}:${wallLook}`,
          () => (walls ? walls.model(piece, wallLook) : wallModel(look.walls, piece, wallLook)),
          { at: gridToWorld(x, y), yaw: 0 },
        );
        // Only on walls with open floor in front: not behind a station or counter.
        const open = getTile(map, x, y + 1) === 'floor';
        const deco = plan.decos
          ? (plan.decos[k] ?? null)
          : piece === 'wall' && open
            ? wallDeco(x, y, look.walls, level)
            : null;
        const wanted = plan.capProps
          ? undefined
          : wallClutter(map, x, y, piece, look, level, tops.length);
        const clutterIndex =
          wanted === undefined
            ? undefined
            : unlikeNeighbours(wanted, x, y, clutterPlaced, tops.length);
        const clutter = clutterIndex === undefined ? undefined : tops[clutterIndex];
        if (clutter && clutterIndex !== undefined) {
          clutterPlaced.push({ x, y, index: clutterIndex });
          // Square to the wall, give or take a little.
          const h = (tileHash(y, x) ^ level) >>> 0;
          const turn = ((h % 4) * Math.PI) / 2 + (((h >> 2) % 3) - 1) * 0.15;
          place(`clutter:${clutterIndex}`, clutter, {
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
      const buildCounter = dressing?.counter;
      if (tile === 'counter' && buildCounter) {
        // The room's own counter, built from where the tile sits in its run.
        const c = counterRun(map, x, y);
        const run = counterRunKey(c);
        place(`counter:${run}`, () => runCounterModel(buildCounter, run, c).base, {
          at: gridToWorld(x, y),
          yaw: c.yaw,
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
      const badge = STATION_GLYPHS[tile];
      if (badge) {
        const b = heroPlacement(yaw, BADGE_AT);
        // Its bottom edge on the top, leaning back to face the camera.
        const lift = (BADGE_SIZE / 2) * Math.sin(VIEW3D_PITCH);
        const at = gridToWorld(x + b.dx, y + b.dz, STATION_HEIGHT + lift);
        root.add(glyphBadge(badgeGeometry, badges, badge.glyph, badge.color, at));
      }
    }
  }

  for (const [key, { model, at }] of placements) {
    const flat =
      NO_SHADOW.has(key) ||
      dressing?.flat?.has(key) === true ||
      key.startsWith('floor') ||
      key.startsWith('slab:') ||
      isWire(key);
    root.add(...instances(model(), at, materials, !flat));
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

/** How far (in tiles) a cluster of wall-top props leans in toward its partner. */
const CAP_LEAN = 0.28;

/**
 * The wire each row of lamps hangs from: from the room's wall on one side,
 * through the top of every lamp's flex, to the wall on the other, just over
 * the wall tops.
 */
function placeLampWires(
  map: LevelMap,
  spots: readonly Vec3[],
  wire: NonNullable<NonNullable<RoomDressing['lamp']>['wire']>,
  place: Place,
): void {
  const rows = new Map<number, Vec3[]>();
  for (const p of spots) {
    const k = Math.round(p.z * 100);
    rows.set(k, [...(rows.get(k) ?? []), p]);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    const first = row[0];
    const last = row[row.length - 1];
    if (!first || !last) continue;
    const y = first.y + wire.hang;
    // Out to the walls: the last tile in from each end of the row that isn't wall.
    const gy = Math.round(first.z);
    let x0 = Math.floor(first.x);
    while (x0 > 0 && getTile(map, x0 - 1, gy) !== 'wall' && getTile(map, x0 - 1, gy) !== null) x0--;
    let x1 = Math.ceil(last.x);
    while (
      x1 < map.width - 1 &&
      getTile(map, x1 + 1, gy) !== 'wall' &&
      getTile(map, x1 + 1, gy) !== null
    )
      x1++;
    const ends: [number, number][] = [
      [x0 - 0.5, y + 0.06],
      ...row.map((p): [number, number] => [p.x, y]),
      [x1 + 0.5, y + 0.06],
    ];
    place(`lampWire:${first.z}`, () => wire.model(ends), {
      at: { x: 0, y: 0, z: first.z },
      yaw: 0,
    });
  }
}

/** Flat pieces that never shadow anything. */
const NO_SHADOW: ReadonlySet<string> = new Set(['slab', 'pit', 'pitWall', 'lampFitting']);
/** Thin pieces whose shadows would only be noise: the lamp wires. */
const isWire = (key: string) => key.startsWith('lampWire');
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
  b.pane(1, 0.32, 0.03, COLOR.glassClear, { at: [0, 0.2, 0.47] });
  b.box(1, 0.04, 0.06, 0xb8c4d0, { at: [0, 0.38, 0.47] }, 0);
  for (const x of [-0.48, 0.48]) b.box(0.04, 0.38, 0.04, COLOR.zinc, { at: [x, 0.19, 0.47] }, 0);
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

/** Where the glyph badge lies on a station's top: the front left corner, in the station's space. */
const BADGE_AT: [number, number] = [-0.32, 0.36];
const BADGE_SIZE = 0.32;
/** The step tiles' background and the shadow line around them. */
const BADGE_FILL = '#222a3f';
const BADGE_OUTLINE = '#1a1d24';

/**
 * A rounded tile with the station's glyph in its color standing on its top,
 * square on to the camera like a sign, the same as the step tiles on the
 * order cards. One material per glyph, shared.
 */
function glyphBadge(
  geometry: THREE.BufferGeometry,
  materials: Map<string, THREE.MeshBasicMaterial>,
  glyph: GlyphId,
  color: number,
  at: Vec3,
): THREE.Mesh {
  let material = materials.get(glyph);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ map: glyphTexture(glyph, color), transparent: true });
    materials.set(glyph, material);
  }
  const mesh = new THREE.Mesh(geometry, material);
  put(mesh, at);
  return mesh;
}

function glyphTexture(glyph: GlyphId, color: number): THREE.Texture {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const stroke = cssHex(color);
    ctx.beginPath();
    ctx.roundRect(4, 4, size - 8, size - 8, 16);
    ctx.fillStyle = BADGE_FILL;
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = BADGE_OUTLINE;
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    const inner = size * 0.64;
    ctx.translate((size - inner) / 2, (size - inner) / 2);
    ctx.scale(inner / GLYPH_SIZE, inner / GLYPH_SIZE);
    ctx.lineWidth = GLYPH_STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    for (const shape of GLYPHS[glyph]) {
      ctx.beginPath();
      if (shape.type === 'rect') ctx.roundRect(shape.x, shape.y, shape.w, shape.h, 1.5);
      else if (shape.type === 'circle') ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      else {
        ctx.moveTo(shape.points[0] ?? 0, shape.points[1] ?? 0);
        for (let i = 2; i + 1 < shape.points.length; i += 2)
          ctx.lineTo(shape.points[i] ?? 0, shape.points[i + 1] ?? 0);
        if (shape.type === 'poly') ctx.closePath();
      }
      if (shape.type !== 'line' && shape.fill) ctx.fill();
      else ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function put(obj: THREE.Object3D, p: Vec3): void {
  obj.position.set(p.x, p.y, p.z);
}
