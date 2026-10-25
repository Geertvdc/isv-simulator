import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldMap } from '../../../flow/worldMap';
import { gridToWorld } from '../../projection';
import { type KitMaterials, ModelBuilder } from '../kit';
import {
  CRANE,
  type PieceBuilders,
  TREE_HEIGHT,
  buildPiece,
  carModel,
  craneJib,
  treeModel,
} from './cityModels';
import { type CityPiece, type CityPlan, STREET, TREE_KINDS, streetLoop } from './cityPlan';

/**
 * The towns and cities on the world map, built from the city plan: every
 * static piece merged into a few meshes per chapter (matte, glass, lit
 * windows), the trees instanced (they sway), and a little life: cars
 * driving round the back street, the crane slewing, warning lights blinking
 * on cranes and towers.
 */

/** Where the pieces stand: on the ground tiles' tops. */
const GROUND = 0.03;
const SWAY = { angle: 0.035, ms: 2600 };
const CARS = {
  count: 7,
  speed: 1.1,
  width: 0.26,
  length: 0.5,
  colors: [0xe8483f, 0x3f7fe0, 0xffc83d, 0xf4f1ea, 0x2fb8b0, 0x8a5ad8, 0xff8a3d],
};
const CRANE_SWING = { angle: 0.55, ms: 9000, base: -0.6 };
const BLINK_MS = 1300;
/** The street's middle line. */
const DASH = { width: 0.05, length: 0.22, every: 0.5 };

export interface Cityscape {
  root: THREE.Group;
  /** Each chapter's pieces, by chapter index: hidden while its chapter is under clouds. */
  chapters: THREE.Group[];
  update(timeMs: number, deltaMs: number): void;
}

/**
 * Each tree's own look (phase 20): its leaves a little lighter or darker,
 * warmer or cooler, and its crown a little wider or narrower.
 */
const TREE_VARIATION = { brightness: [0.82, 1.1], warmth: 0.12, width: [0.85, 1.15] } as const;
/** Body styles of the cars round the back street: sedans, hatchbacks, vans, pickups. */
const CAR_STYLES = 4;

interface Layers {
  body: THREE.BufferGeometry[];
  glow: THREE.BufferGeometry[];
  shiny: THREE.BufferGeometry[];
}

export function buildCityscape(map: WorldMap, plan: CityPlan, materials: KitMaterials): Cityscape {
  const root = new THREE.Group();
  const shinyMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.18,
    metalness: 0.15,
  });
  const blinkMaterials = [materials.glow.clone(), materials.glow.clone()] as const;
  const regions = new Map<number, Layers>();
  const blinks = new Map<number, [THREE.BufferGeometry[], THREE.BufferGeometry[]]>();
  const cranes: { at: THREE.Vector3; chapter: number }[] = [];
  const groups = map.regions.map(() => new THREE.Group());
  root.add(...groups);
  const groupOf = (chapter: number): THREE.Group => groups[chapter] ?? root;
  const m = new THREE.Matrix4();

  plan.pieces.forEach((piece, i) => {
    if ((TREE_KINDS as readonly string[]).includes(piece.kind)) return;
    const builders: PieceBuilders = {
      body: new ModelBuilder(),
      shiny: new ModelBuilder(),
      blink: new ModelBuilder(),
    };
    buildPiece(piece, builders);
    const at = gridToWorld(piece.x, piece.y, GROUND);
    m.makeRotationY(piece.yaw).setPosition(at.x, at.y, at.z);
    const layers = regions.get(piece.chapter) ?? { body: [], glow: [], shiny: [] };
    regions.set(piece.chapter, layers);
    const lights = blinks.get(piece.chapter) ?? [[], []];
    blinks.set(piece.chapter, lights);
    const body = builders.body.build();
    const shiny = builders.shiny.build();
    const blink = builders.blink.build();
    for (const [list, g] of [
      [layers.body, body.body],
      [layers.glow, body.glow],
      [layers.shiny, shiny.body],
      [lights[i % 2], blink.glow],
    ] as const) {
      if (!g || !('position' in g.attributes)) continue;
      g.applyMatrix4(m);
      list?.push(g);
    }
    if (piece.kind === 'crane') {
      const top = gridToWorld(
        piece.x + CRANE.mastX(piece),
        piece.y + CRANE.mastZ(piece),
        GROUND + CRANE.mastHeight(piece),
      );
      cranes.push({ at: new THREE.Vector3(top.x, top.y, top.z), chapter: piece.chapter });
    }
  });
  streetDashes(map, regions);

  for (const [chapter, layers] of regions) {
    const add = (
      list: THREE.BufferGeometry[],
      material: THREE.Material,
      shadows: boolean,
    ): void => {
      if (list.length === 0) return;
      const mesh = new THREE.Mesh(merge(list), material);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      groupOf(chapter).add(mesh);
    };
    add(layers.body, materials.body, true);
    add(layers.shiny, shinyMaterial, true);
    add(layers.glow, materials.glow, false);
  }
  for (const [chapter, lights] of blinks) {
    lights.forEach((list, k) => {
      if (list.length > 0) groupOf(chapter).add(new THREE.Mesh(merge(list), blinkMaterials[k]));
    });
  }

  // Trees per chapter and kind, so a chapter's trees hide with it.
  const trees = map.regions.flatMap((region) =>
    buildTrees(
      plan.pieces.filter((p) => p.chapter === region.chapter),
      materials,
    ).map((tree) => {
      groupOf(region.chapter).add(tree.mesh);
      return tree;
    }),
  );

  // The cranes' turning tops.
  const jibs = cranes.map(({ at, chapter }, k) => {
    const parts = craneJib();
    const built = parts.body.build();
    const group = new THREE.Group();
    const jib = new THREE.Mesh(built.body, materials.body);
    jib.castShadow = true;
    group.add(jib);
    const light = parts.blink.build().glow;
    if (light) group.add(new THREE.Mesh(light, blinkMaterials[k % 2]));
    group.position.copy(at);
    groupOf(chapter).add(group);
    return group;
  });

  // Cars round the back street.
  const loop = streetLoop(map.width);
  // Instanced cars in white, one mesh per body style, painted per instance.
  const carMeshes = Array.from({ length: CAR_STYLES }, (_, style) => {
    const builder = new ModelBuilder();
    carModel(builder, new ModelBuilder(), 0xffffff, CARS.width, CARS.length, style);
    const count = Math.ceil((CARS.count - style) / CAR_STYLES);
    const mesh = new THREE.InstancedMesh(builder.build().body, materials.body, Math.max(1, count));
    mesh.count = Math.max(0, count);
    mesh.castShadow = true;
    return mesh;
  });
  const paint = new THREE.Color();
  for (let k = 0; k < CARS.count; k++) {
    const mesh = carMeshes[k % CAR_STYLES];
    mesh?.setColorAt(
      Math.floor(k / CAR_STYLES),
      paint.setHex(CARS.colors[k % CARS.colors.length] ?? 0xffffff),
    );
  }
  // The cars move all over the island: never culled.
  for (const mesh of carMeshes) {
    mesh.frustumCulled = false;
    root.add(mesh);
  }
  const carOffsets = Array.from(
    { length: CARS.count },
    (_, k) => (loop.length * k) / CARS.count + (k % 3) * 0.7,
  );
  const carQuaternion = new THREE.Quaternion();
  const carPosition = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);

  return {
    root,
    chapters: groups,
    update(timeMs: number): void {
      for (const tree of trees) tree.sway(timeMs);
      carOffsets.forEach((offset, k) => {
        const spot = loop.at(offset + (timeMs / 1000) * CARS.speed);
        // Map x and y are world x and z (see `gridToWorld`): no new vector per car per frame.
        carQuaternion.setFromAxisAngle(up, spot.yaw);
        carMeshes[k % CAR_STYLES]?.setMatrixAt(
          Math.floor(k / CAR_STYLES),
          m.compose(carPosition.set(spot.x, GROUND, spot.y), carQuaternion, one),
        );
      });
      for (const mesh of carMeshes) mesh.instanceMatrix.needsUpdate = true;
      jibs.forEach((jib, k) => {
        jib.rotation.y =
          CRANE_SWING.base +
          Math.sin((timeMs / CRANE_SWING.ms) * Math.PI * 2 + k) * CRANE_SWING.angle;
      });
      const phase = (timeMs % BLINK_MS) / BLINK_MS;
      blinkMaterials[0].visible = phase < 0.35;
      blinkMaterials[1].visible = phase > 0.5 && phase < 0.85;
    },
  };
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return merged;
}

/** The back street's dashed middle line, into each chapter's body layer. */
function streetDashes(map: WorldMap, regions: Map<number, Layers>): void {
  const y = STREET.row + 0.5;
  for (let x = STREET.end; x < map.width - STREET.end; x += DASH.every) {
    const region = map.regions.find((r) => x >= r.x && x < r.x + r.width);
    const layers = region && regions.get(region.chapter);
    if (!layers) continue;
    const at = gridToWorld(x, y, GROUND + 0.002);
    const g = new ModelBuilder()
      .add(new THREE.PlaneGeometry(DASH.length, DASH.width).rotateX(-Math.PI / 2), 0xf2efe4, {
        at: [at.x, at.y, at.z],
      })
      .build().body;
    layers.body.push(g);
  }
}

/** One instanced mesh per tree kind; each tree sways a little round its foot, and has its own tint and width. */
function buildTrees(
  pieces: readonly CityPiece[],
  materials: KitMaterials,
): { mesh: THREE.InstancedMesh; sway: (timeMs: number) => void }[] {
  return TREE_KINDS.flatMap((kind) => {
    const list = pieces.filter((p) => p.kind === kind);
    if (list.length === 0) return [];
    const geometry = treeModel(kind).build().body;
    const mesh = new THREE.InstancedMesh(geometry, materials.body, Math.max(1, list.length));
    mesh.count = list.length;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const v = TREE_VARIATION;
    const lerp = ([a, b]: readonly [number, number], t: number) => a + (b - a) * t;
    const color = new THREE.Color();
    const base = list.map((p, i) => {
      const at = gridToWorld(p.x, p.y, GROUND);
      // Numbers from the variant's later digits, so they don't follow its yaw.
      const digit = (k: number) => (p.variant * 10 ** k) % 1;
      const bright = lerp(v.brightness, digit(2));
      const warm = (digit(3) * 2 - 1) * v.warmth;
      mesh.setColorAt(i, color.setRGB(bright * (1 + warm), bright, bright * (1 - warm * 1.5)));
      const height = p.h / TREE_HEIGHT[kind];
      return {
        at: new THREE.Vector3(at.x, at.y, at.z),
        scale: new THREE.Vector3(
          height * lerp(v.width, digit(4)),
          height,
          height * lerp(v.width, digit(5)),
        ),
        yaw: p.variant * Math.PI * 2,
        phase: p.variant * 40,
      };
    });
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const m = new THREE.Matrix4();
    const sway = (timeMs: number): void => {
      base.forEach((t, i) => {
        const a = (timeMs / SWAY.ms) * Math.PI * 2 + t.phase;
        const lean = kind === 'bush' ? 0 : SWAY.angle;
        e.set(Math.sin(a) * lean, t.yaw, Math.cos(a * 0.7) * lean * 0.6);
        q.setFromEuler(e);
        mesh.setMatrixAt(i, m.compose(t.at, q, t.scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    sway(0);
    mesh.computeBoundingSphere();
    return [{ mesh, sway }];
  });
}
