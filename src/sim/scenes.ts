/**
 * Scenes: hand-built moments of a round, for the screenshots in `docs/game/`.
 * Each scene starts a quiet game (no orders, incidents or invites arrive on
 * their own), puts players, tickets and orders exactly where the shot needs
 * them, then plays a few ticks with scripted buttons and freezes: after a
 * fixed number of ticks, or as soon as the moment it waits for happens.
 * The game shows one with `?scene=<id>`. This module holds the scene type,
 * the building blocks and the runner; the scenes themselves live in
 * `sceneCatalog.ts`, whose test checks every scene still reaches its moment.
 */

import { type GridPoint, type Tile, getTile } from './level';
import { levelById } from './levels';
import type { Invite } from './meetings';
import { type GameEvent, createOrder } from './orders';
import {
  type GameState,
  type InputCommand,
  type PlayerId,
  type Vec,
  createGame,
  getPlayer,
} from './state';
import { tick } from './tick';
import type { RoleId, TicketDomain } from './roles';
import {
  DESIGNED_FEATURE_STEPS,
  REVIEWED_FEATURE_STEPS,
  TICKET_STEPS,
  type Ticket,
  type TicketKind,
} from './tickets';

export interface Scene {
  id: string;
  levelId: string;
  players: number;
  /** Explicit review-fixture setup, using the same validated creation path as rounds. */
  roleByPlayer?: Partial<Record<PlayerId, RoleId>>;
  /** Puts everything in place on a quiet game. */
  setup(state: GameState): void;
  /** Buttons for this tick; players without a command stand still. */
  input?(state: GameState): InputCommand[];
  /** Freeze as soon as this holds after a tick (checked with that tick's events)... */
  until?(state: GameState, events: readonly GameEvent[]): boolean;
  /** ...or after this many ticks. Scenes with `until` give up after `MAX_SCENE_TICKS`. */
  ticks?: number;
}

/** A scene with `until` that hasn't got there by now is broken. */
export const MAX_SCENE_TICKS = 600;

// ---- Building blocks ----

type Side = 'below' | 'above' | 'left' | 'right';

const SIDES: Readonly<Record<Side, Vec>> = {
  below: { x: 0, y: 1 },
  above: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** The `n`-th tile of a kind, in reading order. */
export function tileAt(state: GameState, tile: Tile, n = 0): GridPoint {
  const { level } = state;
  let seen = 0;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (getTile(level, x, y) === tile && seen++ === n) return { x, y };
    }
  }
  throw new Error(`No ${tile} #${n} on ${state.levelId}`);
}

/** Puts a player at `pos`, standing still, facing `facing`. */
export function stand(state: GameState, id: PlayerId, pos: Vec, facing: Vec): void {
  const p = getPlayer(state, id);
  if (!p) throw new Error(`No player ${id}`);
  p.pos = { ...pos };
  p.facing = { ...facing };
  p.vel = { x: 0, y: 0 };
}

/** Puts a player on the floor tile beside `target` (the first free side, or `side`), facing it. */
export function standBeside(state: GameState, id: PlayerId, target: GridPoint, side?: Side): void {
  const sides = side ? [side] : (Object.keys(SIDES) as Side[]);
  for (const s of sides) {
    const d = SIDES[s];
    const pos = { x: target.x + d.x, y: target.y + d.y };
    const taken = state.players.some((p) => p.id !== id && p.pos.x === pos.x && p.pos.y === pos.y);
    if (getTile(state.level, pos.x, pos.y) !== 'floor' || taken) continue;
    stand(state, id, pos, { x: -d.x, y: -d.y });
    return;
  }
  throw new Error(`No floor beside ${target.x},${target.y} on ${state.levelId}`);
}

/**
 * Opens an order with its ticket in the queue and returns the ticket.
 * `left` is the share of its time still left.
 */
export function openOrder(
  state: GameState,
  kind: TicketKind,
  title: string,
  {
    review = false,
    design = false,
    left = 0.8,
    domain,
  }: { review?: boolean; design?: boolean; left?: number; domain?: TicketDomain } = {},
): Ticket {
  const steps = review
    ? REVIEWED_FEATURE_STEPS
    : design
      ? DESIGNED_FEATURE_STEPS
      : TICKET_STEPS[kind];
  const order = createOrder(state, kind, title, steps, domain);
  const limit = order.expiresTick - order.createdTick;
  order.createdTick = state.tick - Math.round(limit * (1 - left));
  order.expiresTick = order.createdTick + limit;
  const ticket = state.tickets[state.tickets.length - 1];
  if (!ticket) throw new Error('createOrder made no ticket');
  return ticket;
}

/** The front end and back end waiting for a full-stack order just opened. */
export function fullstackParts(state: GameState): [Ticket, Ticket] {
  const front = state.tickets.filter((t) => t.kind === 'frontend').pop();
  const back = state.tickets.filter((t) => t.kind === 'backend').pop();
  if (!front || !back) throw new Error('No full-stack parts');
  return [front, back];
}

/** Finishes the ticket's first `done` steps and sets the next one to `progress`. */
export function workOn(ticket: Ticket, done: number, progress = 0): Ticket {
  ticket.steps.forEach((step, i) => {
    step.progress = i < done ? 1 : i === done ? progress : 0;
  });
  return ticket;
}

export function putOn(ticket: Ticket, at: GridPoint): void {
  ticket.location = { kind: 'tile', x: at.x, y: at.y };
}

export function give(ticket: Ticket, id: PlayerId): void {
  ticket.location = { kind: 'player', playerId: id };
}

/** Sends player `id` a calendar invite with `left` of its time left. */
export function invite(state: GameState, id: PlayerId, title: string, left = 0.8): Invite {
  const timeLimit = state.settings.meetings?.timeLimitTicks ?? 20 * 60;
  const created = state.tick - Math.round(timeLimit * (1 - left));
  const result: Invite = {
    id: state.nextInviteId++,
    playerId: id,
    title,
    createdTick: created,
    expiresTick: created + timeLimit,
    attendedTicks: 0,
    attendTicks: state.settings.meetings?.attendTicks ?? 4 * 60,
  };
  state.invites.push(result);
  return result;
}

export function command(
  state: GameState,
  id: PlayerId,
  buttons: Partial<InputCommand>,
): InputCommand {
  return {
    playerId: id,
    tick: state.tick,
    move: { x: 0, y: 0 },
    interact: false,
    work: false,
    dash: false,
    ...buttons,
  };
}

/** Every listed player holds work. */
export function holdWork(...ids: PlayerId[]) {
  return (state: GameState) => ids.map((id) => command(state, id, { work: true }));
}

/** Player `id` presses interact on the first tick only. */
export function pressOnce(id: PlayerId) {
  return (state: GameState) => [command(state, id, { interact: state.tick === 0 })];
}

// ---- The game a scene starts from ----

/** A fresh game of the scene's level with nothing arriving on its own; managers stand still. */
export function sceneState(scene: Scene): GameState {
  const level = levelById(scene.levelId);
  if (!level) throw new Error(`Scene ${scene.id}: no level ${scene.levelId}`);
  const ids = Array.from({ length: scene.players }, (_, i) => i + 1);
  const state = createGame(level, 1, ids, scene.roleByPlayer);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  state.nextIncidentTick = null;
  state.nextMeetingTick = null;
  for (const m of state.managers) m.waitTicks = MAX_SCENE_TICKS;
  scene.setup(state);
  state.events = [];
  return state;
}

/** This tick's buttons for a scene. */
export function sceneInputs(scene: Scene, state: GameState): InputCommand[] {
  return scene.input?.(state) ?? [];
}

/** Whether a scene that has run `ran` ticks should freeze now. */
export function sceneDone(scene: Scene, state: GameState, ran: number): boolean {
  if (scene.until) return scene.until(state, state.events) || ran >= MAX_SCENE_TICKS;
  return ran >= (scene.ticks ?? 0);
}

/** Plays a scene to its frozen moment, headless. Returns the state and whether `until` was met. */
export function runScene(scene: Scene): { state: GameState; reached: boolean } {
  const state = sceneState(scene);
  let ran = 0;
  while (!sceneDone(scene, state, ran)) {
    tick(state, sceneInputs(scene, state));
    ran++;
  }
  const reached = scene.until ? scene.until(state, state.events) : true;
  return { state, reached };
}
