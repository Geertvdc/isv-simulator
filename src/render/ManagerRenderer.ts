import Phaser from 'phaser';
import { MANAGER_RADIUS } from '../sim/balance';
import type { Vec } from '../sim/state';
import type { GameLoop } from './GameLoop';
import { PLAYER_DEPTH_OFFSET } from './PlayerRenderer';
import { TILE_SIZE, VIEW_PITCH, tileDepth, tileToScreen } from './projection';

/** Placeholder manager until the art pass: a taller capsule in a suit and tie. */
const SUIT_COLOR = 0x3b3f4a;
const SHIRT_COLOR = 0xf4f1e8;
const TIE_COLOR = 0xd2322d;
const OUTLINE_COLOR = 0x1a1d24;
const SHADOW_ALPHA = 0.4;
const BODY_WIDTH = MANAGER_RADIUS * 2 * TILE_SIZE * 0.8;
const BODY_HEIGHT = TILE_SIZE * 0.85;
/** Bobs up and down this many pixels while walking. */
const WALK_BOB = 2;
const WALK_BOB_MS = 180;

/** Syncs one Graphics per manager, keyed by manager id. */
export class ManagerRenderer {
  private readonly sprites = new Map<number, Phaser.GameObjects.Graphics>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(loop: GameLoop, timeMs: number): void {
    const seen = new Set<number>();
    for (const manager of loop.state.managers) {
      const pos = loop.renderManagerPos(manager.id);
      if (!pos) continue;
      seen.add(manager.id);
      let g = this.sprites.get(manager.id);
      if (!g) {
        g = this.scene.add.graphics();
        this.sprites.set(manager.id, g);
      }
      const screen = tileToScreen(pos.x, pos.y);
      const bob = manager.walking ? Math.abs(Math.sin(timeMs / WALK_BOB_MS)) * WALK_BOB : 0;
      g.setPosition(screen.x, screen.y).setDepth(tileDepth(pos.x, pos.y) + PLAYER_DEPTH_OFFSET);
      drawManager(g, manager.facing, bob);
    }
    for (const [id, g] of this.sprites) {
      if (seen.has(id)) continue;
      g.destroy();
      this.sprites.delete(id);
    }
  }
}

/** A manager with its feet at (0, 0); the shirt and tie show when facing the camera. */
function drawManager(g: Phaser.GameObjects.Graphics, facing: Vec, bob: number): void {
  g.clear();
  const shadowW = MANAGER_RADIUS * 2 * TILE_SIZE;
  g.fillStyle(0x000000, SHADOW_ALPHA);
  g.fillEllipse(0, 0, shadowW, shadowW * VIEW_PITCH);

  const top = -BODY_HEIGHT - bob;
  g.fillStyle(SUIT_COLOR);
  g.lineStyle(2, OUTLINE_COLOR);
  g.fillRoundedRect(-BODY_WIDTH / 2, top, BODY_WIDTH, BODY_HEIGHT, BODY_WIDTH / 2 - 1);
  g.strokeRoundedRect(-BODY_WIDTH / 2, top, BODY_WIDTH, BODY_HEIGHT, BODY_WIDTH / 2 - 1);

  // Facing away from the camera: only the back of the suit shows.
  const front = tileToScreen(facing.x, facing.y).y >= 0;
  if (!front) return;
  const shift = tileToScreen(facing.x, 0).x * 0.15;
  const collarY = top + BODY_HEIGHT * 0.32;
  g.fillStyle(SHIRT_COLOR);
  g.fillTriangle(shift - 9, collarY, shift + 9, collarY, shift, collarY + 16);
  g.fillStyle(TIE_COLOR);
  g.fillTriangle(shift - 3, collarY + 2, shift + 3, collarY + 2, shift, collarY + 26);
  // Eyes, looking busy.
  g.fillStyle(0xffffff);
  g.fillCircle(shift - 6, top + 12, 3.5);
  g.fillCircle(shift + 6, top + 12, 3.5);
  g.fillStyle(OUTLINE_COLOR);
  g.fillCircle(shift - 6 + facing.x * 1.5, top + 12, 1.6);
  g.fillCircle(shift + 6 + facing.x * 1.5, top + 12, 1.6);
}
