import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { BlockTile, LevelMap } from '../../sim/level';
import type { FloorTheme, WallTheme } from '../mapLook';
import { gridToWorld } from '../projection';
import { type Atmosphere, DEFAULT_ATMOSPHERE, lampSpots, sunPlacement } from './atmosphere';
import { COLOR } from './palette';

/**
 * The 3D look's palette and light: warm and saturated like a toy diorama.
 * The colors with a role (stations, tickets, the slab) live here; the
 * swatches several models share are named in `palette.ts`.
 */
export const PALETTE = {
  /** The diorama's slab: a thick wooden base. */
  slab: COLOR.walnut,
  slabEdge: 0x9a6b47,
  /** Behind the diorama: dark blue, lighter in the middle. */
  backdropInner: COLOR.midnight,
  backdropOuter: 0x12141b,
  /** Counter tops (light laminate) over darker fronts. */
  counterTop: 0xf0e6d2,
  counterFront: COLOR.chestnut,
  /** Every station keeps its signature color (`tileColor`), which the HUD recipes use too. */
  station: {
    inbox: COLOR.skyBlue,
    bugQueue: 0xe05a5a,
    keyboard: 0x6cc070,
    testBench: COLOR.mustard,
    review: 0xb07ce0,
    pipeline: 0xe9804f,
    ship: 0x3fd6a6,
    bin: 0x5d6168,
    whiteboard: 0xdfe6ee,
    // Raspberry: apart from the pipeline's orange and the review's purple.
    merge: 0xe8459a,
  } satisfies Readonly<Record<Exclude<BlockTile, 'wall' | 'counter' | 'conveyor'>, number>>,
  conveyor: COLOR.asphalt,
  ticket: {
    feature: 0xf6f1e4,
    bug: COLOR.blush,
    incident: 0xff6b57,
    frontend: 0xcfe6ff,
    backend: 0xd3f0d0,
    fullstack: 0xe6d9ff,
  },
  manager: 0x3b3f4a,
  skin: COLOR.skinLight,
  white: COLOR.white,
  ink: 0x1a1d24,
  screenGlow: COLOR.screenGlow,
} as const;

/**
 * The world map's colors (phase 19, made a circuit board in phase 20): the
 * island is a board whose solder mask turns from fresh green to grey city
 * paving left to right, with a dark FR4 edge, gold contact fingers round
 * its rim and lighter traces on top; it floats on a dark editor-grid sea. The
 * road is a data bus: dark, with copper edges and cyan packets.
 */
export const MAP_PALETTE = {
  /** Top of the land tiles (the board's solder mask), per chapter id. */
  ground: {
    garage: 0x8fc94f,
    startup: 0x4eb46a,
    'scale-up': 0x82b38a,
    enterprise: 0xa6b2a4,
    'big-tech': 0xb9c4cb,
  } as Readonly<Record<string, number>>,
  groundFallback: 0x8fc46a,
  /** Big Tech's mown lawn, in stripes. */
  lawn: 0x6fc052,
  lawnStripe: 0x62b347,
  /** Paved ground: sidewalks round buildings, the back street, city concrete, the plaza. */
  paving: {
    paving: 0xd6d0c2,
    concrete: 0xb7bbbb,
    asphalt: COLOR.asphalt,
    plaza: 0xe6d8bb,
  },
  /** The board's rim round the land, and the gold contact fingers on it. */
  rim: 0x2f3d36,
  pad: 0xe2b448,
  /** The board's edge under the solder mask: dark FR4. */
  earth: 0x26332e,
  /** The editor background the board floats on, and its grid lines. */
  sea: 0x17213a,
  seaGrid: 0x2c3c63,
  /** A soft glow on the "water" round the board. */
  shallows: 0x223c66,
  /** The board's traces (drawn lighter than the mask), vias and silkscreen. */
  trace: 'rgba(255, 255, 255, 0.24)',
  via: '#e8bd55',
  viaHole: '#2a2f26',
  silkscreen: 'rgba(255, 255, 255, 0.78)',
  road: 0x2a303c,
  roadEdge: 0xd9993c,
  roadDash: 0x62e6ff,
  /** Flag accents, per chapter id: the same as the chapter colors in the CSS. */
  flag: {
    garage: 0xd98b3a,
    startup: COLOR.freshGreen,
    'scale-up': 0x4f8fe0,
    enterprise: COLOR.purple,
    'big-tech': COLOR.teal,
  } as Readonly<Record<string, number>>,
  flagFallback: 0xe0e0e0,
  pole: 0xf1efe8,
  plate: 0xe3dccb,
  finial: COLOR.sunYellow,
  /** The ring round the selected flag. */
  selected: COLOR.gold,
} as const;

/** Floor colors per theme: base and the alternate tile for a gentle checker. */
export const FLOOR_COLORS: Readonly<Record<FloorTheme, readonly [number, number]>> = {
  concrete: [0xb8a487, 0xab977b],
  // A warm teal: blue carpet sank into the backdrop.
  carpet: [0x3f8a80, 0x3a8078],
  parquet: [COLOR.wood, 0xab7947],
  // Sealed garage concrete, a touch cool; the second is the expansion joints, thin and pale.
  slab: [0xa3a39f, 0x75736d],
};

/** Wall colors per theme: face and top. Caps stay darker than stations, so the eye goes to the stations. */
export const WALL_COLORS: Readonly<Record<WallTheme, { face: number; top: number }>> = {
  plaster: { face: 0x8fa3b8, top: 0x5e6f82 },
  wood: { face: 0x9a5a32, top: 0x6b4529 },
  glass: { face: COLOR.glassClear, top: 0x7d8c9a },
  // Painted cinder block over a grey-green dado, capped with concrete coping.
  garage: { face: 0xc4c0b4, top: 0x8d8b86 },
};

/** Marks the room's warm lamps, which only `medium` and `high` quality light (see `Stage`). */
export const LAMP_KEY = 'lamp';

/**
 * Lights for a level: sky, sun with soft shadows fitted to the map, a fill
 * and, if the atmosphere has them, warm lamps in the room. The light comes
 * from `atmosphere` (see `atmosphere.ts`), today's studio light by default.
 */
export function createLights(
  map: Pick<LevelMap, 'width' | 'height'>,
  atmosphere: Atmosphere = DEFAULT_ATMOSPHERE,
): THREE.Object3D[] {
  const { width, height } = map;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const { sky: SKY, sun: SUN, fill: FILL } = atmosphere;
  const sky = new THREE.HemisphereLight(SKY.sky, SKY.ground, SKY.intensity);

  const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity);
  // From behind and left: shadows fall forward and right, toward the camera,
  // where they show under people and props instead of hiding behind them.
  const placed = sunPlacement(atmosphere, map);
  put(sun, placed.position);
  put(sun.target, placed.target);
  sun.castShadow = true;
  const reach = placed.reach;
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

  // Bare bulbs: cheap point lights with a short reach and no shadows.
  const lamps = lampSpots(atmosphere, map).map((p) => {
    const spec = atmosphere.lamps;
    const lamp = new THREE.PointLight(spec?.color, spec?.intensity, spec?.distance, 2);
    put(lamp, p);
    lamp.userData[LAMP_KEY] = true;
    return lamp;
  });
  return [sky, sun, sun.target, fill, fill.target, ...lamps];
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

/** Where a scene keeps its vignette for `Stage` (an `Atmosphere['vignette']`). */
export const VIGNETTE_KEY = 'vignette';

/**
 * Dresses `scene` with the room reflections, the backdrop and the
 * atmosphere's fog and vignette (fog distances come later, from the camera:
 * see `fogRange`).
 */
export function dressScene(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  atmosphere: Atmosphere = DEFAULT_ATMOSPHERE,
): void {
  scene.environment = roomEnvironment(renderer);
  scene.environmentIntensity = atmosphere.environment;
  scene.background = backdrop(atmosphere.backdrop);
  if (atmosphere.fog) scene.fog = new THREE.Fog(atmosphere.fog.color);
  if (atmosphere.vignette) scene.userData[VIGNETTE_KEY] = atmosphere.vignette;
}

/** A radial gradient behind the diorama, so it doesn't float in flat black. */
function backdrop(
  colors: { inner: number; outer: number } = {
    inner: PALETTE.backdropInner,
    outer: PALETTE.backdropOuter,
  },
): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size * 0.45, 0, size / 2, size / 2, size * 0.75);
    g.addColorStop(0, css(colors.inner));
    g.addColorStop(1, css(colors.outer));
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
