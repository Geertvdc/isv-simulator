import Phaser from 'phaser';
import { PIPELINE_FIXED_TEXT, SHOVE_TEXTS } from '../sim/content';
import type { GameEvent } from '../sim/orders';
import { type GameState, getPlayer } from '../sim/state';
import { OVERLAY_DEPTH } from './MapRenderer';
import { BODY_HEIGHT } from './PlayerRenderer';
import { TILE_SIZE, VIEW_PITCH, tileDepth, tileToScreen } from './projection';

/** Screen shakes: how long (ms) and how hard (share of the screen). */
const SHAKE_PIPELINE_BROKE = { ms: 350, intensity: 0.012 };
const SHAKE_ORDER_EXPIRED = { ms: 220, intensity: 0.006 };
const SHAKE_SHOVE = { ms: 90, intensity: 0.003 };

/** Floating "+25" style popups. */
const POPUP_RISE = 48;
const POPUP_MS = 1000;
const POPUP_GAIN_COLOR = '#7cf07c';
const POPUP_INFO_COLOR = '#ffffff';

/** Dust puffs behind a dash. */
const PUFF_COUNT = 4;
const PUFF_MS = 350;
const PUFF_COLOR = 0xd9d4c7;

/**
 * One-off visual reactions to sim events: screen shake, floating point
 * popups in the world and dash puffs. Visual only; nothing here touches state.
 */
export class EffectsRenderer {
  /** The screen shake setting: off keeps the camera still. */
  shakeEnabled = true;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Reacts to the events from the ticks run this frame. */
  play(state: GameState, events: readonly GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'orderShipped': {
          const player = getPlayer(state, event.playerId);
          if (player && event.points > 0) {
            this.popup(player.pos, `+${event.points}`, POPUP_GAIN_COLOR);
          }
          break;
        }
        // The HUD already says so by the score.
        case 'pipelineBroke':
          this.shake(SHAKE_PIPELINE_BROKE);
          break;
        case 'pipelineRepaired':
          this.popup({ x: event.x, y: event.y }, PIPELINE_FIXED_TEXT, POPUP_GAIN_COLOR);
          break;
        case 'orderExpired':
          this.shake(SHAKE_ORDER_EXPIRED);
          break;
        // Production is down: everybody should notice.
        case 'orderCreated':
          if (event.order.kind === 'incident') this.shake(SHAKE_PIPELINE_BROKE);
          break;
        case 'dashed': {
          const player = getPlayer(state, event.playerId);
          if (player) this.puff(player.pos, player.facing);
          break;
        }
        case 'shoved': {
          const target = getPlayer(state, event.target);
          const text = SHOVE_TEXTS[(state.tick + event.target) % SHOVE_TEXTS.length] ?? '';
          if (target) this.popup(target.pos, text, POPUP_INFO_COLOR);
          this.shake(SHAKE_SHOVE);
          break;
        }
        default:
          break;
      }
    }
  }

  private shake({ ms, intensity }: { ms: number; intensity: number }): void {
    if (!this.shakeEnabled) return;
    this.scene.cameras.main.shake(ms, intensity);
  }

  /** Text that floats up from grid point `at` and fades out. */
  private popup(at: { x: number; y: number }, text: string, color: string): void {
    const s = tileToScreen(at.x, at.y);
    const label = this.scene.add
      .text(s.x, s.y - BODY_HEIGHT, text, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(OVERLAY_DEPTH);
    this.scene.tweens.add({
      targets: label,
      y: label.y - POPUP_RISE,
      alpha: 0,
      ease: 'Cubic.easeIn',
      duration: POPUP_MS,
      onComplete: () => {
        label.destroy();
      },
    });
  }

  /** Little clouds left behind where a dash starts, drifting backwards. */
  private puff(at: { x: number; y: number }, facing: { x: number; y: number }): void {
    for (let i = 0; i < PUFF_COUNT; i++) {
      const spread = (i - (PUFF_COUNT - 1) / 2) * 0.25;
      const start = tileToScreen(at.x - facing.y * spread, at.y + facing.x * spread);
      const back = tileToScreen(-facing.x * 0.6, -facing.y * 0.6);
      const radius = TILE_SIZE * (0.1 + 0.03 * (i % 2));
      const cloud = this.scene.add
        .ellipse(start.x, start.y, radius * 2, radius * 2 * VIEW_PITCH * 1.4, PUFF_COLOR, 0.8)
        .setDepth(tileDepth(at.x, at.y));
      this.scene.tweens.add({
        targets: cloud,
        x: start.x + back.x,
        y: start.y + back.y,
        scale: 1.8,
        alpha: 0,
        duration: PUFF_MS,
        onComplete: () => {
          cloud.destroy();
        },
      });
    }
  }
}
