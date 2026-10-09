import {
  type Controller,
  type ControllerState,
  type DeviceId,
  type DevicePress,
  type DeviceReading,
  PressTracker,
} from './controller';
import { GamepadController, MAX_GAMEPADS } from './gamepad';
import { KEY_SCHEMES, KeyboardController, KeyboardState } from './keyboard';

export interface InputFrame {
  /** Connected devices only. */
  readings: Map<DeviceId, ControllerState>;
  presses: DevicePress[];
}

/** Every local input device: both keyboard schemes and up to four gamepads. */
export class InputDevices {
  private readonly keys = new KeyboardState();
  private readonly tracker = new PressTracker();
  private readonly controllers: Controller[];
  private readonly detach: () => void;

  constructor(win: Window) {
    this.detach = this.keys.attach(win);
    const getPads = (): readonly (Gamepad | null)[] =>
      typeof win.navigator.getGamepads === 'function' ? win.navigator.getGamepads() : [];
    this.controllers = [
      ...KEY_SCHEMES.map((scheme) => new KeyboardController(this.keys, scheme)),
      ...Array.from({ length: MAX_GAMEPADS }, (_, i) => new GamepadController(i, getPads)),
    ];
  }

  /** Reads every device once; call once per frame. */
  poll(): InputFrame {
    const list: DeviceReading[] = [];
    for (const c of this.controllers) {
      const state = c.read();
      if (state) list.push({ deviceId: c.deviceId, joinGroup: c.joinGroup, state });
    }
    return {
      readings: new Map(list.map((r) => [r.deviceId, r.state])),
      presses: this.tracker.update(list),
    };
  }

  destroy(): void {
    this.detach();
  }
}
