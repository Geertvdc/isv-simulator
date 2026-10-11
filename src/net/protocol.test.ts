import { describe, expect, it } from 'vitest';
import { NET_MAX_INPUTS_PER_MESSAGE, NET_MAX_NAME_LENGTH } from '../sim/balance';
import {
  type ClientMessage,
  PROTOCOL_VERSION,
  decodeClientMessage,
  parseClientMessage,
} from './protocol';

const USER_ID = '3f1c2b9e-8d4a-4c7e-9b1a-2e5f6a7b8c9d';

const hello = {
  type: 'hello',
  protocol: PROTOCOL_VERSION,
  userId: USER_ID,
  displayName: 'Geert',
  localPlayers: 2,
};

const input = {
  playerId: 1,
  tick: 120,
  move: { x: 0.6, y: -0.8 },
  interact: true,
  work: false,
  dash: false,
};

const press = {
  deviceId: 'pad-0',
  joinGroup: 'pad-0',
  join: false,
  interact: true,
  dash: false,
  menu: false,
  nav: { x: 0, y: -1 },
};

function ok(raw: unknown): ClientMessage {
  const result = parseClientMessage(raw);
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result.value;
}

function reason(raw: unknown): string {
  const result = parseClientMessage(raw);
  if (result.ok) throw new Error('accepted');
  return result.reason;
}

describe('parseClientMessage', () => {
  it('accepts every valid message type', () => {
    expect(ok(hello)).toEqual(hello);
    expect(ok({ type: 'inputs', inputs: [input] })).toEqual({ type: 'inputs', inputs: [input] });
    expect(ok({ type: 'inputs', inputs: [] })).toEqual({ type: 'inputs', inputs: [] });
    expect(ok({ type: 'ping', id: 7, clientTimeMs: 1234.5 })).toEqual({
      type: 'ping',
      id: 7,
      clientTimeMs: 1234.5,
    });
    expect(ok({ type: 'menu', presses: [press] })).toEqual({ type: 'menu', presses: [press] });
  });

  it('drops fields it does not know', () => {
    const parsed = ok({ ...hello, admin: true, __proto__: { evil: 1 } });
    expect(Object.keys(parsed).sort()).toEqual(
      ['displayName', 'localPlayers', 'protocol', 'type', 'userId'].sort(),
    );
    const inputs = ok({ type: 'inputs', inputs: [{ ...input, score: 999 }] });
    expect(inputs).toEqual({ type: 'inputs', inputs: [input] });
  });

  it('trims the display name and refuses an empty one', () => {
    expect(ok({ ...hello, displayName: '  Ada  ' })).toMatchObject({ displayName: 'Ada' });
    expect(reason({ ...hello, displayName: '   ' })).toMatch(/displayName/);
  });

  it('scales a move longer than 1 down to length 1', () => {
    const parsed = ok({ type: 'inputs', inputs: [{ ...input, move: { x: 30, y: 40 } }] });
    expect(parsed).toEqual({ type: 'inputs', inputs: [{ ...input, move: { x: 0.6, y: 0.8 } }] });
  });

  it.each([
    ['not an object', 'hello'],
    ['null', null],
    ['an array', [hello]],
    ['an unknown type', { type: 'cheat' }],
    ['a missing type', { ...hello, type: undefined }],
    ['a wrong protocol type', { ...hello, protocol: '1' }],
    ['a user id with odd characters', { ...hello, userId: 'a b' }],
    ['an empty user id', { ...hello, userId: '' }],
    ['a too long user id', { ...hello, userId: 'a'.repeat(65) }],
    ['a too long name', { ...hello, displayName: 'x'.repeat(NET_MAX_NAME_LENGTH + 1) }],
    ['no local players', { ...hello, localPlayers: 0 }],
    ['too many local players', { ...hello, localPlayers: 5 }],
    ['fractional local players', { ...hello, localPlayers: 1.5 }],
    ['inputs that are not an array', { type: 'inputs', inputs: input }],
    [
      'too many inputs',
      {
        type: 'inputs',
        inputs: Array.from({ length: NET_MAX_INPUTS_PER_MESSAGE + 1 }, () => input),
      },
    ],
    ['a negative tick', { type: 'inputs', inputs: [{ ...input, tick: -1 }] }],
    ['a fractional tick', { type: 'inputs', inputs: [{ ...input, tick: 1.5 }] }],
    ['an unknown player', { type: 'inputs', inputs: [{ ...input, playerId: 9 }] }],
    ['a NaN move', { type: 'inputs', inputs: [{ ...input, move: { x: NaN, y: 0 } }] }],
    ['an infinite move', { type: 'inputs', inputs: [{ ...input, move: { x: Infinity, y: 0 } }] }],
    ['a missing move', { type: 'inputs', inputs: [{ ...input, move: undefined }] }],
    ['a string button', { type: 'inputs', inputs: [{ ...input, interact: 'yes' }] }],
    ['a ping without time', { type: 'ping', id: 1 }],
    ['a ping with a negative id', { type: 'ping', id: -1, clientTimeMs: 0 }],
    ['a menu nav step of 2', { type: 'menu', presses: [{ ...press, nav: { x: 2, y: 0 } }] }],
    ['a menu device id with a colon', { type: 'menu', presses: [{ ...press, deviceId: 'a:b' }] }],
  ])('rejects %s', (_name, raw) => {
    expect(reason(raw)).toEqual(expect.any(String));
  });

  it('says what was wrong', () => {
    expect(reason({ type: 'inputs', inputs: [input, { ...input, tick: -3 }] })).toMatch(
      /inputs\[1\]\.tick/,
    );
  });
});

describe('decodeClientMessage', () => {
  it('parses JSON text', () => {
    expect(decodeClientMessage(JSON.stringify(hello))).toEqual({ ok: true, value: hello });
  });

  it('rejects text that is not JSON', () => {
    expect(decodeClientMessage('{"type":')).toEqual({ ok: false, reason: 'not valid JSON' });
  });
});
