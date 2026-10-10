import { describe, expect, it } from 'vitest';
import { MEETING_MISSED_PENALTY } from './balance';
import { MEETING_TITLES } from './content';
import { parseLevelMap } from './level';
import { type MeetingSchedule, levelWithMap } from './levels';
import { inMeetingRoom, inviteFor } from './meetings';
import { type GameState, createGame, getPlayer } from './state';
import { idle } from './testing';
import { tick } from './tick';

/** Meeting room on the right (columns 5 and 6); players start on the left. */
const MAP = parseLevelMap(['########', '#12..mm#', '#34..mm#', '########'].join('\n'));

const MEETINGS: MeetingSchedule = {
  firstTick: 50,
  intervalTicks: 600,
  jitterTicks: 100,
  timeLimitTicks: 300,
  attendTicks: 120,
};

function game(players = [1, 2], meetings: MeetingSchedule | null = MEETINGS): GameState {
  const state = createGame(levelWithMap(MAP, { meetings, durationTicks: 100_000 }), 5, players);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function moveTo(state: GameState, playerId: number, x: number, y: number): void {
  const p = getPlayer(state, playerId);
  if (!p) throw new Error(`No player ${playerId}`);
  p.pos = { x, y };
}

describe('invites', () => {
  it('go out on firstTick to one random player, with a title and a timer', () => {
    const state = game();
    idle(state, MEETINGS.firstTick);
    expect(state.invites).toEqual([]);
    tick(state, []);
    expect(state.invites).toHaveLength(1);
    const [invite] = state.invites;
    expect(invite).toMatchObject({
      createdTick: MEETINGS.firstTick,
      expiresTick: MEETINGS.firstTick + MEETINGS.timeLimitTicks,
      attendedTicks: 0,
      attendTicks: MEETINGS.attendTicks,
    });
    expect([1, 2]).toContain(invite?.playerId);
    expect(MEETING_TITLES).toContain(invite?.title);
    expect(state.events).toContainEqual({ type: 'inviteSent', invite });
  });

  it('never go out without a schedule, and never roll the RNG then', () => {
    const state = game([1, 2], null);
    const before = state.rngState;
    idle(state, 5000);
    expect(state.invites).toEqual([]);
    expect(state.nextMeetingTick).toBeNull();
    expect(state.rngState).toBe(before);
  });

  it('go to every player over time, one invite per player at most', () => {
    const state = game([1, 2, 3]);
    const invited = new Set<number>();
    for (let i = 0; i < 20_000; i++) {
      tick(state, []);
      for (const inv of state.invites) invited.add(inv.playerId);
      const ids = state.invites.map((inv) => inv.playerId);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(invited).toEqual(new Set([1, 2, 3]));
  });

  it('wait while every player has one', () => {
    const state = game([1], { ...MEETINGS, intervalTicks: 10, jitterTicks: 0 });
    idle(state, MEETINGS.firstTick + 100);
    expect(state.invites).toHaveLength(1);
  });

  it('never go out with less than their time limit left in the level', () => {
    const state = game();
    state.settings.durationTicks = MEETINGS.firstTick + MEETINGS.timeLimitTicks - 1;
    idle(state, MEETINGS.firstTick + 5);
    expect(state.invites).toEqual([]);
    expect(state.nextMeetingTick).toBeNull();
  });
});

describe('attending', () => {
  it('counts only the invited player standing on a meeting tile', () => {
    const state = game();
    idle(state, MEETINGS.firstTick + 1);
    const invite = state.invites[0];
    if (!invite) throw new Error('no invite');
    const other = invite.playerId === 1 ? 2 : 1;
    moveTo(state, other, 5, 1);
    idle(state, 30);
    expect(invite.attendedTicks).toBe(0);
    moveTo(state, invite.playerId, 6, 2);
    expect(inMeetingRoom(state, invite.playerId)).toBe(true);
    idle(state, 30);
    expect(invite.attendedTicks).toBe(30);
  });

  it('closes the invite after attendTicks in the room, keeping time across a step out', () => {
    const state = game();
    state.score = 50;
    idle(state, MEETINGS.firstTick + 1);
    const invite = state.invites[0];
    if (!invite) throw new Error('no invite');
    moveTo(state, invite.playerId, 5, 1);
    idle(state, MEETINGS.attendTicks / 2);
    moveTo(state, invite.playerId, 3, 1);
    idle(state, 20);
    moveTo(state, invite.playerId, 5, 1);
    let attended = false;
    for (let i = 0; i < MEETINGS.attendTicks / 2; i++) {
      tick(state, []);
      attended ||= state.events.some((e) => e.type === 'meetingAttended');
    }
    expect(attended).toBe(true);
    expect(inviteFor(state, invite.playerId)).toBeUndefined();
    expect(state.score).toBe(50);
  });

  it('a missed invite costs MEETING_MISSED_PENALTY', () => {
    const state = game();
    state.score = 50;
    idle(state, MEETINGS.firstTick + MEETINGS.timeLimitTicks);
    expect(state.events.find((e) => e.type === 'meetingMissed')).toMatchObject({
      penalty: MEETING_MISSED_PENALTY,
    });
    expect(state.score).toBe(50 - MEETING_MISSED_PENALTY);
    expect(state.invites).toEqual([]);
  });

  it('is deterministic per seed and stays plain JSON', () => {
    const run = (): GameState => {
      const state = game([1, 2, 3, 4]);
      idle(state, 5000);
      return state;
    };
    const state = run();
    expect(run()).toEqual(state);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
