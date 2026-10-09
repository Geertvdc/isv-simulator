/** Two players on one keyboard: a left and a right key scheme. */

import type { Controller, ControllerState, DeviceId } from './controller';

export interface KeyScheme {
  deviceId: DeviceId;
  up: readonly string[];
  down: readonly string[];
  left: readonly string[];
  right: readonly string[];
  interact: readonly string[];
  work: readonly string[];
  dash: readonly string[];
}

/** Keys are `KeyboardEvent.code` values, so they sit in the same place on any layout. */
export const LEFT_KEYS: KeyScheme = {
  deviceId: 'kb-left',
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  interact: ['KeyE'],
  work: ['KeyQ'],
  dash: ['ShiftLeft'],
};

export const RIGHT_KEYS: KeyScheme = {
  deviceId: 'kb-right',
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  interact: ['ShiftRight'],
  // Not Ctrl: right Ctrl plus the left player's W would close the tab.
  work: ['Slash'],
  // Option on a Mac keyboard.
  dash: ['AltRight'],
};

export const KEY_SCHEMES: readonly KeyScheme[] = [LEFT_KEYS, RIGHT_KEYS];

/** Shared by both schemes: joins the left one first, then the right one. */
export const JOIN_KEYS: readonly string[] = ['Enter', 'NumpadEnter'];
export const KEYBOARD_JOIN_GROUP = 'keyboard';

const GAME_KEYS = new Set(
  [
    ...KEY_SCHEMES.flatMap((s) => [s.up, s.down, s.left, s.right, s.interact, s.work, s.dash]),
    JOIN_KEYS,
  ].flat(),
);

/** Which keys are held, by `KeyboardEvent.code`. */
export class KeyboardState {
  private readonly held = new Set<string>();

  press(code: string): void {
    this.held.add(code);
  }

  release(code: string): void {
    this.held.delete(code);
  }

  /** Lets go of everything, e.g. when the window loses focus and key-ups get lost. */
  clear(): void {
    this.held.clear();
  }

  anyDown(codes: readonly string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  /** Listens on `target` until the returned function is called. */
  attach(target: Window): () => void {
    const down = (e: KeyboardEvent): void => {
      // Keeps arrows from scrolling and Enter from activating focused buttons.
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.press(e.code);
    };
    const up = (e: KeyboardEvent): void => {
      this.release(e.code);
    };
    const blur = (): void => {
      this.clear();
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }
}

/** One scheme's screen-relative state from the held keys. */
export function readKeyboard(keys: KeyboardState, scheme: KeyScheme): ControllerState {
  const axis = (neg: readonly string[], pos: readonly string[]): number =>
    (keys.anyDown(pos) ? 1 : 0) - (keys.anyDown(neg) ? 1 : 0);
  return {
    move: { x: axis(scheme.left, scheme.right), y: axis(scheme.up, scheme.down) },
    interact: keys.anyDown(scheme.interact),
    work: keys.anyDown(scheme.work),
    dash: keys.anyDown(scheme.dash),
    join: keys.anyDown(JOIN_KEYS),
  };
}

export class KeyboardController implements Controller {
  readonly deviceId: DeviceId;
  readonly joinGroup = KEYBOARD_JOIN_GROUP;

  constructor(
    private readonly keys: KeyboardState,
    private readonly scheme: KeyScheme,
  ) {
    this.deviceId = scheme.deviceId;
  }

  read(): ControllerState {
    return readKeyboard(this.keys, this.scheme);
  }
}
