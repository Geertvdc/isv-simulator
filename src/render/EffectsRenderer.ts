import Phaser from 'phaser';
import type { GameEvent } from '../sim/orders';
import type { GameState } from '../sim/state';
import { effectsFor } from './effects';
import { OVERLAY_DEPTH } from './MapRenderer';
import { BODY_HEIGHT } from './PlayerRenderer';
import { TILE_SIZE, VIEW_PITCH, tileDepth, tileToScreen } from './projection';

/** Floating "+25" style popups. */
const POPUP_RISE = 48;
const POPUP_MS = 1000;

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
    for (const effect of effectsFor(state, events)) {
      switch (effect.kind) {
        case 'shake':
          this.shake(effect);
          break;
        case 'popup':
          this.popup(effect.at, effect.text, effect.color);
          break;
        case 'puff':
          this.puff(effect.at, effect.facing);
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
