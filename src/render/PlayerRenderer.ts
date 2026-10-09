import Phaser from 'phaser';
import { PLAYER_RADIUS } from '../sim/balance';
import type { PlayerId, Vec } from '../sim/state';
import type { GameLoop } from './GameLoop';
import { TILE_SIZE, VIEW_PITCH, tileDepth, tileToScreen } from './projection';

/** Placeholder developers until the art pass: a capsule with a nose showing `facing`. */
const PLAYER_COLORS: readonly number[] = [0xff6b6b, 0x4fc3f7, 0xffd166, 0x9ccc65];
const OUTLINE_COLOR = 0x1a1d24;
const SHADOW_ALPHA = 0.35;

const BODY_WIDTH = PLAYER_RADIUS * 2 * TILE_SIZE * 0.8;
const BODY_HEIGHT = TILE_SIZE * 0.7;
const NOSE_RADIUS = TILE_SIZE * 0.08;
/** How far the nose sticks out from the body's center, in tiles. */
const NOSE_REACH = PLAYER_RADIUS * 0.85;
/** Height of the nose above the floor. */
const NOSE_HEIGHT = BODY_HEIGHT * 0.72;
/** Draws a player over a block on the same row; blocks in front still cover it. */
const PLAYER_DEPTH_OFFSET = 0.02;

/**
 * Syncs one Graphics per player, keyed by player id. Positions come from the
 * game loop's interpolation so movement looks smooth at any frame rate.
 */
export class PlayerRenderer {
  private readonly sprites = new Map<PlayerId, Phaser.GameObjects.Graphics>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(loop: GameLoop): void {
    const seen = new Set<PlayerId>();
    loop.state.players.forEach((player, index) => {
      const pos = loop.renderPos(player.id);
      if (!pos) return;
      seen.add(player.id);
      let g = this.sprites.get(player.id);
      if (!g) {
        g = this.scene.add.graphics();
        this.sprites.set(player.id, g);
      }
      const screen = tileToScreen(pos.x, pos.y);
      g.setPosition(screen.x, screen.y).setDepth(tileDepth(pos.x, pos.y) + PLAYER_DEPTH_OFFSET);
      draw(g, PLAYER_COLORS[index % PLAYER_COLORS.length] ?? 0xffffff, player.facing);
    });

    for (const [id, g] of this.sprites) {
      if (seen.has(id)) continue;
      g.destroy();
      this.sprites.delete(id);
    }
  }
}

function draw(g: Phaser.GameObjects.Graphics, color: number, facing: Vec): void {
  g.clear();

  const shadowW = PLAYER_RADIUS * 2 * TILE_SIZE;
  g.fillStyle(0x000000, SHADOW_ALPHA);
  g.fillEllipse(0, 0, shadowW, shadowW * VIEW_PITCH);

  const nose = tileToScreen(facing.x * NOSE_REACH, facing.y * NOSE_REACH);
  const drawNose = (): void => {
    g.fillStyle(0xffffff);
    g.lineStyle(2, OUTLINE_COLOR);
    g.fillCircle(nose.x, nose.y - NOSE_HEIGHT, NOSE_RADIUS);
    g.strokeCircle(nose.x, nose.y - NOSE_HEIGHT, NOSE_RADIUS);
  };

  // Facing away from the camera: the body hides the nose.
  const noseBehind = nose.y < 0;
  if (noseBehind) drawNose();
  g.fillStyle(color);
  g.lineStyle(2, OUTLINE_COLOR);
  g.fillRoundedRect(-BODY_WIDTH / 2, -BODY_HEIGHT, BODY_WIDTH, BODY_HEIGHT, BODY_WIDTH / 2 - 1);
  g.strokeRoundedRect(-BODY_WIDTH / 2, -BODY_HEIGHT, BODY_WIDTH, BODY_HEIGHT, BODY_WIDTH / 2 - 1);
  if (!noseBehind) drawNose();
}
