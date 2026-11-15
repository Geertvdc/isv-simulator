/**
 * Meetings: a calendar invite pops up for one player, who has to go and
 * stand in the meeting room (`m` tiles) for a while before it runs out, or
 * lose points. Time sat in the room counts even after stepping out.
 */

import { MEETING_MISSED_PENALTY } from './balance';
import { MEETING_TITLES, meetingRoomName } from './content';
import type { GridPoint, LevelMap } from './level';
import type { BlockCheck } from './movement';
import { currentMarks } from './reorgs';
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
  /** The meeting room it's in: an index into `meetingRooms`. Only that room counts. */
  room: number;
}

const SIDES: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

const roomCache = new WeakMap<LevelMap, GridPoint[][]>();

/** The meeting rooms: `m` tiles that touch form one room. Rooms in reading order. */
export function meetingRooms(map: LevelMap): GridPoint[][] {
  const cached = roomCache.get(map);
  if (cached) return cached;
  const key = (p: GridPoint): number => p.y * map.width + p.x;
  const left = new Map(map.meetingTiles.map((t) => [key(t), t]));
  const rooms: GridPoint[][] = [];
  for (const start of map.meetingTiles) {
    if (!left.has(key(start))) continue;
    left.delete(key(start));
    const room: GridPoint[] = [];
    const todo = [start];
    for (let p = todo.pop(); p; p = todo.pop()) {
      room.push(p);
      for (const d of SIDES) {
        const next = left.get(key({ x: p.x + d.x, y: p.y + d.y }));
        if (!next) continue;
        left.delete(key(next));
        todo.push(next);
      }
    }
    rooms.push(room.sort((a, b) => key(a) - key(b)));
  }
  roomCache.set(map, rooms);
  return rooms;
}

/** The room tile (x, y) is in, or -1. */
export function roomAt(map: LevelMap, x: number, y: number): number {
  return meetingRooms(map).findIndex((room) => room.some((t) => t.x === x && t.y === y));
}

/** The name of meeting room `room` on this level (`content.ts`). */
export function roomName(state: GameState, room: number): string {
  return meetingRoomName(state.levelId, room);
}

/** Whether `playerId` stands in meeting room `room` (any room without one). */
export function inMeetingRoom(state: GameState, playerId: PlayerId, room?: number): boolean {
  const p = getPlayer(state, playerId);
  if (!p) return false;
  const at = roomAt(state.level, Math.round(p.pos.x), Math.round(p.pos.y));
  return at >= 0 && (room === undefined || at === room);
}

/** A meeting door (`d`), the room it opens into, and whether it's shut to others now. */
export interface MeetingDoor extends GridPoint {
  room: number;
  /** `free`: no invite for its room; `invited`: an invite for its room is open; `inSession`: the invited player is inside. */
  light: 'free' | 'invited' | 'inSession';
}

/** The meeting doors of the current layout and their lights. */
export function meetingDoors(state: GameState): MeetingDoor[] {
  return currentMarks(state)
    .filter((m) => m.kind === 'meetingDoor')
    .map((m) => {
      const room =
        SIDES.map((d) => roomAt(state.level, m.x + d.x, m.y + d.y)).find((r) => r >= 0) ?? -1;
      const invites = state.invites.filter((i) => i.room === room);
      const light = invites.some((i) => inMeetingRoom(state, i.playerId, room))
        ? 'inSession'
        : invites.length > 0
          ? 'invited'
          : 'free';
      return { x: m.x, y: m.y, room, light };
    });
}

/**
 * The meeting doors shut to `playerId` now: doors of a room in session that
 * they're not invited to. Leaving is always allowed: standing in the door or
 * the room, it's open.
 */
export function shutDoors(state: GameState, playerId: PlayerId): GridPoint[] {
  const p = getPlayer(state, playerId);
  if (!p) return [];
  const x = Math.round(p.pos.x);
  const y = Math.round(p.pos.y);
  const here = roomAt(state.level, x, y);
  return meetingDoors(state)
    .filter(
      (d) =>
        d.light === 'inSession' &&
        d.room !== here &&
        !(d.x === x && d.y === y) &&
        !state.invites.some((i) => i.room === d.room && i.playerId === playerId),
    )
    .map(({ x: dx, y: dy }) => ({ x: dx, y: dy }));
}

/** Shut meeting doors as a block check for moving `playerId`. */
export function doorBlocks(state: GameState, playerId: PlayerId): BlockCheck {
  const shut = shutDoors(state, playerId);
  if (shut.length === 0) return () => false;
  return (x, y) => shut.some((d) => d.x === x && d.y === y);
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
    if (!inMeetingRoom(state, invite.playerId, invite.room)) continue;
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
  // Back to back: with more than one room, each invite is for the next one.
  const rooms = Math.max(1, meetingRooms(state.level).length);
  const room = (state.nextInviteId - 1) % rooms;
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
    room,
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
