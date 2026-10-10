/**
 * The device-agnostic face of every input device. Controllers report
 * screen-relative directions; `commands.ts` turns them into world directions.
 */

import { MENU_STICK_THRESHOLD } from '../sim/balance';
import type { Vec } from '../sim/state';

/** Stable name for one input device: `kb-left`, `kb-right`, `pad-0` to `pad-3`. */
export type DeviceId = string;

/** What one device asks for right now. */
export interface ControllerState {
  /** Screen-relative: +x is right, +y is down on screen. Length 0 to about 1. */
  move: Vec;
  interact: boolean;
  work: boolean;
  dash: boolean;
  join: boolean;
  /** Escape or Start: pause, and back in menus. */
  menu: boolean;
}

export interface Controller {
  readonly deviceId: DeviceId;
  /**
   * Devices that share one join button. Both keyboard schemes join with
   * Enter, so one press must only join one of them.
   */
  readonly joinGroup: string;
  /** The device's state this frame, or `null` while it is disconnected. */
  read(): ControllerState | null;
}

export interface DeviceReading {
  deviceId: DeviceId;
  joinGroup: string;
  state: ControllerState;
}

/** Buttons that went down this frame on one device. */
export interface DevicePress {
  deviceId: DeviceId;
  joinGroup: string;
  join: boolean;
  interact: boolean;
  dash: boolean;
  menu: boolean;
  /** A menu step: -1, 0 or 1 per screen axis, when the stick, D-pad or keys were just pushed that way. */
  nav: Vec;
}

interface Held {
  join: boolean;
  interact: boolean;
  dash: boolean;
  menu: boolean;
  nav: Vec;
}

/** -1, 0 or 1: which way `v` is pushed, if far enough to count in a menu. */
function navStep(v: number): number {
  return Math.abs(v) >= MENU_STICK_THRESHOLD ? Math.sign(v) : 0;
}

export const IDLE: Readonly<ControllerState> = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  interact: false,
  work: false,
  dash: false,
  join: false,
  menu: false,
});

/**
 * Turns held buttons into presses: a button counts once, on the frame it goes
 * down. Stick and D-pad directions count once per push, for menus.
 */
export class PressTracker {
  private held = new Map<DeviceId, Held>();

  update(readings: readonly DeviceReading[]): DevicePress[] {
    const presses: DevicePress[] = [];
    const next = new Map<DeviceId, Held>();
    for (const { deviceId, joinGroup, state } of readings) {
      const was = this.held.get(deviceId);
      const now: Held = {
        join: state.join,
        interact: state.interact,
        dash: state.dash,
        menu: state.menu,
        nav: { x: navStep(state.move.x), y: navStep(state.move.y) },
      };
      const step = (axis: 'x' | 'y'): number =>
        now.nav[axis] !== (was?.nav[axis] ?? 0) ? now.nav[axis] : 0;
      const press: DevicePress = {
        deviceId,
        joinGroup,
        join: now.join && !was?.join,
        interact: now.interact && !was?.interact,
        dash: now.dash && !was?.dash,
        menu: now.menu && !was?.menu,
        nav: { x: step('x'), y: step('y') },
      };
      next.set(deviceId, now);
      if (
        press.join ||
        press.interact ||
        press.dash ||
        press.menu ||
        press.nav.x !== 0 ||
        press.nav.y !== 0
      ) {
        presses.push(press);
      }
    }
    this.held = next;
    return presses;
  }
}
