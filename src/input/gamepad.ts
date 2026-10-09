/** Gamepads via the browser Gamepad API, standard mapping. */

import { GAMEPAD_DEAD_ZONE } from '../sim/balance';
import type { Vec } from '../sim/state';
import type { Controller, ControllerState, DeviceId } from './controller';

export const MAX_GAMEPADS = 4;

/** The part of the browser's `Gamepad` we use, so tests can pass a fake. */
export interface GamepadLike {
  readonly connected: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean }[];
}

/** Button indices in the W3C standard gamepad layout (A/X are Xbox names). */
export const PAD_BUTTON = {
  a: 0,
  x: 2,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export function gamepadDeviceId(index: number): DeviceId {
  return `pad-${index}`;
}

export function isGamepadDevice(deviceId: DeviceId): boolean {
  return deviceId.startsWith('pad-');
}

/**
 * Radial dead zone: inside `GAMEPAD_DEAD_ZONE` the stick is centered; beyond
 * it the length is rescaled so the first bit of travel past it starts slow.
 */
export function applyDeadZone(x: number, y: number): Vec {
  const len = Math.hypot(x, y);
  if (len <= GAMEPAD_DEAD_ZONE) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - GAMEPAD_DEAD_ZONE) / (1 - GAMEPAD_DEAD_ZONE));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

/** A pad's screen-relative state, or `null` when it is missing or disconnected. */
export function readGamepad(pad: GamepadLike | null | undefined): ControllerState | null {
  if (!pad?.connected) return null;
  const held = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
  const dpad = {
    x: (held(PAD_BUTTON.dpadRight) ? 1 : 0) - (held(PAD_BUTTON.dpadLeft) ? 1 : 0),
    y: (held(PAD_BUTTON.dpadDown) ? 1 : 0) - (held(PAD_BUTTON.dpadUp) ? 1 : 0),
  };
  // Stick y is +1 when pushed down, which matches screen coordinates.
  const move =
    dpad.x !== 0 || dpad.y !== 0 ? dpad : applyDeadZone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
  const a = held(PAD_BUTTON.a);
  return { move, interact: a, work: held(PAD_BUTTON.x), join: a };
}

export class GamepadController implements Controller {
  readonly deviceId: DeviceId;
  readonly joinGroup: string;

  constructor(
    private readonly index: number,
    private readonly getPads: () => readonly (GamepadLike | null)[],
  ) {
    this.deviceId = gamepadDeviceId(index);
    this.joinGroup = this.deviceId;
  }

  read(): ControllerState | null {
    return readGamepad(this.getPads()[this.index]);
  }
}
