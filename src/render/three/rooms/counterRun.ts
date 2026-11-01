import { type LevelMap, getTile } from '../../../sim/level';

/**
 * How a counter tile sits in its straight run of counters (x along the run),
 * and how it's turned so x runs along it. Rooms that build their counters
 * from the run (doors on sawhorses, a desk row) pick their model from this.
 */
export interface CounterRun {
  /** No counter past its −x edge, past its +x edge: the run ends there. */
  minusEnd: boolean;
  plusEnd: boolean;
  /** Whether legs (a sawhorse, a trestle) stand under this tile. */
  legs: boolean;
  /** Whether the run's knob (a door's knob hole) is on this tile. */
  knob: boolean;
  /** The turn that runs the model's x along the run. */
  yaw: number;
}

/**
 * Where the counter at (x, y) sits in its straight run of counters: along
 * the row if it has a counter beside it, else down the column. The run's
 * end tiles stand on legs, and every second tile between them, but never
 * the one next to an end; a lone counter stands on them in its middle.
 */
export function counterRun(map: LevelMap, x: number, y: number): CounterRun {
  const isCounter = (tx: number, ty: number) => getTile(map, tx, ty) === 'counter';
  const across =
    isCounter(x - 1, y) || isCounter(x + 1, y) || !(isCounter(x, y - 1) || isCounter(x, y + 1));
  // Turned a quarter, the model's +x points up the map (−y).
  const [dx, dy] = across ? [1, 0] : [0, -1];
  let back = 0;
  while (isCounter(x - dx * (back + 1), y - dy * (back + 1))) back++;
  let ahead = 0;
  while (isCounter(x + dx * (ahead + 1), y + dy * (ahead + 1))) ahead++;
  return {
    minusEnd: back === 0,
    plusEnd: ahead === 0,
    legs: back === 0 || ahead === 0 || (back % 2 === 0 && ahead !== 1),
    knob: ahead === 0 && back > 0,
    yaw: across ? 0 : Math.PI / 2,
  };
}

/** A name for the counter model a run needs: runs with the same name share one model. */
export function counterRunKey(run: CounterRun): string {
  return `${run.minusEnd}:${run.plusEnd}:${run.legs}:${run.knob}`;
}
