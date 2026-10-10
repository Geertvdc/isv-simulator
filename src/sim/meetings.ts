/**
 * Meetings: a calendar invite pops up for one player, who has to go and
 * stand in the meeting room (`m` tiles) for a while before it runs out, or
 * lose points. Time sat in the room counts even after stepping out.
 */

import { MEETING_MISSED_PENALTY } from './balance';
import { MEETING_TITLES } from './content';
import type { GridPoint } from './level';
import * as rng from './rng';
import { type GameState, type PlayerId, getPlayer } from './state';

export interface Invite {
  id: number;
  playerId: PlayerId;
  /** Flavour only. */
  title: string;
  createdTick: number;
  expiresTick: number;
  /** Ticks the player has stood in the meeting room so far. */
  attendedTicks: number;
  /** Ticks they need in total. */
  attendTicks: number;
}

/** Whether `playerId` stands on a meeting room tile. */
export function inMeetingRoom(state: GameState, playerId: PlayerId): boolean {
  const p = getPlayer(state, playerId);
  if (!p) return false;
  const x = Math.round(p.pos.x);
  const y = Math.round(p.pos.y);
  return state.level.meetingTiles.some((t: GridPoint) => t.x === x && t.y === y);
}

export function inviteFor(state: GameState, playerId: PlayerId): Invite | undefined {
  return state.invites.find((i) => i.playerId === playerId);
}

/**
 * Per tick: time in the room counts toward each invite (finished ones close),
 * and the next invite goes out once it's due, to a random player without one.
 * Never with less than its time limit left in the level.
 */
export function updateMeetings(state: GameState): void {
  for (const invite of [...state.invites]) {
    if (!inMeetingRoom(state, invite.playerId)) continue;
    invite.attendedTicks++;
    if (invite.attendedTicks < invite.attendTicks) continue;
    state.invites = state.invites.filter((i) => i !== invite);
    state.events.push({ type: 'meetingAttended', invite });
  }

  const schedule = state.settings.meetings;
  if (!schedule || state.nextMeetingTick === null || state.tick < state.nextMeetingTick) return;
  if (state.settings.durationTicks - state.tick < schedule.timeLimitTicks) {
    state.nextMeetingTick = null;
    return;
  }
  const free = state.players.filter((p) => !inviteFor(state, p.id));
  if (free.length === 0) return;
  const [player, s1] = rng.pick(state.rngState, free);
  const [title, s2] = rng.pick(s1, MEETING_TITLES);
  const [jitter, s3] = rng.int(s2, -schedule.jitterTicks, schedule.jitterTicks);
  state.rngState = s3;
  const invite: Invite = {
    id: state.nextInviteId++,
    playerId: player.id,
    title,
    createdTick: state.tick,
    expiresTick: state.tick + schedule.timeLimitTicks,
    attendedTicks: 0,
    attendTicks: schedule.attendTicks,
  };
  state.invites.push(invite);
  state.events.push({ type: 'inviteSent', invite });
  state.nextMeetingTick = state.tick + schedule.intervalTicks + jitter;
}

/** Invites that ran out cost `MEETING_MISSED_PENALTY`. Runs after the tick counter moves on, like orders. */
export function expireInvites(state: GameState): void {
  for (const invite of state.invites.filter((i) => state.tick >= i.expiresTick)) {
    state.invites = state.invites.filter((i) => i !== invite);
    const penalty = Math.min(MEETING_MISSED_PENALTY, state.score);
    state.score -= penalty;
    state.events.push({ type: 'meetingMissed', invite, penalty });
  }
}
