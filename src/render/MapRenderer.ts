import Phaser from 'phaser';
import { type LevelMap, type Tile, getTile } from '../sim/level';
import {
  type Point,
  type Side,
  TILE_SIZE,
  VIEW_PITCH,
  blockFaces,
  tileCorners,
  tileDepth,
  tileToScreen,
} from './projection';

/** Placeholder looks until the art pass. Floor tiles draw flat, the rest as blocks. */
interface BlockStyle {
  color: number;
  height: number;
  /** Letter drawn on top, if any. */
  label?: string;
}

export const WALL_HEIGHT = TILE_SIZE * 0.75;
export const STATION_HEIGHT = TILE_SIZE * 0.4;
/** Walls on the camera side of the room are cut down so they never hide what's behind. */
export const FRONT_WALL_HEIGHT = TILE_SIZE * 0.2;

export const BLOCK_STYLES: Readonly<Record<Exclude<Tile, 'floor'>, BlockStyle>> = {
  wall: { color: 0x9aa3b5, height: WALL_HEIGHT },
  counter: { color: 0x8a8f99, height: STATION_HEIGHT },
  inbox: { color: 0x4fa3e0, height: STATION_HEIGHT, label: 'I' },
  bugQueue: { color: 0xe05a5a, height: STATION_HEIGHT, label: 'B' },
  keyboard: { color: 0x6cc070, height: STATION_HEIGHT, label: 'K' },
  testBench: { color: 0xe0b44f, height: STATION_HEIGHT, label: 'T' },
  review: { color: 0xb07ce0, height: STATION_HEIGHT, label: 'R' },
  pipeline: { color: 0xe07c4f, height: STATION_HEIGHT, label: 'P' },
  ship: { color: 0x4fe0b0, height: STATION_HEIGHT, label: 'S' },
  bin: { color: 0x5a5a5a, height: STATION_HEIGHT, label: 'X' },
};

/** Wall looks a level can pick; each has the three pieces in `WALL_PIECES`. */
export const WALL_THEMES = ['plaster', 'wood', 'glass'] as const;
export type WallTheme = (typeof WALL_THEMES)[number];

/**
 * `wall` shows its front face, `wall-front` is cut down on the camera side,
 * `wall-inner` has a wall in front so only its top shows.
 */
const WALL_PIECES = ['wall', 'wall-front', 'wall-inner'] as const;

/** Things hung on walls that show their front face, per theme. */
const WALL_DECOS: Readonly<Record<WallTheme, readonly string[]>> = {
  plaster: ['poster', 'whiteboard', 'clock', 'kanban'],
  wood: ['poster', 'whiteboard', 'clock', 'kanban'],
  glass: ['whiteboard', 'clock'],
};
/** One in this many front-facing walls gets a decoration. */
const WALL_DECO_EVERY = 3;
/** Decoration center above the tile center: the middle of the wall's face, over the skirting. */
const WALL_DECO_LIFT = 12;

/** Tiles drawn from `public/assets/tiles/<tile>.png`; walls come from `walls/<theme>/`. */
const TILE_SPRITES: readonly Exclude<Tile, 'floor' | 'wall'>[] = [
  'counter',
  'inbox',
  'bugQueue',
  'keyboard',
  'testBench',
  'review',
  'pipeline',
  'ship',
  'bin',
];

/** Every sprite as its path under `public/assets/`, without extension. */
const SPRITE_PATHS: readonly string[] = [
  ...TILE_SPRITES.map((tile) => `tiles/${tile}`),
  ...WALL_THEMES.flatMap((theme) => WALL_PIECES.map((piece) => `walls/${theme}/${piece}`)),
  ...[...new Set(Object.values(WALL_DECOS).flat())].map((deco) => `walls/deco/${deco}`),
];

/** Sprite pixel that sits on the front edge of the tile's floor, bottom center. */
const SPRITE_ANCHOR = { x: 32, y: 80 };
const SPRITE_SIZE = { width: 64, height: 96 };

const spriteKey = (path: string): string => `sprite.${path}`;

/**
 * Queues every map sprite; call from a scene's `preload`. A sprite that is
 * missing or fails to load falls back to the procedural placeholder.
 */
export function preloadMapSprites(scene: Phaser.Scene): void {
  for (const path of SPRITE_PATHS) {
    const key = spriteKey(path);
    scene.load.image(key, `assets/${path}.png`);
    // Pixel art: keep hard pixel edges when the camera zooms.
    scene.load.once(`filecomplete-image-${key}`, () => {
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    });
  }
}

/** Small deterministic hash of a tile, so decorations stay put between runs. */
function tileHash(x: number, y: number): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
}

/** Placeholder color of a block, so other renderers can match it. */
export function tileColor(tile: Exclude<Tile, 'floor'>): number {
  return BLOCK_STYLES[tile].color;
}

/** How much darker each side face is than the top. */
const SIDE_SHADE: Readonly<Record<Side, number>> = {
  front: 0.72,
  left: 0.55,
  right: 0.55,
  back: 0.55,
};

const FLOOR_COLOR = 0x3a4a5c;
const GRID_LINE_COLOR = 0x000000;
const GRID_LINE_ALPHA = 0.3;
const EDGE_COLOR = 0x2a2f38;

/** How far anything drawn on the map sticks up above its tile's floor. */
export const MAP_OVERHANG = WALL_HEIGHT;

/** Blocks use `tileDepth`; the floor sits below and overlays above all of them. */
export const OVERLAY_DEPTH = 1_000_000;
const FLOOR_DEPTH = -1;
/** Lifts a label over its own block without reaching the block in front. */
const LABEL_DEPTH_OFFSET = 0.01;

/** Phaser's polygon helpers are typed for Vector2; projection math returns plain points. */
export function vectors(points: readonly Point[]): Phaser.Math.Vector2[] {
  return points.map((p) => new Phaser.Math.Vector2(p.x, p.y));
}

export function shade(color: number, factor: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(c.red * factor, c.green * factor, c.blue * factor);
}

/**
 * Draws a level map: one Graphics for the whole floor and one per block so
 * blocks depth-sort by `tileDepth`. Stations get a letter on top.
 */
export class MapRenderer {
  private readonly debugLabels: Phaser.GameObjects.Text[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: LevelMap,
    private readonly wallTheme: WallTheme = 'plaster',
  ) {
    this.drawFloor();
    this.drawBlocks();
    this.createDebugLabels();
  }

  setDebugVisible(visible: boolean): void {
    for (const label of this.debugLabels) label.setVisible(visible);
  }

  /** Top face of the block on tile (x, y), or `null` for floor and off-map tiles. */
  blockTop(x: number, y: number): Point[] | null {
    const tile = getTile(this.map, x, y);
    if (tile === null || tile === 'floor') return null;
    return blockFaces(x, y, this.blockHeight(x, y, tile)).top;
  }

  /** Center of the top face of the block on tile (x, y), or `null` for floor and off-map tiles. */
  blockTopCenter(x: number, y: number): Point | null {
    const tile = getTile(this.map, x, y);
    if (tile === null || tile === 'floor') return null;
    const c = tileToScreen(x, y);
    return { x: c.x, y: c.y - this.blockHeight(x, y, tile) };
  }

  private forEachTile(fn: (x: number, y: number, tile: Tile) => void): void {
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = getTile(this.map, x, y);
        if (tile) fn(x, y, tile);
      }
    }
  }

  private drawFloor(): void {
    const g = this.scene.add.graphics().setDepth(FLOOR_DEPTH);
    // Floor runs under blocks too, so their front faces never show a gap.
    this.forEachTile((x, y, tile) => {
      drawFloorTile(g, x, y, tile === 'floor');
    });
  }

  private drawBlocks(): void {
    this.forEachTile((x, y, tile) => {
      if (tile === 'floor') return;
      const height = this.blockHeight(x, y, tile);
      if (tile !== 'wall') {
        drawBlock(this.scene, x, y, tile, height, `tiles/${tile}`);
        return;
      }
      const piece = this.wallPiece(x, y, height);
      drawBlock(this.scene, x, y, tile, height, `walls/${this.wallTheme}/${piece}`);
      if (piece === 'wall') this.drawWallDeco(x, y);
    });
  }

  /**
   * A full wall with another wall in front never shows its front face; where
   * that wall is cut down (the front corners), the top runs on down instead.
   */
  private wallPiece(x: number, y: number, height: number): (typeof WALL_PIECES)[number] {
    if (height < WALL_HEIGHT) return 'wall-front';
    return getTile(this.map, x, y + 1) === 'wall' ? 'wall-inner' : 'wall';
  }

  /** Maybe hangs a decoration on the front face of the wall on tile (x, y). */
  private drawWallDeco(x: number, y: number): void {
    const decos = WALL_DECOS[this.wallTheme];
    const hash = tileHash(x, y);
    if (hash % WALL_DECO_EVERY !== 0 || decos.length === 0) return;
    const deco = decos[Math.floor(hash / WALL_DECO_EVERY) % decos.length];
    const key = spriteKey(`walls/deco/${deco ?? ''}`);
    if (!this.scene.textures.exists(key)) return;
    const c = tileToScreen(x, y);
    this.scene.add
      .image(c.x, c.y - WALL_DECO_LIFT, key)
      .setDepth(tileDepth(x, y) + LABEL_DEPTH_OFFSET);
  }

  private blockHeight(x: number, y: number, tile: Exclude<Tile, 'floor'>): number {
    const behind = getTile(this.map, x, y - 1);
    const onFrontEdge = y === this.map.height - 1;
    const isFrontWall = tile === 'wall' && (onFrontEdge || (behind !== null && behind !== 'wall'));
    return isFrontWall ? FRONT_WALL_HEIGHT : BLOCK_STYLES[tile].height;
  }

  /** Grid coordinates on every tile, and the player number on spawn tiles. */
  private createDebugLabels(): void {
    this.forEachTile((x, y, tile) => {
      const c = tileToScreen(x, y);
      const spawn = this.map.spawns.findIndex((s) => s.x === x && s.y === y);
      const lift = tile === 'floor' ? 0 : this.blockHeight(x, y, tile);
      const label = this.scene.add
        .text(c.x, c.y - lift, spawn >= 0 ? `P${spawn + 1}` : `${x},${y}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: spawn >= 0 ? '#ffd166' : '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(OVERLAY_DEPTH)
        .setVisible(false);
      this.debugLabels.push(label);
    });
  }
}

/** One floor tile into `g`; `gridLines` outlines it like open floor. */
export function drawFloorTile(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  gridLines: boolean,
): void {
  const points = vectors(tileCorners(x, y));
  g.fillStyle(FLOOR_COLOR);
  g.fillPoints(points, true);
  if (gridLines) {
    g.lineStyle(1, GRID_LINE_COLOR, GRID_LINE_ALPHA);
    g.strokePoints(points, true);
  }
}

/**
 * One block on tile (x, y), `height` pixels tall, with its letter on top if it
 * has one. Drawn as the sprite at `spritePath` instead when that is loaded.
 */
export function drawBlock(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tile: Exclude<Tile, 'floor'>,
  height: number,
  spritePath?: string,
): void {
  const depth = tileDepth(x, y);
  const sprite = spriteKey(spritePath ?? '');
  if (scene.textures.exists(sprite)) {
    const c = tileToScreen(x, y);
    scene.add
      .image(c.x, c.y + (TILE_SIZE * VIEW_PITCH) / 2, sprite)
      .setOrigin(SPRITE_ANCHOR.x / SPRITE_SIZE.width, SPRITE_ANCHOR.y / SPRITE_SIZE.height)
      .setDepth(depth);
    return;
  }
  const style = BLOCK_STYLES[tile];
  const { top, sides } = blockFaces(x, y, height);
  const g = scene.add.graphics().setDepth(depth);

  g.lineStyle(1, EDGE_COLOR, 0.6);
  for (const { side, points } of sides) {
    g.fillStyle(shade(style.color, SIDE_SHADE[side]));
    g.fillPoints(vectors(points), true);
    g.strokePoints(vectors(points), true);
  }
  g.fillStyle(style.color);
  g.fillPoints(vectors(top), true);
  g.strokePoints(vectors(top), true);

  if (style.label) {
    const c = tileToScreen(x, y);
    scene.add
      .text(c.x, c.y - height, style.label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(depth + LABEL_DEPTH_OFFSET);
  }
}
