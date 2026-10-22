/**
 * Which one-off visual reactions sim events get, shared by the 2D and 3D
 * looks: screen shake, floating point popups and dash puffs. Each look
 * decides how to draw them. Phaser-free, so it can be tested.
 */

import {
  MANAGER_BUMP_TEXTS,
  MEETING_DONE_TEXT,
  PIPELINE_FIXED_TEXT,
  SHOVE_TEXTS,
  TICKET_LOST_TEXT,
} from '../sim/content';
import { PIPELINE_FAIL_TICKS, PIPELINE_WARN_TICKS } from '../sim/balance';
import type { GameEvent } from '../sim/orders';
import { type GameState, type Vec, getPlayer } from '../sim/state';

/** Screen shakes: how long (ms) and how hard (share of the screen). */
export const SHAKE_PIPELINE_BROKE = { ms: 350, intensity: 0.012 };
export const SHAKE_ORDER_EXPIRED = { ms: 220, intensity: 0.006 };
export const SHAKE_SHOVE = { ms: 90, intensity: 0.003 };

export const POPUP_GAIN_COLOR = '#7cf07c';
export const POPUP_INFO_COLOR = '#ffffff';
export const POPUP_LOST_COLOR = '#ff8a7a';

export type Effect =
  | { kind: 'shake'; ms: number; intensity: number }
  /** Text that floats up from grid point `at`. */
  | { kind: 'popup'; at: Vec; text: string; color: string }
  /** Little clouds where a dash starts, drifting back from `facing`. */
  | { kind: 'puff'; at: Vec; facing: Vec };

/** The effects for the events from the ticks run this frame. */
export function effectsFor(state: GameState, events: readonly GameEvent[]): Effect[] {
  const out: Effect[] = [];
  const shake = (s: { ms: number; intensity: number }): void => {
    out.push({ kind: 'shake', ...s });
  };
  const popup = (at: Vec, text: string, color: string): void => {
    out.push({ kind: 'popup', at: { ...at }, text, color });
  };
  for (const event of events) {
    switch (event.type) {
      case 'orderShipped': {
        const player = getPlayer(state, event.playerId);
        if (player && event.points > 0) popup(player.pos, `+${event.points}`, POPUP_GAIN_COLOR);
        break;
      }
      // The HUD already says so by the score.
      case 'pipelineBroke':
        shake(SHAKE_PIPELINE_BROKE);
        break;
      case 'ticketLost':
        popup({ x: event.x, y: event.y }, TICKET_LOST_TEXT, POPUP_LOST_COLOR);
        shake(SHAKE_SHOVE);
        break;
      case 'pipelineRepaired':
        popup({ x: event.x, y: event.y }, PIPELINE_FIXED_TEXT, POPUP_GAIN_COLOR);
        break;
      case 'orderExpired':
        shake(SHAKE_ORDER_EXPIRED);
        break;
      // Production is down: everybody should notice.
      case 'orderCreated':
        if (event.order.kind === 'incident') shake(SHAKE_PIPELINE_BROKE);
        break;
      case 'dashed': {
        const player = getPlayer(state, event.playerId);
        if (player) out.push({ kind: 'puff', at: { ...player.pos }, facing: { ...player.facing } });
        break;
      }
      case 'shoved': {
        const target = getPlayer(state, event.target);
        const text = SHOVE_TEXTS[(state.tick + event.target) % SHOVE_TEXTS.length] ?? '';
        if (target) popup(target.pos, text, POPUP_INFO_COLOR);
        shake(SHAKE_SHOVE);
        break;
      }
      case 'meetingAttended': {
        const player = getPlayer(state, event.invite.playerId);
        if (player) popup(player.pos, MEETING_DONE_TEXT, POPUP_GAIN_COLOR);
        break;
      }
      case 'managerBumped': {
        const target = getPlayer(state, event.target);
        const manager = state.managers.find((m) => m.id === event.managerId);
        const lines = MANAGER_BUMP_TEXTS;
        const text = lines[(state.tick + event.target) % lines.length] ?? '';
        if (manager) popup(manager.pos, text, POPUP_INFO_COLOR);
        if (target) shake(SHAKE_SHOVE);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Warning pulses per second for a pipeline about to break; faster in the last half of the warning. */
const WARN_PULSE_HZ = 2;
const WARN_PULSE_HZ_LAST = 5;

/** How bright a pipeline's warning is now, 0 to 1, after its build waited `doneTicks`. */
export function pipelinePulse(doneTicks: number, timeMs: number): number {
  const lastHalf = doneTicks >= PIPELINE_FAIL_TICKS - PIPELINE_WARN_TICKS / 2;
  const hz = lastHalf ? WARN_PULSE_HZ_LAST : WARN_PULSE_HZ;
  return 0.5 + 0.5 * Math.sin((timeMs / 1000) * Math.PI * 2 * hz);
}
