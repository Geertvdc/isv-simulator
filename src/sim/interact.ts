/**
 * Interact (pick up, put down, bin, ship) and stations at work: players
 * working the keyboard and test bench, and repairing broken pipelines.
 */

import {
  DESIGNED_CODE_FACTOR,
  DESIGN_RATE,
  PAIR_WORKER_FACTOR,
  REVIEWERS_NEEDED,
  REVIEW_RATE,
  WORK_RATE,
} from './balance';
import { type Tile, getTile } from './level';
import { shipTicket } from './orders';
import { isBroken, isBuilding, pipelineAt, repairPipeline } from './pipeline';
import { roleWorkRate } from './roles';
import type { RoleId } from './roles';
import { type GameState, type PlayerId, getPlayer, targetTile } from './state';
import {
  type StepKind,
  type Ticket,
  type TicketStep,
  advanceStep,
  canMerge,
  isFinished,
  isPart,
  mergeParts,
  queueAt,
  queuedTickets,
  ticketCarriedBy,
  ticketOnTile,
  workableStep,
} from './tickets';

/** Tiles players can take a ticket from (queue tiles aside). */
const PICK_UP_FROM: ReadonlySet<Tile> = new Set([
  'counter',
  'conveyor',
  'whiteboard',
  'merge',
  'keyboard',
  'testBench',
  'pipeline',
  'review',
  'floor',
]);
/** Tiles players can put any ticket on. */
const PUT_DOWN_ON: ReadonlySet<Tile> = new Set([
  'counter',
  'conveyor',
  'whiteboard',
  'keyboard',
  'testBench',
  'review',
]);

/** The step each station advances. */
const STATION_STEP: Partial<Record<Tile, StepKind>> = {
  whiteboard: 'design',
  keyboard: 'code',
  review: 'review',
  testBench: 'test',
  pipeline: 'pipeline',
};
/** Stations that need a player holding work; the rest run on their own. */
const WORKED_BY_HAND: ReadonlySet<Tile> = new Set(['keyboard', 'testBench', 'whiteboard']);
/** How fast each hand-worked station advances its step. */
const HAND_RATE: Partial<Record<Tile, number>> = {
  keyboard: WORK_RATE,
  testBench: WORK_RATE,
  whiteboard: DESIGN_RATE,
};

/** The step a station advances, or `undefined` for tiles that aren't stations. */
export function stationStep(tile: Tile | null): StepKind | undefined {
  return tile === null ? undefined : STATION_STEP[tile];
}

/** The step of `ticket` that the station on `tile` can work on now, if any. */
export function stationWorkStep(ticket: Ticket, tile: Tile | null): TicketStep | undefined {
  const kind = stationStep(tile);
  return kind === undefined ? undefined : workableStep(ticket, kind);
}

/** Whether a ticket sitting on a station is ready for that station's step. */
export function isAtItsStation(ticket: Ticket, tile: Tile | null): boolean {
  return stationWorkStep(ticket, tile) !== undefined;
}

/**
 * Whether `ticket` may be put on tile (x, y): a free counter or station, or
 * a free working pipeline it's ready for. Thrown tickets land by the same rule.
 */
export function canPutDown(state: GameState, ticket: Ticket, x: number, y: number): boolean {
  const tile = getTile(state.level, x, y);
  const onTile = ticketOnTile(state, x, y);
  // The merge station takes a coded part, and then its other half (which merges them).
  if (tile === 'merge') {
    if (!isPart(ticket) || !isFinished(ticket)) return false;
    return !onTile || canMerge(onTile, ticket);
  }
  if (tile === null || onTile) return false;
  return (
    PUT_DOWN_ON.has(tile) ||
    (tile === 'pipeline' && isAtItsStation(ticket, tile) && !isBroken(state, { x, y }))
  );
}

/**
 * One interact press by `playerId` on the tile they face. Returns whether
 * anything happened. Empty hands also pick up a ticket lying on the floor
 * underfoot.
 */
export function interact(state: GameState, playerId: PlayerId): boolean {
  const { x, y } = targetTile(state, playerId);
  const tile = getTile(state.level, x, y);
  if (tile === null) return false;
  const carried = ticketCarriedBy(state, playerId);
  const onTile = ticketOnTile(state, x, y);

  if (carried) {
    if (tile === 'bin') {
      state.tickets = state.tickets.filter((t) => t !== carried);
      state.events.push({ type: 'binned', playerId, ticketId: carried.id });
      return true;
    }
    if (tile === 'ship') return shipTicket(state, playerId, carried);
    if (canPutDown(state, carried, x, y)) {
      state.events.push({ type: 'putDown', playerId, ticketId: carried.id });
      settleOn(state, carried, x, y);
      return true;
    }
    return false;
  }

  const queue = queueAt(tile);
  const pick =
    queue !== undefined
      ? queuedTickets(state, queue)[0]
      : onTile && PICK_UP_FROM.has(tile) && !isBuilding(state, onTile)
        ? onTile
        : ticketOnTile(state, ...standingTile(state, playerId));
  if (!pick) return false;
  pick.location = { kind: 'player', playerId };
  state.events.push({ type: 'pickedUp', playerId, ticketId: pick.id });
  return true;
}

/**
 * Puts `ticket` on tile (x, y), which `canPutDown` allowed: on a merge
 * station holding its other half, the two become one full-stack ticket.
 * Returns the ticket now on the tile.
 */
export function settleOn(state: GameState, ticket: Ticket, x: number, y: number): Ticket {
  const onTile = ticketOnTile(state, x, y);
  if (onTile && onTile !== ticket && canMerge(onTile, ticket)) {
    return mergeParts(state, onTile, ticket, x, y);
  }
  ticket.location = { kind: 'tile', x, y };
  return ticket;
}

function standingTile(state: GameState, playerId: PlayerId): [number, number] {
  const p = getPlayer(state, playerId);
  return p ? [Math.round(p.pos.x), Math.round(p.pos.y)] : [-1, -1];
}

/** Who worked where during one tick. Tiles are keyed as `y * width + x`. */
export interface TickWork {
  /** Players holding work at each review station with a ticket to review. */
  reviewers: Map<number, PlayerId[]>;
  /** On levels with pairing: players coding at each keyboard this tick. */
  coders: Map<number, WorkContribution[]>;
  /** Active workers at hand-operated stations, resolved without player-order bias. */
  handWork: Map<number, WorkContribution[]>;
  /** Active repairers at an empty broken pipeline. */
  repairs: Map<number, RepairContribution[]>;
}

interface WorkContribution {
  playerId: PlayerId;
  ticket: Ticket;
  step: TicketStep;
  rate: number;
}

interface RepairContribution {
  playerId: PlayerId;
  x: number;
  y: number;
  rate: number;
}

export function newTickWork(): TickWork {
  return { reviewers: new Map(), coders: new Map(), handWork: new Map(), repairs: new Map() };
}

/**
 * Work held by `playerId` this tick. Only a step that's workable now (see
 * `workableSteps`) advances; at a broken pipeline, work repairs it. At a
 * review station work only signs the player up: `finishReviews` advances
 * reviews with enough players. Returns whether this player did any work.
 */
export function work(state: GameState, playerId: PlayerId, tickWork: TickWork): boolean {
  const { x, y } = targetTile(state, playerId);
  const tile = getTile(state.level, x, y);
  const key = y * state.level.width + x;
  const player = getPlayer(state, playerId);
  if (!player) return false;
  const { reviewers } = tickWork;
  if (tile === 'review') {
    const ticket = ticketOnTile(state, x, y);
    if (!ticket || !stationWorkStep(ticket, tile)) return false;
    addUnique(reviewers, key, playerId);
    return true;
  }
  if (tile === 'pipeline') {
    if (!pipelineAt(state, x, y)?.broken || ticketOnTile(state, x, y)) return false;
    addContribution(tickWork.repairs, key, {
      playerId,
      x,
      y,
      rate: roleWorkRate(player.roleId, 'repair', 'general'),
    });
    return true;
  }
  if (tile === null || !WORKED_BY_HAND.has(tile)) return false;

  const ticket = ticketOnTile(state, x, y);
  const step = ticket && stationWorkStep(ticket, tile);
  if (!step) return false;
  const contribution = {
    playerId,
    ticket,
    step,
    rate: handRate(ticket, tile, player.roleId),
  };
  if (tile === 'keyboard' && state.settings.pairing) {
    addContribution(tickWork.coders, key, contribution);
  } else {
    addContribution(tickWork.handWork, key, contribution);
  }
  return true;
}

/** How fast `tile` works its step on `ticket` by hand: coding goes faster once it's been designed. */
function handRate(ticket: Ticket, tile: Tile, roleId: RoleId): number {
  const rate = HAND_RATE[tile] ?? WORK_RATE;
  const step = stationStep(tile);
  const roleRate = step ? roleWorkRate(roleId, step, ticket.domain) : 1;
  if (tile !== 'keyboard') return rate * roleRate;
  const designed = ticket.steps.some((s) => s.kind === 'design' && s.progress >= 1);
  return rate * roleRate * (designed ? DESIGNED_CODE_FACTOR : 1);
}

/** Advances one captured ticket group per keyboard, pairing only when that ticket remains there. */
export function finishCoding(state: GameState, tickWork: TickWork): void {
  const { width } = state.level;
  state.pairing = [];
  for (const [key, contributors] of tickWork.coders) {
    const x = key % width;
    const y = Math.floor(key / width);
    const currentTicket = ticketOnTile(state, x, y);
    const candidates = groupContributions(contributors).flatMap((group) => {
      const [worker, partner] = strongest(group);
      if (
        !worker ||
        !state.tickets.includes(worker.ticket) ||
        !worker.ticket.steps.includes(worker.step)
      ) {
        return [];
      }
      const paired =
        state.settings.pairing && currentTicket === worker.ticket && partner !== undefined;
      return [
        {
          worker,
          partner,
          paired,
          rate: paired ? PAIR_WORKER_FACTOR * (worker.rate + partner.rate) : worker.rate,
        },
      ];
    });
    const selected = candidates.sort(
      (a, b) =>
        b.rate - a.rate ||
        a.worker.playerId - b.worker.playerId ||
        a.worker.ticket.id - b.worker.ticket.id,
    )[0];
    if (!selected) continue;
    advanceStep(selected.worker.step, selected.rate);
    const workers =
      selected.paired && selected.partner ? [selected.worker, selected.partner] : [selected.worker];
    for (const worker of workers) {
      state.workFeedback.push({
        playerId: worker.playerId,
        task: 'code',
        ticketId: worker.ticket.id,
        rate: (worker.rate / WORK_RATE) * (selected.paired ? PAIR_WORKER_FACTOR : 1),
        ...(selected.paired ? { teamRate: selected.rate / WORK_RATE } : {}),
      });
    }
    if (selected.paired) state.pairing.push({ x, y });
  }
}

/** Resolves one strongest worker per ordinary station and one strongest repairer per pipeline. */
export function finishManualWork(state: GameState, tickWork: TickWork): void {
  for (const contributors of tickWork.handWork.values()) {
    const worker = strongest(contributors).find(
      (candidate) =>
        state.tickets.includes(candidate.ticket) && candidate.ticket.steps.includes(candidate.step),
    );
    if (worker) {
      advanceStep(worker.step, worker.rate);
      state.workFeedback.push({
        playerId: worker.playerId,
        task: worker.step.kind,
        ticketId: worker.ticket.id,
        rate: worker.rate / (worker.step.kind === 'design' ? DESIGN_RATE : WORK_RATE),
      });
    }
  }
  for (const contributors of tickWork.repairs.values()) {
    const [repairer] = strongest(contributors);
    if (repairer) {
      repairPipeline(state, repairer.x, repairer.y, repairer.rate);
      state.workFeedback.push({ playerId: repairer.playerId, task: 'repair', rate: repairer.rate });
    }
  }
}

function groupContributions(contributors: readonly WorkContribution[]): WorkContribution[][] {
  const grouped = new Map<Ticket, Map<TicketStep, WorkContribution[]>>();
  for (const contributor of contributors) {
    const steps = grouped.get(contributor.ticket) ?? new Map<TicketStep, WorkContribution[]>();
    const workers = steps.get(contributor.step) ?? [];
    workers.push(contributor);
    steps.set(contributor.step, workers);
    grouped.set(contributor.ticket, steps);
  }
  return [...grouped.values()].flatMap((steps) => [...steps.values()]);
}

function strongest<T extends { playerId: PlayerId; rate: number }>(
  contributors: readonly T[],
): T[] {
  return [...contributors].sort((a, b) => b.rate - a.rate || a.playerId - b.playerId);
}

function addContribution<T extends { playerId: PlayerId }>(
  map: Map<number, T[]>,
  key: number,
  contribution: T,
): void {
  const contributors = map.get(key) ?? [];
  if (!contributors.some((entry) => entry.playerId === contribution.playerId)) {
    map.set(key, [...contributors, contribution]);
  }
}

function addUnique(map: Map<number, PlayerId[]>, key: number, playerId: PlayerId): void {
  const players = map.get(key) ?? [];
  if (!players.includes(playerId)) map.set(key, [...players, playerId]);
}

/** Advances every review that `REVIEWERS_NEEDED` players worked on this tick; more don't speed it up. */
export function finishReviews(state: GameState, tickWork: TickWork): void {
  const { width } = state.level;
  for (const [key, players] of tickWork.reviewers) {
    if (players.length < REVIEWERS_NEEDED) continue;
    const x = key % width;
    const y = Math.floor(key / width);
    const ticket = ticketOnTile(state, x, y);
    const step = ticket && stationWorkStep(ticket, 'review');
    if (step) {
      advanceStep(step, REVIEW_RATE);
      for (const playerId of players)
        state.workFeedback.push({ playerId, task: 'review', ticketId: ticket.id, rate: 1 });
    }
  }
}
