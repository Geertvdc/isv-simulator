import { describe, expect, it } from 'vitest';
import { NET_RECONNECT_GRACE_MS } from '../sim/balance';
import { type RejoinTicket, encodeTicket, parseTicket } from './rejoin';

const ticket: RejoinTicket = {
  joinCode: 'ABCD',
  token: 'ABCD:x7_Kq-2',
  role: 'join',
  savedAtMs: 1_000_000,
};

describe('rejoin ticket', () => {
  it('round-trips', () => {
    expect(parseTicket(encodeTicket(ticket), ticket.savedAtMs + 500)).toEqual(ticket);
  });

  it('is only worth trying within the grace period', () => {
    const text = encodeTicket(ticket);
    expect(parseTicket(text, ticket.savedAtMs + NET_RECONNECT_GRACE_MS)).toEqual(ticket);
    expect(parseTicket(text, ticket.savedAtMs + NET_RECONNECT_GRACE_MS + 1)).toBeNull();
    // A clock that went back: don't trust it.
    expect(parseTicket(text, ticket.savedAtMs - 1)).toBeNull();
  });

  it('turns down anything malformed', () => {
    const now = ticket.savedAtMs;
    const bad = (patch: Record<string, unknown>): string => JSON.stringify({ ...ticket, ...patch });
    expect(parseTicket(null, now)).toBeNull();
    expect(parseTicket('', now)).toBeNull();
    expect(parseTicket('{', now)).toBeNull();
    expect(parseTicket('null', now)).toBeNull();
    expect(parseTicket('[]', now)).toBeNull();
    expect(parseTicket(bad({ joinCode: 'abcd' }), now)).toBeNull();
    expect(parseTicket(bad({ joinCode: 'ABIO' }), now)).toBeNull();
    expect(parseTicket(bad({ token: 'no-colon' }), now)).toBeNull();
    expect(parseTicket(bad({ token: 'WXYZ:other-room' }), now)).toBeNull();
    expect(parseTicket(bad({ token: 'ABCD:<script>' }), now)).toBeNull();
    expect(parseTicket(bad({ role: 'admin' }), now)).toBeNull();
    expect(parseTicket(bad({ savedAtMs: '1000000' }), now)).toBeNull();
    expect(parseTicket(bad({ savedAtMs: null }), now)).toBeNull();
  });
});
