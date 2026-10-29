import { describe, expect, it } from 'vitest';
import { createFlow } from '../../flow/flow';
import { createOnline, createRejoin, onlineConnected } from '../../flow/online';
import { countdownEndTick } from '../../net/prediction';
import { parseTicket } from '../../net/rejoin';
import { runsFrom, ticketUpdate } from './onlineRules';

describe('runsFrom', () => {
  it('runs from now while playing', () => {
    const flow = createFlow();
    flow.screen = 'playing';
    expect(runsFrom(flow, 42, false)).toBe(42);
  });

  it('runs from the countdown end during the countdown', () => {
    const flow = createFlow();
    flow.screen = 'countdown';
    flow.countdownStartMs = 1000;
    expect(runsFrom(flow, 5, false)).toBe(countdownEndTick(1000));
  });

  it("doesn't run without a flow, once ended, or paused", () => {
    const flow = createFlow();
    flow.screen = 'playing';
    expect(runsFrom(null, 5, false)).toBeNull();
    expect(runsFrom(flow, 5, true)).toBeNull();
    flow.screen = 'paused';
    expect(runsFrom(flow, 5, false)).toBeNull();
  });
});

describe('ticketUpdate', () => {
  const connection = { joinCode: 'ABCD', reconnectionToken: () => 'ABCD:tok' };

  it('keeps the ticket while rejoining', () => {
    expect(ticketUpdate(createRejoin('join', 'ABCD'), null, 0)).toEqual({ kind: 'keep' });
  });

  it('clears it out of a room, without a connection, or once closed', () => {
    expect(ticketUpdate(null, connection, 0)).toEqual({ kind: 'clear' });
    expect(ticketUpdate(createOnline('host'), null, 0)).toEqual({ kind: 'clear' });
    const closed = createOnline('host');
    closed.status = 'closed';
    expect(ticketUpdate(closed, connection, 0)).toEqual({ kind: 'clear' });
  });

  it('saves a ticket that parses back while connected', () => {
    const online = createOnline('join');
    onlineConnected(online, 'session', 'ABCD');
    const update = ticketUpdate(online, connection, 1000);
    expect(update.kind).toBe('save');
    if (update.kind !== 'save') return;
    expect(parseTicket(update.text, 1000)).toEqual({
      joinCode: 'ABCD',
      token: 'ABCD:tok',
      role: 'join',
      savedAtMs: 1000,
    });
  });
});
