import Phaser from 'phaser';
import { PIPELINE_FAIL_TICKS, PIPELINE_WARN_TICKS } from '../sim/balance';
import { type Pipeline, pipelineWarning } from '../sim/pipeline';
import type { GameState } from '../sim/state';
import { type MapRenderer, OVERLAY_DEPTH, vectors } from './MapRenderer';
import { type Point, tileDepth } from './projection';
import { drawProgressBar } from './TicketRenderer';

/** Placeholder looks until the art pass. */
const WARN_COLOR = 0xff3030;
/** Warning pulses per second; faster in the last half of the warning. */
const WARN_PULSE_HZ = 2;
const WARN_PULSE_HZ_LAST = 5;
const BROKEN_COLOR = 0x1a1d24;
const BROKEN_ALPHA = 0.65;
const SPARK_COLOR = 0xffd166;
const SMOKE_COLOR = 0x9aa3b5;
/** Above the block's top, under the ticket card on it. */
const OVERLAY_DEPTH_OFFSET = 0.012;
/** Repair bar above the block's top center. */
const REPAIR_BAR_LIFT = 16;
/** The "!" badge over a pipeline about to break, up and right of its top center. */
const BADGE_OFFSET = { x: 20, y: -26 };
const BADGE_RADIUS = 9;

/**
 * Draws pipeline state over the pipeline blocks: a pulsing red top while a
 * finished build is about to break it, a dark top with sparks and smoke
 * while broken, and a repair bar once someone is fixing it.
 */
export class PipelineRenderer {
  private readonly sprites = new Map<string, Phaser.GameObjects.Graphics>();
  /** Badges and repair bars, over everything so blocks and cards in front never hide them. */
  private readonly overlay: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapRenderer: MapRenderer,
  ) {
    this.overlay = scene.add.graphics().setDepth(OVERLAY_DEPTH);
  }

  sync(state: GameState, timeMs: number): void {
    this.overlay.clear();
    for (const pipeline of state.pipelines) {
      const key = `${pipeline.x},${pipeline.y}`;
      let g = this.sprites.get(key);
      if (!g) {
        g = this.scene.add
          .graphics()
          .setDepth(tileDepth(pipeline.x, pipeline.y) + OVERLAY_DEPTH_OFFSET);
        this.sprites.set(key, g);
      }
      this.draw(g, pipeline, timeMs / 1000);
    }
  }

  private draw(g: Phaser.GameObjects.Graphics, pipeline: Pipeline, t: number): void {
    g.clear();
    const top = this.mapRenderer.blockTop(pipeline.x, pipeline.y);
    const center = this.mapRenderer.blockTopCenter(pipeline.x, pipeline.y);
    if (!top || !center) return;
    drawPipelineState(g, this.overlay, top, center, pipeline, t);
  }
}

/**
 * Pipeline state over a block whose top face is `top`: into `g` for the top
 * itself, into `overlay` for the badge and repair bar. `t` is in seconds.
 */
export function drawPipelineState(
  g: Phaser.GameObjects.Graphics,
  overlay: Phaser.GameObjects.Graphics,
  top: Point[],
  center: Point,
  pipeline: Pipeline,
  t: number,
): void {
  if (pipelineWarning(pipeline)) {
    const lastHalf = pipeline.doneTicks >= PIPELINE_FAIL_TICKS - PIPELINE_WARN_TICKS / 2;
    const hz = lastHalf ? WARN_PULSE_HZ_LAST : WARN_PULSE_HZ;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * hz);
    g.fillStyle(WARN_COLOR, 0.25 + 0.5 * pulse);
    g.fillPoints(vectors(top), true);
    drawBadge(overlay, center.x + BADGE_OFFSET.x, center.y + BADGE_OFFSET.y, 0.4 + 0.6 * pulse);
    return;
  }
  if (!pipeline.broken) return;

  g.fillStyle(BROKEN_COLOR, BROKEN_ALPHA);
  g.fillPoints(vectors(top), true);
  // Smoke puffs drift up and fade; sparks blink in a fixed pattern.
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.8 + i / 3) % 1;
    g.fillStyle(SMOKE_COLOR, 0.6 * (1 - phase));
    g.fillCircle(center.x - 8 + i * 8, center.y - 6 - phase * 34, 5 + phase * 6);
  }
  const spark = Math.floor(t * 12);
  for (let i = 0; i < 4; i++) {
    if ((spark + i * 3) % 5 !== 0) continue;
    const angle = ((spark * 7 + i * 13) % 16) * (Math.PI / 8);
    g.lineStyle(2, SPARK_COLOR);
    g.lineBetween(
      center.x + Math.cos(angle) * 4,
      center.y - 4 + Math.sin(angle) * 3,
      center.x + Math.cos(angle) * 14,
      center.y - 4 + Math.sin(angle) * 9,
    );
  }
  if (pipeline.repair > 0) {
    drawProgressBar(overlay, center.x, center.y - REPAIR_BAR_LIFT, pipeline.repair);
  }
}

/** A red "!" in a circle centered on (x, y). */
function drawBadge(g: Phaser.GameObjects.Graphics, x: number, y: number, alpha: number): void {
  g.fillStyle(WARN_COLOR, alpha);
  g.fillCircle(x, y, BADGE_RADIUS);
  g.lineStyle(2, 0xffffff, alpha);
  g.strokeCircle(x, y, BADGE_RADIUS);
  g.fillStyle(0xffffff, alpha);
  g.fillRect(x - 1.5, y - 6, 3, 7);
  g.fillRect(x - 1.5, y + 3, 3, 3);
}
