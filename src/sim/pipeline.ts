/**
 * Pipelines: build tickets on their own, and break when a finished build is
 * left in them too long. A broken pipeline builds nothing and takes no
 * ticket until someone takes the ticket out and repairs it.
 */

import {
  PIPELINE_BUILD_TICKS,
  PIPELINE_FAIL_TICKS,
  PIPELINE_WARN_TICKS,
  REPAIR_TICKS,
} from './balance';
import { type GridPoint, type LevelMap, getTile } from './level';
import type { GameState } from './state';
import { type Ticket, advanceStep, ticketOnTile, workableStep } from './tickets';

export interface Pipeline {
  x: number;
  y: number;
  /** Ticks the finished build on it has been waiting to be picked up. */
  doneTicks: number;
  broken: boolean;
  /** Repair progress while broken, 0 to 1. */
  repair: number;
}

/** One pipeline state per pipeline tile, all working. */
export function createPipelines(map: LevelMap): Pipeline[] {
  const result: Pipeline[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) === 'pipeline') {
        result.push({ x, y, doneTicks: 0, broken: false, repair: 0 });
      }
    }
  }
  return result;
}

export function pipelineAt(state: GameState, x: number, y: number): Pipeline | undefined {
  return state.pipelines.find((p) => p.x === x && p.y === y);
}

export function isBroken(state: GameState, { x, y }: GridPoint): boolean {
  return pipelineAt(state, x, y)?.broken ?? false;
}

/** The finished build on it is about to break the pipeline: time to flash. */
export function pipelineWarning(pipeline: Pipeline): boolean {
  return !pipeline.broken && pipeline.doneTicks >= PIPELINE_FAIL_TICKS - PIPELINE_WARN_TICKS;
}

/** Whether `ticket` has a pipeline step a pipeline can build now. */
function wantsBuild(ticket: Ticket): boolean {
  return workableStep(ticket, 'pipeline') !== undefined;
}

/**
 * Every working pipeline builds its ticket a little each tick, nobody
 * needed. A finished build left too long breaks the pipeline and has to be
 * built again.
 */
export function updatePipelines(state: GameState): void {
  for (const pipeline of state.pipelines) {
    const ticket = ticketOnTile(state, pipeline.x, pipeline.y);
    if (pipeline.broken || !ticket) {
      pipeline.doneTicks = 0;
      continue;
    }
    const step = workableStep(ticket, 'pipeline');
    if (step) {
      advanceStep(step, 1 / PIPELINE_BUILD_TICKS);
      pipeline.doneTicks = 0;
      continue;
    }
    pipeline.doneTicks++;
    if (pipeline.doneTicks < PIPELINE_FAIL_TICKS) continue;

    const built = ticket.steps.find((s) => s.kind === 'pipeline');
    if (built) built.progress = 0;
    pipeline.broken = true;
    pipeline.doneTicks = 0;
    pipeline.repair = 0;
    state.events.push({ type: 'pipelineBroke', x: pipeline.x, y: pipeline.y, ticketId: ticket.id });
  }
}

/**
 * One tick of repair work on the pipeline at (x, y): only while it's broken
 * and empty. Returns whether any progress was made.
 */
export function repairPipeline(state: GameState, x: number, y: number): boolean {
  const pipeline = pipelineAt(state, x, y);
  if (!pipeline?.broken || ticketOnTile(state, x, y)) return false;
  pipeline.repair += 1 / REPAIR_TICKS;
  if (pipeline.repair >= 1 - 1e-9) {
    pipeline.broken = false;
    pipeline.repair = 0;
    state.events.push({ type: 'pipelineRepaired', x, y });
  }
  return true;
}

/** A working pipeline holds on to its ticket until the build is done. */
export function isBuilding(state: GameState, ticket: Ticket): boolean {
  if (ticket.location.kind !== 'tile') return false;
  const { x, y } = ticket.location;
  const pipeline = pipelineAt(state, x, y);
  return pipeline !== undefined && !pipeline.broken && wantsBuild(ticket);
}
