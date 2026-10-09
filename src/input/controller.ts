/**
 * The device-agnostic face of every input device. Controllers report
 * screen-relative directions; `commands.ts` turns them into world directions.
 */

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
}

export const IDLE: Readonly<ControllerState> = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  interact: false,
  work: false,
  dash: false,
  join: false,
});

/** Turns held buttons into presses: a button counts once, on the frame it goes down. */
export class PressTracker {
  private held = new Map<DeviceId, { join: boolean; interact: boolean }>();

  update(readings: readonly DeviceReading[]): DevicePress[] {
    const presses: DevicePress[] = [];
    const next = new Map<DeviceId, { join: boolean; interact: boolean }>();
    for (const { deviceId, joinGroup, state } of readings) {
      const was = this.held.get(deviceId);
      const join = state.join && !was?.join;
      const interact = state.interact && !was?.interact;
      next.set(deviceId, { join: state.join, interact: state.interact });
      if (join || interact) presses.push({ deviceId, joinGroup, join, interact });
    }
    this.held = next;
    return presses;
  }
}
