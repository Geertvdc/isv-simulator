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

/**
 * Sprites in `public/assets/tiles/<key>.png`: one per block tile, plus
 * `wall-front` for the cut-down walls on the camera side. A block whose
 * sprite is missing or fails to load falls back to its colored block.
 */
const TILE_SPRITES: readonly string[] = [
  'wall',
  'wall-front',
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
/** Sprite pixel that sits on the front edge of the tile's floor, bottom center. */
const SPRITE_ANCHOR = { x: 32, y: 80 };
const SPRITE_SIZE = { width: 64, height: 96 };

const spriteKey = (name: string): string => `tile.${name}`;

/** Queues the tile sprites; call from a scene's `preload`. */
export function preloadTileSprites(scene: Phaser.Scene): void {
  for (const name of TILE_SPRITES) {
    const key = spriteKey(name);
    scene.load.image(key, `assets/tiles/${name}.png`);
    // Pixel art: keep hard pixel edges when the camera zooms.
    scene.load.once(`filecomplete-image-${key}`, () => {
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    });
  }
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
      if (tile !== 'floor') drawBlock(this.scene, x, y, tile, this.blockHeight(x, y, tile));
    });
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

/** One block on tile (x, y), `height` pixels tall, with its letter on top if it has one. */
export function drawBlock(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tile: Exclude<Tile, 'floor'>,
  height: number,
): void {
  const depth = tileDepth(x, y);
  const sprite = spriteKey(tile === 'wall' && height < WALL_HEIGHT ? 'wall-front' : tile);
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
