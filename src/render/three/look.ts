import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { BlockTile, LevelMap } from '../../sim/level';
import type { FloorTheme, WallTheme } from '../MapRenderer';
import { gridToWorld } from '../projection';

/**
 * The 3D look's palette and light: warm and saturated like a toy diorama.
 * Every color of the 3D look lives here, so the whole game can be retinted
 * in one place.
 */
export const PALETTE = {
  /** The diorama's slab: a thick wooden base. */
  slab: 0x7a5236,
  slabEdge: 0x9a6b47,
  /** Behind the diorama: dark blue, lighter in the middle. */
  backdropInner: 0x2b3756,
  backdropOuter: 0x12141b,
  /** Counter tops (light laminate) over darker fronts. */
  counterTop: 0xf0e6d2,
  counterFront: 0x8a6448,
  /** Every station keeps the color players learned in 2D. */
  station: {
    inbox: 0x4fa3e0,
    bugQueue: 0xe05a5a,
    keyboard: 0x6cc070,
    testBench: 0xe8b84a,
    review: 0xb07ce0,
    pipeline: 0xe9804f,
    ship: 0x3fd6a6,
    bin: 0x5d6168,
  } satisfies Readonly<Record<Exclude<BlockTile, 'wall' | 'counter' | 'conveyor'>, number>>,
  conveyor: 0x4a505c,
  ticket: { feature: 0xf6f1e4, bug: 0xf6c4bd, incident: 0xff6b57 },
  manager: 0x3b3f4a,
  skin: 0xf2c6a0,
  white: 0xfdfdf6,
  ink: 0x1a1d24,
  screenGlow: 0x7cf0c8,
} as const;

/** Floor colors per theme: base and the alternate tile for a gentle checker. */
export const FLOOR_COLORS: Readonly<Record<FloorTheme, readonly [number, number]>> = {
  concrete: [0xb8a487, 0xab977b],
  // A warm teal: blue carpet sank into the backdrop.
  carpet: [0x3f8a80, 0x3a8078],
  parquet: [0xb5824f, 0xab7947],
};

/** Wall colors per theme: face and top. Caps stay darker than stations, so the eye goes to the stations. */
export const WALL_COLORS: Readonly<Record<WallTheme, { face: number; top: number }>> = {
  plaster: { face: 0x8fa3b8, top: 0x5e6f82 },
  wood: { face: 0x9a5a32, top: 0x6b4529 },
  glass: { face: 0xd6f0fa, top: 0x7d8c9a },
};

/** Sun color and strength; it shines from behind and left (see `createLights`). */
const SUN = { color: 0xffe9c7, intensity: 3.6 };
const SKY = { sky: 0xc9dcff, ground: 0x6e5a48, intensity: 0.6 };
/** A weak cool light from the camera side that lifts the shadow sides. */
const FILL = { color: 0xbfd4ff, intensity: 0.6 };
/** How much the soft room reflections show on materials. */
const ENVIRONMENT_INTENSITY = 0.2;

/** Lights for a level: sky, sun with soft shadows fitted to the map, and a fill. */
export function createLights(map: Pick<LevelMap, 'width' | 'height'>): THREE.Object3D[] {
  const { width, height } = map;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const sky = new THREE.HemisphereLight(SKY.sky, SKY.ground, SKY.intensity);

  const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity);
  // From behind and left, about 58° up: shadows fall forward and right, toward the
  // camera, where they show under people and props instead of hiding behind them.
  put(sun, gridToWorld(cx - width * 0.3, cy - height * 0.45, 12));
  put(sun.target, gridToWorld(cx, cy));
  sun.castShadow = true;
  const reach = Math.max(width, height) * 0.72;
  const cam = sun.shadow.camera;
  cam.left = -reach;
  cam.right = reach;
  cam.top = reach;
  cam.bottom = -reach;
  cam.near = 1;
  cam.far = 40;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;

  const fill = new THREE.DirectionalLight(FILL.color, FILL.intensity);
  // From the camera side, so the front faces the sun leaves in shade aren't black.
  put(fill, gridToWorld(cx + width * 0.6, cy + height * 1.2, 6));
  put(fill.target, gridToWorld(cx, cy));
  return [sky, sun, sun.target, fill, fill.target];
}

let environment: THREE.Texture | null = null;

/** A soft studio room to reflect, made once per renderer. */
export function roomEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (environment) return environment;
  const pmrem = new THREE.PMREMGenerator(renderer);
  environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return environment;
}

/** Dresses `scene` with the room reflections and the backdrop. */
export function dressScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  scene.environment = roomEnvironment(renderer);
  scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  scene.background = backdrop();
}

/** A radial gradient behind the diorama, so it doesn't float in flat black. */
function backdrop(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size * 0.45, 0, size / 2, size / 2, size * 0.75);
    g.addColorStop(0, css(PALETTE.backdropInner));
    g.addColorStop(1, css(PALETTE.backdropOuter));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A plain, slightly rough material: the toy look. */
export function matte(color: number, roughness = 0.75): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function put(obj: THREE.Object3D, p: { x: number; y: number; z: number }): void {
  obj.position.set(p.x, p.y, p.z);
}
