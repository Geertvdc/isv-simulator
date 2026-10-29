/**
 * Scripted bots for headless tuning runs and scenario tests. Each bot takes
 * one ticket at a time from a queue and walks it through every station
 * itself (shortest path, then work), ships it and goes back for the next.
 * Bugs first, since their timers are shorter. Bots that skip tests go
 * straight from code to pipeline and ship untested. A bot whose ticket is
 * stuck on a broken pipeline takes it out and repairs the pipeline. A
 * ticket waiting for review gets a second bot to help: any bot with nothing
 * better to do (empty hands, a build running, or no free station for what
 * it carries) goes and works the review station with the owner.
 * Incident hotfixes come first in the bug queue, so bots take them first.
 * Tickets whose order expired go straight in the bin.
 * Bots plan their walks around managers, and an invited bot drops
 * everything (but keeps carrying) and stands in the meeting room.
 */

import { type GridPoint } from './level';
import { managerTiles } from './manager';
import { pathTo } from './path';
import { type GameState, type InputCommand, type PlayerId, getPlayer, targetTile } from './state';
import { chooseGoal } from './botGoals';
import { currentTile, findPath, samePoint } from './botNav';

/** How far off a tile's center line a bot may stand before it recenters to face a station. */
const CENTER_SLACK = 0.2;

export interface Bot {
  playerId: PlayerId;
  /** The ticket this bot is looking after, wherever it is. */
  ticketId: number | null;
  /** The station this bot is about to put its ticket on, so other bots leave it free. */
  dropTarget: GridPoint | null;
  /** The review station this bot is helping at, so no more bots than needed come. */
  helping: GridPoint | null;
  /** Interact was sent last tick: presses need a release in between. */
  interactWas: boolean;
  skipTests: boolean;
  assignmentPolicy: BotAssignmentPolicy;
}

export type BotAssignmentPolicy = 'role-neutral' | 'role-aware';

export function createBot(
  playerId: PlayerId,
  skipTests = false,
  assignmentPolicy: BotAssignmentPolicy = 'role-neutral',
): Bot {
  return {
    playerId,
    ticketId: null,
    dropTarget: null,
    helping: null,
    interactWas: false,
    skipTests,
    assignmentPolicy,
  };
}

function unit(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  return len < 1e-9 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}

/** This tick's input for one bot. */
export function botInput(state: GameState, bot: Bot, bots: readonly Bot[]): InputCommand {
  const input: InputCommand = {
    playerId: bot.playerId,
    tick: state.tick,
    move: { x: 0, y: 0 },
    interact: false,
    work: false,
    dash: false,
  };
  const goal = chooseGoal(state, bot, bots);
  const player = getPlayer(state, bot.playerId);
  if (!goal || !player) {
    bot.interactWas = false;
    return input;
  }

  const from = currentTile(state, bot.playerId);
  // Walk around managers when there is a way around; otherwise wait for them to move on.
  const blocked = managerTiles(state);
  if (goal.action === 'stand') {
    const walk =
      pathTo(state.level, from, goal.tile, blocked) ?? pathTo(state.level, from, goal.tile);
    const next = walk?.[0];
    if (next) input.move = unit(next.x - player.pos.x, next.y - player.pos.y);
    bot.interactWas = false;
    return input;
  }
  const others = goal.besideOthers
    ? state.players
        .filter((p) => p.id !== bot.playerId)
        .map((p) => ({ x: Math.round(p.pos.x), y: Math.round(p.pos.y) }))
    : [];
  const path =
    findPath(state.level, from, goal.tile, others, blocked) ??
    findPath(state.level, from, goal.tile, others);
  let wantsInteract = false;
  if (path && path.length > 0) {
    const next = path[0];
    if (next) input.move = unit(next.x - player.pos.x, next.y - player.pos.y);
  } else if (path) {
    const here = currentTile(state, bot.playerId);
    const dir = { x: goal.tile.x - here.x, y: goal.tile.y - here.y };
    const offCenter = dir.x !== 0 ? player.pos.y - here.y : player.pos.x - here.x;
    if (Math.abs(offCenter) > CENTER_SLACK) {
      input.move = unit(here.x - player.pos.x, here.y - player.pos.y);
    } else if (samePoint(targetTile(state, bot.playerId), goal.tile)) {
      wantsInteract = goal.action === 'interact';
      input.work = goal.action === 'work';
    } else {
      input.move = dir;
    }
  }
  input.interact = wantsInteract && !bot.interactWas;
  bot.interactWas = input.interact;
  return input;
}
