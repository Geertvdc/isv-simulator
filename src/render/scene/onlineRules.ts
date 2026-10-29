import { type Flow, isRoundRunning } from '../../flow/flow';
import type { OnlineState } from '../../flow/online';
import type { NetConnection } from '../../net/client';
import { countdownEndTick } from '../../net/prediction';
import { encodeTicket } from '../../net/rejoin';

/**
 * The server tick the round's sim runs from, for prediction: while playing,
 * now; during the countdown, its end (on the room's clock); otherwise
 * (pause, results, a round that ended) it doesn't run.
 */
export function runsFrom(flow: Flow | null, serverTick: number, ended: boolean): number | null {
  if (!flow || ended) return null;
  if (isRoundRunning(flow)) return serverTick;
  if (flow.screen === 'countdown') return countdownEndTick(flow.countdownStartMs);
  return null;
}

/** What to do with this tab's rejoin ticket. */
export type TicketUpdate = { kind: 'keep' } | { kind: 'clear' } | { kind: 'save'; text: string };

/**
 * This tab's way back into the room: a fresh ticket while in it, kept as it
 * is while still on the way back in (for another reload), forgotten once out.
 */
export function ticketUpdate(
  online: OnlineState | null,
  connection: Pick<NetConnection, 'joinCode' | 'reconnectionToken'> | null,
  nowMs: number,
): TicketUpdate {
  if (online?.status === 'rejoining') return { kind: 'keep' };
  if (!online || !connection || online.status === 'closed') return { kind: 'clear' };
  return {
    kind: 'save',
    text: encodeTicket({
      joinCode: connection.joinCode,
      token: connection.reconnectionToken(),
      role: online.role,
      savedAtMs: nowMs,
    }),
  };
}
