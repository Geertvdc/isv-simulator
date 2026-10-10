import { MAX_TICKS_PER_FRAME, TICKS_PER_SECOND } from '../sim/balance';
import type { GameEvent } from '../sim/orders';
import type { GameState, InputCommand, PlayerId, Vec } from '../sim/state';
import { tick } from '../sim/tick';

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Absorbs float error so exactly N ticks of time always runs N ticks. */
const EPSILON = 1e-6;

/**
 * Fixed-timestep accumulator: runs as many sim ticks as real time calls for,
 * at most `MAX_TICKS_PER_FRAME` per frame (after a stall the game slows down
 * instead of spiralling). Keeps the player positions from before the last
 * tick so rendering can interpolate between the last two ticks.
 */
export class GameLoop {
  /** Real time not yet simulated, in ticks. */
  private accumulator = 0;
  private previous = new Map<PlayerId, Vec>();
  private previousManagers = new Map<number, Vec>();
  /** Sim events from every tick run by the last `advance`, in order. */
  events: GameEvent[] = [];

  constructor(readonly state: GameState) {
    this.snapshot();
  }

  /**
   * Advances by `deltaMs` of real time. `inputsFor` builds the inputs for one
   * tick and is called once per tick run. Returns the number of ticks run.
   */
  advance(deltaMs: number, inputsFor: (tick: number) => InputCommand[]): number {
    this.accumulator += Math.max(0, deltaMs) / TICK_MS;
    let ran = 0;
    this.events = [];
    while (this.accumulator >= 1 - EPSILON && ran < MAX_TICKS_PER_FRAME) {
      this.snapshot();
      tick(this.state, inputsFor(this.state.tick));
      this.events.push(...this.state.events);
      this.accumulator = Math.max(0, this.accumulator - 1);
      ran++;
    }
    // Drop the time we couldn't catch up on, but keep the partial tick for interpolation.
    if (ran === MAX_TICKS_PER_FRAME) this.accumulator = Math.min(this.accumulator, 1);
    return ran;
  }

  /**
   * Forgets real time not yet simulated and the last frame's events. Call
   * when the round carries on after a pause, so it doesn't catch up on the
   * time spent paused.
   */
  resetTime(): void {
    this.accumulator = 0;
    this.events = [];
  }

  /** How far real time is into the next tick, 0 to 1. */
  get alpha(): number {
    return Math.min(this.accumulator, 1);
  }

  /** A player's position interpolated between the last two ticks. */
  renderPos(id: PlayerId): Vec | undefined {
    const player = this.state.players.find((p) => p.id === id);
    if (!player) return undefined;
    return lerp(this.previous.get(id) ?? player.pos, player.pos, this.alpha);
  }

  /** A manager's position interpolated between the last two ticks. */
  renderManagerPos(id: number): Vec | undefined {
    const manager = this.state.managers.find((m) => m.id === id);
    if (!manager) return undefined;
    return lerp(this.previousManagers.get(id) ?? manager.pos, manager.pos, this.alpha);
  }

  private snapshot(): void {
    this.previous = new Map(this.state.players.map((p) => [p.id, { ...p.pos }]));
    this.previousManagers = new Map(this.state.managers.map((m) => [m.id, { ...m.pos }]));
  }
}

function lerp(from: Vec, to: Vec, t: number): Vec {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
