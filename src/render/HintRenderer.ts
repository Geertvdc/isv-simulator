import Phaser from 'phaser';
import type { HintId } from '../flow/hints';
import { HINT_TEXTS } from '../sim/content';
import { type LevelMap, type Tile, getTile } from '../sim/level';
import { type MapRenderer, OVERLAY_DEPTH } from './MapRenderer';

/** The tile each first-level hint points at. */
const HINT_TILES: Readonly<Record<HintId, Tile>> = {
  inbox: 'inbox',
  keyboard: 'keyboard',
  ship: 'ship',
};

/** How far over the block top the arrow tip floats, and how far it bobs. */
const ARROW_LIFT = 10;
const BOB_PX = 6;
const BOB_MS = 700;
const ARROW_SIZE = 12;
const COLOR = 0xffd166;

interface HintSprite {
  container: Phaser.GameObjects.Container;
  baseY: number;
}

/**
 * Bobbing arrows with a label over the inbox, keyboard and ship hatch while
 * their first-level hints are open.
 */
export class HintRenderer {
  private readonly sprites = new Map<HintId, HintSprite>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: LevelMap,
    private readonly mapRenderer: MapRenderer,
  ) {}

  /** Shows `open` hints (none while `visible` is false); `time` is scene time in ms. */
  sync(open: readonly HintId[], visible: boolean, time: number): void {
    for (const [id, sprite] of this.sprites) {
      if (open.includes(id)) continue;
      sprite.container.destroy();
      this.sprites.delete(id);
    }
    const bob = Math.sin((time / BOB_MS) * Math.PI) * BOB_PX;
    for (const id of open) {
      let sprite = this.sprites.get(id) ?? null;
      if (!sprite) {
        sprite = this.create(id);
        if (!sprite) continue;
        this.sprites.set(id, sprite);
      }
      sprite.container.setVisible(visible);
      sprite.container.y = sprite.baseY + bob;
    }
  }

  private create(id: HintId): HintSprite | null {
    const at = this.anchor(HINT_TILES[id]);
    if (!at) return null;
    const arrow = this.scene.add.graphics();
    arrow.fillStyle(COLOR);
    arrow.lineStyle(3, 0x1a1d24);
    const tri = [
      new Phaser.Math.Vector2(0, 0),
      new Phaser.Math.Vector2(-ARROW_SIZE, -ARROW_SIZE * 1.3),
      new Phaser.Math.Vector2(ARROW_SIZE, -ARROW_SIZE * 1.3),
    ];
    arrow.strokePoints(tri, true);
    arrow.fillPoints(tri, true);
    const label = this.scene.add
      .text(0, -ARROW_SIZE * 1.3 - 4, HINT_TEXTS[id], {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#1a1d24',
        backgroundColor: '#ffd166',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 1);
    const baseY = at.y - ARROW_LIFT;
    const container = this.scene.add
      .container(at.x, baseY, [arrow, label])
      .setDepth(OVERLAY_DEPTH + 1);
    return { container, baseY };
  }

  /** The middle of the top of the first group of `tile` blocks on the map. */
  private anchor(tile: Tile): { x: number; y: number } | null {
    const first = this.findFirst(tile);
    if (!first) return null;
    const group = [first];
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      if (getTile(this.map, first.x + dx, first.y + dy) === tile) {
        group.push({ x: first.x + dx, y: first.y + dy });
      }
    }
    const tops = group.flatMap((p) => this.mapRenderer.blockTopCenter(p.x, p.y) ?? []);
    if (tops.length === 0) return null;
    return {
      x: tops.reduce((sum, p) => sum + p.x, 0) / tops.length,
      y: Math.min(...tops.map((p) => p.y)),
    };
  }

  private findFirst(tile: Tile): { x: number; y: number } | null {
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        if (getTile(this.map, x, y) === tile) return { x, y };
      }
    }
    return null;
  }
}
