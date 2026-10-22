import * as THREE from 'three';
import { type LevelMap, type Tile, getTile } from '../../sim/level';
import type { MapLook } from '../MapRenderer';
import { type Vec3, gridToWorld } from '../projection';
import { SLAB_DEPTH, blockHeight } from './layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS, matte } from './look';

/** How thick a counter's top is, and how far it sticks out over the front. */
const TOP_THICKNESS = 0.08;
const TOP_OVERHANG = 0.03;
const STATION_LABELS: Partial<Record<Tile, string>> = {
  inbox: 'I',
  bugQueue: 'B',
  keyboard: 'K',
  testBench: 'T',
  review: 'R',
  pipeline: 'P',
  ship: 'S',
  bin: 'X',
};

/**
 * The level itself in 3D: the wooden slab, the floor and every block on
 * it. Built once per level and static; blocks of a kind share one
 * instanced mesh, so the whole map is a handful of draw calls.
 */
export function buildMap(map: LevelMap, look: MapLook): THREE.Group {
  const root = new THREE.Group();
  const { width, height } = map;

  const slab = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, SLAB_DEPTH, height + 0.1), [
    matte(PALETTE.slab, 0.85),
    matte(PALETTE.slab, 0.85),
    matte(PALETTE.slabEdge, 0.85),
    matte(PALETTE.slab, 0.85),
    matte(PALETTE.slab, 0.85),
    matte(PALETTE.slab, 0.85),
  ]);
  put(slab, gridToWorld((width - 1) / 2, (height - 1) / 2, -SLAB_DEPTH / 2 - 0.002));
  slab.receiveShadow = true;
  root.add(slab);

  const floor: Vec3[] = [];
  const parts = new Map<string, { geometry: THREE.BufferGeometry; color: number; at: Vec3[] }>();
  const add = (key: string, geometry: () => THREE.BufferGeometry, color: number, at: Vec3) => {
    let part = parts.get(key);
    if (!part) {
      part = { geometry: geometry(), color, at: [] };
      parts.set(key, part);
    }
    part.at.push(at);
  };

  const wall = WALL_COLORS[look.walls];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = getTile(map, x, y);
      if (!tile) continue;
      floor.push(gridToWorld(x, y));
      if (tile === 'floor') continue;
      const h = blockHeight(map, x, y);
      if (tile === 'wall') {
        // A wall: its face, and a darker cap on top.
        add(
          `wall:${h}`,
          () => new THREE.BoxGeometry(1, h - 0.06, 1),
          wall.face,
          gridToWorld(x, y, (h - 0.06) / 2),
        );
        add(
          `wallTop:${h}`,
          () => new THREE.BoxGeometry(1, 0.06, 1),
          wall.top,
          gridToWorld(x, y, h - 0.03),
        );
        continue;
      }
      // Counters and stations: a body with a light top that sticks out a little.
      const body = tile === 'counter' ? PALETTE.counterFront : PALETTE.station[tile];
      const bodyH = h - TOP_THICKNESS;
      add(
        `body:${tile}`,
        () => new THREE.BoxGeometry(0.94, bodyH, 0.94),
        body,
        gridToWorld(x, y, bodyH / 2),
      );
      const top = tile === 'counter' ? PALETTE.counterTop : lighten(PALETTE.station[tile], 0.12);
      add(
        `top:${tile}`,
        () => new THREE.BoxGeometry(1 + TOP_OVERHANG, TOP_THICKNESS, 1 + TOP_OVERHANG),
        top,
        gridToWorld(x, y, h - TOP_THICKNESS / 2),
      );
      const label = STATION_LABELS[tile];
      if (label) root.add(labelPlane(label, gridToWorld(x, y, h + 0.004)));
    }
  }

  const m = new THREE.Matrix4();
  const [floorA, floorB] = FLOOR_COLORS[look.floor];
  const floorMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    matte(0xffffff, 0.9),
    floor.length,
  );
  const color = new THREE.Color();
  floor.forEach((p, i) => {
    floorMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    floorMesh.setColorAt(i, color.set((p.x + p.z) % 2 ? floorB : floorA));
  });
  floorMesh.receiveShadow = true;
  root.add(floorMesh);

  for (const [key, { geometry, color: c, at }] of parts) {
    const material = matte(c);
    if (look.walls === 'glass' && key.startsWith('wall:')) {
      material.transparent = true;
      material.opacity = 0.55;
      material.roughness = 0.15;
    }
    const mesh = new THREE.InstancedMesh(geometry, material, at.length);
    at.forEach((p, i) => {
      mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

/** `color` mixed `amount` of the way to white. */
export function lighten(color: number, amount: number): number {
  return new THREE.Color(color).lerp(new THREE.Color(0xffffff), amount).getHex();
}

/** A letter lying on a block top, until the stations get real models. */
function labelPlane(text: string, at: Vec3): THREE.Mesh {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = `bold ${size * 0.6}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(26, 29, 36, 0.75)';
    ctx.fillText(text, size / 2, size / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  put(mesh, at);
  return mesh;
}

function put(obj: THREE.Object3D, p: Vec3): void {
  obj.position.set(p.x, p.y, p.z);
}
