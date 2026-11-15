import { describe, expect, it } from 'vitest';
import backToBackDraft from '../../maps/drafts/back-to-back.txt?raw';
import { TICKS_PER_SECOND } from './balance';
import { botInput, createBot } from './bot';
import { meetingRoomName } from './content';
import { parseLevelMap } from './level';
import { BACK_TO_BACK, type MeetingSchedule, levelWithMap } from './levels';
import { inMeetingRoom, meetingDoors, meetingRooms, roomName, shutDoors } from './meetings';
import { type GameState, createGame } from './state';
import { cmd, idle } from './testing';
import { tick } from './tick';

const SECOND = TICKS_PER_SECOND;

/**
 * Two rooms: a walk-through room in the middle with a door on each side
 * (2,2 and 6,2), and a second room at the bottom right.
 */
const ROOMS = parseLevelMap(
  ['#########', '#..###..#', '#.dmmmd.#', '#..###..#', '#1234.mm#', '#########'].join('\n'),
);

const SCHEDULE: MeetingSchedule = {
  firstTick: 1,
  intervalTicks: 2 * SECOND,
  jitterTicks: 0,
  timeLimitTicks: 30 * SECOND,
  attendTicks: 4 * SECOND,
};

function game(players = [1, 2]): GameState {
  const state = createGame(levelWithMap(ROOMS, { meetings: SCHEDULE }), 7, players);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function put(state: GameState, id: number, x: number, y: number): void {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`no player ${id}`);
  p.pos = { x, y };
  p.vel = { x: 0, y: 0 };
}

describe('named meeting rooms', () => {
  it('groups touching meeting tiles into rooms, in reading order', () => {
    expect(meetingRooms(ROOMS).map((r) => r.length)).toEqual([3, 2]);
  });

  it('names rooms per level', () => {
    expect(meetingRoomName('back-to-back', 0)).toBe('Fishbowl');
    expect(meetingRoomName('back-to-back', 1)).toBe('Aquarium');
    expect(meetingRoomName('garage', 0)).toBe('Meeting room');
    expect(roomName(game(), 0)).toBe('Meeting room');
  });

  it('sends invites for each room in turn, and only that room counts', () => {
    const state = game([1, 2]);
    idle(state, 2 * SECOND + 2);
    expect(state.invites.map((i) => i.room)).toEqual([0, 1]);
    const first = state.invites[0];
    if (!first) throw new Error('no invite');
    const other = first.room === 0 ? { x: 6, y: 4 } : { x: 4, y: 2 };
    put(state, first.playerId, other.x, other.y);
    idle(state, 10);
    expect(first.attendedTicks).toBe(0);
    expect(inMeetingRoom(state, first.playerId)).toBe(true);
    expect(inMeetingRoom(state, first.playerId, first.room)).toBe(false);
  });
});

describe('meeting doors', () => {
  /** Player 1 invited to the middle room and sitting in it; player 2 outside its left door. */
  function inSession(): GameState {
    const state = game([1, 2]);
    state.settings.meetings = null;
    state.invites.push({
      id: 1,
      playerId: 1,
      title: 'Sync',
      createdTick: 0,
      expiresTick: 60 * SECOND,
      attendedTicks: 0,
      attendTicks: 30 * SECOND,
      room: 0,
    });
    put(state, 1, 4, 2);
    put(state, 2, 1, 2);
    return state;
  }

  it('lights green when free, amber with an invite open, red in session', () => {
    const state = inSession();
    expect(meetingDoors(state).map((d) => d.light)).toEqual(['inSession', 'inSession']);
    put(state, 1, 1, 1);
    expect(meetingDoors(state).map((d) => d.light)).toEqual(['invited', 'invited']);
    state.invites = [];
    expect(meetingDoors(state).map((d) => d.light)).toEqual(['free', 'free']);
  });

  it('shuts to everyone else while in session', () => {
    const state = inSession();
    expect(shutDoors(state, 2)).toEqual([
      { x: 2, y: 2 },
      { x: 6, y: 2 },
    ]);
    for (let i = 0; i < SECOND; i++) tick(state, [cmd(state, 2, { move: { x: 1, y: 0 } })]);
    expect(state.players[1]?.pos.x).toBeLessThan(1.6);
  });

  it('never shuts on the invited player, and lets anyone out', () => {
    const state = inSession();
    expect(shutDoors(state, 1)).toEqual([]);
    put(state, 2, 5, 2);
    expect(shutDoors(state, 2)).toEqual([]);
    for (let i = 0; i < SECOND; i++) tick(state, [cmd(state, 2, { move: { x: 1, y: 0 } })]);
    expect(state.players[1]?.pos.x).toBeGreaterThan(6.5);
  });
});

describe('Back to Back draft', () => {
  it('has the Fishbowl and the Aquarium, each with two doors, and bots attend and ship', () => {
    const map = parseLevelMap(backToBackDraft);
    expect(meetingRooms(map)).toHaveLength(2);
    const state = createGame({ ...BACK_TO_BACK, map }, 3, [1, 2, 3, 4]);
    expect(meetingDoors(state).map((d) => d.room)).toEqual([0, 0, 1, 1]);
    const bots = [1, 2, 3, 4].map((id) => createBot(id));
    let shipped = 0;
    let attended = 0;
    for (let i = 0; i < BACK_TO_BACK.durationTicks && !state.result; i++) {
      tick(
        state,
        bots.map((b) => botInput(state, b, bots)),
      );
      shipped += state.events.filter((e) => e.type === 'orderShipped').length;
      attended += state.events.filter((e) => e.type === 'meetingAttended').length;
    }
    expect(shipped).toBeGreaterThan(2);
    expect(attended).toBeGreaterThan(1);
  });
});
