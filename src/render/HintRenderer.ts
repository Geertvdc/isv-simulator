import Phaser from 'phaser';
import type { HintId } from '../flow/hints';
import { HINT_TEXTS } from '../sim/content';
import type { LevelMap, Tile } from '../sim/level';
import { type MapRenderer, OVERLAY_DEPTH } from './MapRenderer';
import { HINT_TILES, createHintMarker, hintLabelOrigin } from './billboards';
import { firstGroup } from './mapShape';

/** How far over the block top the arrow tip floats, and how far it bobs. */
const ARROW_LIFT = 10;
const BOB_PX = 6;
const BOB_MS = 700;

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
    const container = createHintMarker(
      this.scene,
      HINT_TEXTS[id],
      hintLabelOrigin(at.tileX, this.map),
    )
      .setPosition(at.x, at.y - ARROW_LIFT)
      .setDepth(OVERLAY_DEPTH + 1);
    return { container, baseY: at.y - ARROW_LIFT };
  }

  /** The middle of the top of the first group of `tile` blocks on the map. */
  private anchor(tile: Tile): { x: number; y: number; tileX: number } | null {
    const group = firstGroup(this.map, tile);
    const first = group[0];
    if (!first) return null;
    const tops = group.flatMap((p) => this.mapRenderer.blockTopCenter(p.x, p.y) ?? []);
    if (tops.length === 0) return null;
    return {
      tileX: first.x,
      x: tops.reduce((sum, p) => sum + p.x, 0) / tops.length,
      y: Math.min(...tops.map((p) => p.y)),
    };
  }
}
