import { screenDirToGrid } from '../render/projection';
import type { InputCommand, PlayerId, Vec } from '../sim/state';
import type { ControllerState, DeviceId } from './controller';

/** Which device drives which player. */
export interface PlayerBinding {
  playerId: PlayerId;
  deviceId: DeviceId;
}

/**
 * Screen-relative move to a world direction, keeping analog strength:
 * a half-tilted stick walks at half speed.
 */
export function toWorldMove(screen: Vec): Vec {
  const strength = Math.min(1, Math.hypot(screen.x, screen.y));
  const dir = screenDirToGrid(screen);
  // `+ 0` turns -0 into 0 so callers and tests can compare with ===.
  return { x: dir.x * strength + 0, y: dir.y * strength + 0 };
}

/**
 * One input command per player for sim tick `tick`. A player whose device
 * has no reading (a disconnected pad) stands still.
 */
export function buildInputCommands(
  bindings: readonly PlayerBinding[],
  readings: ReadonlyMap<DeviceId, ControllerState>,
  tick: number,
): InputCommand[] {
  return bindings.map(({ playerId, deviceId }) => {
    const state = readings.get(deviceId);
    return {
      playerId,
      tick,
      move: state ? toWorldMove(state.move) : { x: 0, y: 0 },
      interact: state?.interact ?? false,
      work: state?.work ?? false,
      dash: state?.dash ?? false,
    };
  });
}
