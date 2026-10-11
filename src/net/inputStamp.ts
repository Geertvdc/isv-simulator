/**
 * Stamping this machine's inputs for the server. Each frame the client builds
 * one `InputCommand` per local player and stamps it with the server tick it
 * should land on (`inputTargetTick`). The server keeps at most one input per
 * player per tick, so:
 *
 * - A frame whose target tick is newer than the last one sent sends its
 *   commands stamped with it.
 * - A frame with the same (or an older) target tick sends nothing: on a
 *   144 Hz screen several frames share a tick. Presses (interact, dash) on
 *   such frames are kept and added to the next send, so a tap shorter than
 *   a tick is never lost.
 * - When the target tick drops by more than `NET_CLOCK_RESYNC_TICKS` (the
 *   clock sync started over), the stamper starts over too.
 *
 * Ticks skipped between two sends (a slow frame) need nothing: the server
 * repeats the last input until the next one.
 */

import { NET_CLOCK_RESYNC_TICKS } from '../sim/balance';
import type { InputCommand } from '../sim/state';

interface Latched {
  interact: boolean;
  dash: boolean;
}

export interface InputStamper {
  /** The newest tick inputs were sent for; `null` before the first send. */
  lastTick: number | null;
  /** Presses seen on frames that sent nothing, by player. */
  latched: Record<number, Latched>;
}

export function createInputStamper(): InputStamper {
  return { lastTick: null, latched: {} };
}

function latch(stamper: InputStamper, commands: readonly InputCommand[]): void {
  for (const c of commands) {
    const was = stamper.latched[c.playerId];
    stamper.latched[c.playerId] = {
      interact: (was?.interact ?? false) || c.interact,
      dash: (was?.dash ?? false) || c.dash,
    };
  }
}

/**
 * This frame's commands as they should go out: stamped with `targetTick`,
 * or none when this tick was already sent for. Copies the commands.
 */
export function stampInputs(
  stamper: InputStamper,
  commands: readonly InputCommand[],
  targetTick: number,
): InputCommand[] {
  const last = stamper.lastTick;
  if (last !== null && targetTick < last - NET_CLOCK_RESYNC_TICKS) {
    stamper.lastTick = null;
  } else if (last !== null && targetTick <= last) {
    latch(stamper, commands);
    return [];
  }
  stamper.lastTick = targetTick;
  const stamped = commands.map((c) => {
    const held = stamper.latched[c.playerId];
    return {
      ...c,
      tick: targetTick,
      move: { ...c.move },
      interact: c.interact || (held?.interact ?? false),
      dash: c.dash || (held?.dash ?? false),
    };
  });
  stamper.latched = {};
  return stamped;
}

/** Forgets everything: a new round, or the connection changed. */
export function resetInputStamper(stamper: InputStamper): void {
  stamper.lastTick = null;
  stamper.latched = {};
}
