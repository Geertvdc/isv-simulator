/**
 * Scenes: hand-built moments of a round, for the screenshots in `docs/game/`.
 * Each scene starts a quiet game (no orders, incidents or invites arrive on
 * their own), puts players, tickets and orders exactly where the shot needs
 * them, then plays a few ticks with scripted buttons and freezes: after a
 * fixed number of ticks, or as soon as the moment it waits for happens.
 * The game shows one with `?scene=<id>`; `scenes.test.ts` checks every scene
 * still reaches its moment.
 */

import { PIPELINE_FAIL_TICKS, PIPELINE_WARN_TICKS } from './balance';
import { type GridPoint, type Tile, getTile } from './level';
import { type Level, LEVELS, levelById, settingsForPlayers } from './levels';
import type { Invite } from './meetings';
import { type GameEvent, createOrder } from './orders';
import { pipelineAt } from './pipeline';
import {
  type GameState,
  type InputCommand,
  type PlayerId,
  type Vec,
  createGame,
  getPlayer,
} from './state';
import { tick } from './tick';
import { REVIEWED_FEATURE_STEPS, TICKET_STEPS, type Ticket, type TicketKind } from './tickets';

export interface Scene {
  id: string;
  levelId: string;
  players: number;
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
  { review = false, left = 0.8 }: { review?: boolean; left?: number } = {},
): Ticket {
  const steps = review ? REVIEWED_FEATURE_STEPS : TICKET_STEPS[kind];
  const order = createOrder(state, kind, title, steps);
  const limit = order.expiresTick - order.createdTick;
  order.createdTick = state.tick - Math.round(limit * (1 - left));
  order.expiresTick = order.createdTick + limit;
  const ticket = state.tickets[state.tickets.length - 1];
  if (!ticket) throw new Error('createOrder made no ticket');
  return ticket;
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

function command(state: GameState, id: PlayerId, buttons: Partial<InputCommand>): InputCommand {
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
function holdWork(...ids: PlayerId[]) {
  return (state: GameState) => ids.map((id) => command(state, id, { work: true }));
}

/** Player `id` presses interact on the first tick only. */
function pressOnce(id: PlayerId) {
  return (state: GameState) => [command(state, id, { interact: state.tick === 0 })];
}

// ---- The game a scene starts from ----

/** A fresh game of the scene's level with nothing arriving on its own; managers stand still. */
export function sceneState(scene: Scene): GameState {
  const level = levelById(scene.levelId);
  if (!level) throw new Error(`Scene ${scene.id}: no level ${scene.levelId}`);
  const ids = Array.from({ length: scene.players }, (_, i) => i + 1);
  const state = createGame(level, 1, ids);
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

// ---- Levels: everyone on their spawn, a few orders in ----

function levelScene(level: Level): Scene {
  return {
    id: `level-${level.id}`,
    levelId: level.id,
    players: 4,
    setup(state) {
      const first = openOrder(state, 'feature', 'Make the logo bigger', { left: 0.6 });
      openOrder(state, 'feature', 'Add dark mode', { left: 0.9 });
      if (settingsForPlayers(level, 4).reviewShare > 0) {
        openOrder(state, 'feature', 'Add AI to it', { review: true, left: 0.95 });
      }
      give(workOn(first, 1), 1);
    },
    ticks: 1,
  };
}

const has = (type: GameEvent['type']) => (_: GameState, events: readonly GameEvent[]) =>
  events.some((e) => e.type === type);

// ---- Every scene ----

export const SCENES: readonly Scene[] = [
  ...LEVELS.map(levelScene),

  {
    // The order bar with one of everything, an incident open and an invite out.
    id: 'orders',
    levelId: 'the-reorg',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Center a div', { left: 0.35 });
      openOrder(state, 'feature', 'Add AI to it', { review: true, left: 0.7 });
      openOrder(state, 'bug', 'Bug: Fix login button', { left: 0.55 });
      openOrder(state, 'feature', 'Make it pop', { left: 0.95 });
      openOrder(state, 'incident', "It's DNS", { left: 0.85 });
      invite(state, 2, 'Synergy workshop', 0.7);
    },
    ticks: 1,
  },
  {
    id: 'work-code',
    levelId: 'garage',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Fix typo in README');
      const keyboard = tileAt(state, 'keyboard');
      putOn(workOn(openOrder(state, 'feature', 'Center a div'), 0, 0.3), keyboard);
      standBeside(state, 1, keyboard);
    },
    input: holdWork(1),
    ticks: 30,
  },
  {
    id: 'work-test',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const bench = tileAt(state, 'testBench');
      putOn(workOn(openOrder(state, 'feature', 'Add dark mode'), 1, 0.3), bench);
      standBeside(state, 2, bench);
    },
    input: holdWork(2),
    ticks: 30,
  },
  {
    id: 'pipeline-build',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const pipeline = tileAt(state, 'pipeline');
      putOn(workOn(openOrder(state, 'feature', 'Bump dependencies'), 2, 0.55), pipeline);
      stand(state, 1, { x: pipeline.x - 3, y: pipeline.y }, { x: -1, y: 0 });
    },
    ticks: 1,
  },
  {
    // Two players hold work at the review station at the end of the hall.
    id: 'review',
    levelId: 'scale-up',
    players: 2,
    setup(state) {
      const review = tileAt(state, 'review');
      const ticket = openOrder(state, 'feature', 'Add AI to it', { review: true });
      putOn(workOn(ticket, 1, 0.3), review);
      standBeside(state, 1, review, 'left');
      standBeside(state, 2, review, 'right');
    },
    input: holdWork(1, 2),
    ticks: 30,
  },
  {
    // A finished build two seconds into its warning.
    id: 'pipeline-warning',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const at = tileAt(state, 'pipeline');
      putOn(workOn(openOrder(state, 'feature', 'Support Internet Explorer'), 3), at);
      const pipeline = pipelineAt(state, at.x, at.y);
      if (pipeline) pipeline.doneTicks = PIPELINE_FAIL_TICKS - PIPELINE_WARN_TICKS + 90;
    },
    ticks: 30,
  },
  {
    id: 'pipeline-broken',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const at = tileAt(state, 'pipeline');
      putOn(workOn(openOrder(state, 'feature', 'Support Internet Explorer'), 3), at);
      const pipeline = pipelineAt(state, at.x, at.y);
      if (pipeline) pipeline.doneTicks = PIPELINE_FAIL_TICKS - 5;
    },
    until: has('pipelineBroke'),
  },
  {
    // The build is out; a player holds work at the empty broken pipeline.
    id: 'pipeline-repair',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const at = tileAt(state, 'pipeline');
      const pipeline = pipelineAt(state, at.x, at.y);
      if (pipeline) {
        pipeline.broken = true;
        pipeline.repair = 0.2;
      }
      standBeside(state, 2, at);
      const ticket = workOn(openOrder(state, 'feature', 'Support Internet Explorer'), 3);
      give(ticket, 1);
      stand(state, 1, { x: at.x - 2, y: at.y + 1 }, { x: 1, y: 0 });
    },
    input: holdWork(2),
    until: (state) => state.pipelines.some((p) => p.broken && p.repair >= 0.5),
  },
  {
    id: 'ship',
    levelId: 'garage',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Add dark mode', { left: 0.4 });
      const ticket = workOn(openOrder(state, 'feature', 'Center a div', { left: 0.9 }), 3);
      give(ticket, 1);
      standBeside(state, 1, tileAt(state, 'ship'));
    },
    input: pressOnce(1),
    until: has('orderShipped'),
  },
  {
    // Tests skipped: code and pipeline done, the test never touched.
    id: 'yolo',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const ticket = openOrder(state, 'feature', 'Make it pop', { left: 0.9 });
      ticket.steps.forEach((s) => (s.progress = s.kind === 'test' ? 0 : 1));
      give(ticket, 1);
      standBeside(state, 1, tileAt(state, 'ship'));
    },
    input: pressOnce(1),
    until: has('orderShipped'),
  },
  {
    id: 'bug-queue',
    levelId: 'garage',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Rename variable x', { left: 0.5 });
      openOrder(state, 'bug', 'Bug: Make it pop', { left: 0.6 });
      openOrder(state, 'bug', 'Bug: Center a div', { left: 0.95 });
      stand(state, 1, { x: 6, y: 2 }, { x: 1, y: -1 });
    },
    ticks: 1,
  },
  {
    // Reproducing a bug: its first step is a test.
    id: 'bug-reproduce',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const bench = tileAt(state, 'testBench');
      putOn(workOn(openOrder(state, 'bug', 'Bug: Fix login button'), 0, 0.3), bench);
      standBeside(state, 1, bench);
    },
    input: holdWork(1),
    ticks: 30,
  },
  {
    id: 'incident',
    levelId: 'seed-round',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Upgrade to YAML 2', { left: 0.6 });
      openOrder(state, 'incident', 'Prod is down', { left: 0.9 });
    },
    ticks: 1,
  },
  {
    id: 'hotfix',
    levelId: 'seed-round',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Upgrade to YAML 2', { left: 0.5 });
      const keyboard = tileAt(state, 'keyboard');
      putOn(
        workOn(openOrder(state, 'incident', 'Database on fire', { left: 0.7 }), 0, 0.3),
        keyboard,
      );
      standBeside(state, 1, keyboard);
    },
    input: holdWork(1),
    ticks: 30,
  },
  {
    // The counter in the wall is full, so the ticket sails over it to player 2.
    id: 'throw',
    levelId: 'open-plan',
    players: 2,
    setup(state) {
      const y = 3;
      putOn(openOrder(state, 'feature', 'Fix flaky test'), { x: 6, y });
      give(workOn(openOrder(state, 'feature', 'Add dark mode'), 1), 1);
      stand(state, 1, { x: 4, y }, { x: 1, y: 0 });
      stand(state, 2, { x: 8, y }, { x: -1, y: 0 });
    },
    input: (state) => [command(state, 1, { interact: true })],
    until: (state) =>
      state.tickets.some((t) => t.location.kind === 'flying' && t.location.pos.x > 6.6),
  },
  {
    // The manager walks along the row, straight into player 1.
    id: 'manager',
    levelId: 'middle-management',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Remove console.log');
      const manager = state.managers[0];
      if (!manager) throw new Error('No manager');
      manager.pos = { x: 8, y: 7 };
      manager.facing = { x: -1, y: 0 };
      manager.waitTicks = 0;
      manager.path = [6, 5, 4, 3, 2].map((x) => ({ x, y: 7 }));
      give(workOn(openOrder(state, 'feature', 'Undo the last fix'), 1), 1);
      stand(state, 1, { x: 4, y: 7 }, { x: 1, y: 0 });
    },
    until: has('managerBumped'),
  },
  {
    id: 'meeting-invite',
    levelId: 'back-to-back',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Update copyright year');
      invite(state, 1, 'Mandatory fun', 0.9);
      stand(state, 1, { x: 6, y: 6 }, { x: 1, y: 0 });
    },
    input: (state) => [command(state, 1, { move: { x: 1, y: 0 } })],
    ticks: 12,
  },
  {
    // Halfway through the meeting, still holding a ticket.
    id: 'meeting-room',
    levelId: 'back-to-back',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Update copyright year');
      const room = state.level.meetingTiles[2];
      if (!room) throw new Error('No meeting room');
      invite(state, 1, 'Roadmap brainstorm', 0.6).attendedTicks = 100;
      give(workOn(openOrder(state, 'feature', 'Migrate to the cloud'), 1), 1);
      stand(state, 1, room, { x: 0, y: 1 });
    },
    ticks: 20,
  },
  {
    // The last ticks of a good round: the results screen follows.
    id: 'results',
    levelId: 'garage',
    players: 2,
    setup(state) {
      state.tick = state.settings.durationTicks - 2;
      state.score = 312;
    },
    until: (state) => state.result !== null,
  },
];

export function sceneById(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}
