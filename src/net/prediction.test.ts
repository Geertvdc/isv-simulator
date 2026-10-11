import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_STEP_MS,
  COUNTDOWN_STEPS,
  NET_INPUT_REPEAT_TICKS,
  NET_PREDICT_MAX_TICKS,
  NET_PREDICT_SMOOTH_MS,
  NET_PREDICT_SNAP_DISTANCE,
  TICKS_PER_SECOND,
} from '../sim/balance';
import { levelById } from '../sim/levels';
import type { GameEvent } from '../sim/orders';
import {
  type GameState,
  type InputCommand,
  type Player,
  type PlayerId,
  type Vec,
  createGame,
} from '../sim/state';
import { tick } from '../sim/tick';
import { type InputBuffer, createInputBuffer, pushInput, takeInput } from './inputBuffer';
import {
  type Prediction,
  countdownEndTick,
  type PredictionSnapshot,
  advancePrediction,
  createPrediction,
  decayCorrections,
  isPredicting,
  predictedPlayer,
  predictionAlpha,
  recordInputs,
  reconcile,
  resetPrediction,
} from './prediction';

const GARAGE = levelById('garage');
if (!GARAGE) throw new Error('no garage');

/** What a player does at tick `t`: walls, a station row, corners, dashes, stops. */
function script(t: number): { move: Vec; dash: boolean } {
  const dash = (t >= 70 && t < 73) || (t >= 230 && t < 233) || (t >= 300 && t < 302);
  let move: Vec;
  if (t < 40) move = { x: 1, y: 0 };
  else if (t < 70) move = { x: 0.7, y: -0.7 };
  else if (t < 130) move = { x: -1, y: 0 };
  else if (t < 160) move = { x: 0, y: 1 };
  else if (t < 200) move = { x: 1, y: 0.3 };
  else if (t < 230) move = { x: 0, y: 0 };
  else if (t < 260) move = { x: 0, y: -1 };
  else if (t < 300) move = { x: 1, y: 1 };
  else move = { x: -0.2, y: 1 };
  return { move, dash };
}

function command(playerId: PlayerId, t: number): InputCommand {
  return { playerId, tick: t, interact: false, work: false, ...script(t) };
}

function newGame(players: PlayerId[] = [1]): GameState {
  const state = createGame(GARAGE as NonNullable<typeof GARAGE>, 7, players);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function snapshotOf(
  state: GameState,
  serverTick: number,
  events: GameEvent[] = [],
  runsFrom: number | null = 0,
): PredictionSnapshot {
  return {
    serverTick,
    players: structuredClone(state.players),
    managers: structuredClone(state.managers),
    events,
    runsFrom,
  };
}

/** Movement fields only: interact and throw state are the server's. */
function movement(
  p: Player,
): Pick<Player, 'pos' | 'vel' | 'facing' | 'dashTicks' | 'dashCooldown' | 'dashHeld'> {
  const { pos, vel, facing, dashTicks, dashCooldown, dashHeld } = p;
  return { pos, vel, facing, dashTicks, dashCooldown, dashHeld };
}

interface Rig {
  state: GameState;
  p: Prediction;
  local: PlayerId[];
  /** Server players after the ticks below the key ran, by server tick. */
  server: Map<number, Player[]>;
  /** The predicted local players the first time prediction reached a tick. */
  predicted: Map<number, Player[]>;
  correctionsSeen: number[];
}

interface RigOptions {
  /** Ticks an input takes to reach the server, and a snapshot to come back. */
  up?: number;
  down?: number;
  /** How far ahead of the server tick the client stamps (at least `up`). */
  ahead?: number;
  players?: PlayerId[];
  local?: PlayerId[];
  /** Messes with the server's state before tick `t` runs. */
  meddle?: (state: GameState, t: number) => GameEvent[];
  running?: (t: number) => boolean;
  /** What the snapshot at `t` says about when the sim runs (default: from 0 while running). */
  runsFrom?: (t: number) => number | null;
  inputFor?: (id: PlayerId, t: number) => InputCommand | null;
  /** Inputs of players on other machines, arriving on time. */
  remoteInput?: (id: PlayerId, t: number) => InputCommand | null;
}

/**
 * Plays `steps` ticks of a server (the real input buffers and `tick`) and a
 * predicting client with fixed delays both ways. Server tick = step.
 */
function play(steps: number, opts: RigOptions = {}): Rig {
  const up = opts.up ?? 0;
  const down = opts.down ?? 0;
  const ahead = opts.ahead ?? up;
  const players = opts.players ?? [1];
  const local = opts.local ?? [1];
  const running = opts.running ?? (() => true);
  const runsFrom = opts.runsFrom ?? ((t: number) => (running(t) ? 0 : null));
  const inputFor = opts.inputFor ?? command;
  const state = newGame(players);
  const p = createPrediction(true);
  resetPrediction(p, state.level);
  const buffers = new Map<PlayerId, InputBuffer>(players.map((id) => [id, createInputBuffer(id)]));
  const toServer: { at: number; input: InputCommand }[] = [];
  const toClient: { at: number; snap: PredictionSnapshot }[] = [];
  const rig: Rig = {
    state,
    p,
    local,
    server: new Map(),
    predicted: new Map(),
    correctionsSeen: [],
  };
  let pendingEvents: GameEvent[] = [];

  // The round starts with a snapshot at tick 0.
  reconcile(p, snapshotOf(state, 0, [], runsFrom(0)), local);
  rig.server.set(0, structuredClone(state.players));

  for (let k = 0; k < steps; k++) {
    // Client: this frame's inputs, stamped `ahead` ticks on.
    const target = k + ahead;
    const sent = local.flatMap((id) => {
      const input = inputFor(id, target);
      return input ? [input] : [];
    });
    recordInputs(p, sent);
    for (const input of sent) toServer.push({ at: k + up, input });
    advancePrediction(p, target);
    if (!rig.predicted.has(p.tick)) rig.predicted.set(p.tick, structuredClone(p.current));

    // Server: tick k.
    for (const m of toServer.filter((m) => m.at <= k)) {
      const buffer = buffers.get(m.input.playerId);
      if (buffer) pushInput(buffer, m.input, k);
    }
    toServer.splice(0, toServer.length, ...toServer.filter((m) => m.at > k));
    for (const id of players.filter((id) => !local.includes(id))) {
      const input = opts.remoteInput?.(id, k);
      const buffer = buffers.get(id);
      if (input && buffer) pushInput(buffer, input, k);
    }
    const inputs = players.map((id) => takeInput(buffers.get(id) as InputBuffer, k));
    const meddled = opts.meddle ? opts.meddle(state, k) : [];
    if (running(k)) {
      tick(state, inputs);
      pendingEvents.push(...meddled, ...state.events);
    }
    rig.server.set(k + 1, structuredClone(state.players));
    if ((k + 1) % 3 === 0) {
      toClient.push({
        at: k + down,
        snap: snapshotOf(state, k + 1, pendingEvents, runsFrom(k + 1)),
      });
      pendingEvents = [];
    }

    // Client: snapshots that arrived.
    for (const m of toClient.filter((m) => m.at <= k)) {
      const before = p.stats.corrections;
      reconcile(p, m.snap, local);
      if (p.stats.corrections > before) rig.correctionsSeen.push(m.snap.serverTick);
    }
    toClient.splice(0, toClient.length, ...toClient.filter((m) => m.at > k));
  }
  return rig;
}

function localAt(players: readonly Player[] | undefined, id: PlayerId): Player {
  const found = players?.find((pl) => pl.id === id);
  if (!found) throw new Error(`no player ${id}`);
  return found;
}

describe('prediction without lag', () => {
  it('equals the server after every tick, through walls, corners and dashes', () => {
    const rig = play(340);
    expect(rig.p.stats.corrections).toBe(0);
    for (let t = 1; t <= 340; t++) {
      expect(movement(localAt(rig.predicted.get(t), 1))).toEqual(
        movement(localAt(rig.server.get(t), 1)),
      );
    }
    // The script really did go places (and dashed).
    const path = [...rig.server.values()].map((ps) => localAt(ps, 1));
    expect(path.some((pl) => pl.dashTicks > 0)).toBe(true);
    // Stopped by the keyboard station at (3, 1) while walking left.
    expect(Math.min(...path.slice(40).map((pl) => pl.pos.x))).toBeCloseTo(3.85);
  });
});

describe('prediction with lag', () => {
  it('runs ahead of the server and still never needs a correction', () => {
    // 100 ms each way: 6 ticks up, 6 down, stamped 7 ahead.
    const rig = play(340, { up: 6, down: 6, ahead: 7 });
    expect(rig.p.stats.reconciles).toBeGreaterThan(100);
    expect(rig.p.stats.corrections).toBe(0);
    expect(rig.p.offsets).toEqual({});
    for (let t = 8; t <= 340; t++) {
      expect(movement(localAt(rig.predicted.get(t), 1))).toEqual(
        movement(localAt(rig.server.get(t), 1)),
      );
    }
  });

  it('replays the inputs the server has not applied yet on top of each snapshot', () => {
    const rig = play(120, { up: 3, down: 5, ahead: 4 });
    const { p } = rig;
    // The base is the newest snapshot; only inputs from its tick on are kept.
    expect(p.baseTick).not.toBeNull();
    expect(p.inputs.every((i) => i.tick >= (p.baseTick ?? Infinity))).toBe(true);
    expect(p.inputs.length).toBeGreaterThan(0);
    expect(p.tick).toBeGreaterThan(p.baseTick ?? Infinity);
    // ... and the predicted player is where the server will be at that tick.
    const ahead = play(p.tick, { up: 3, down: 5, ahead: 4 });
    expect(movement(localAt(p.current, 1))).toEqual(movement(localAt(ahead.server.get(p.tick), 1)));
  });

  it('repeats the last input over ticks nothing was sent for, then stands still, like the server', () => {
    // Inputs only every fourth tick, and nothing at all after tick 60.
    const sparse = (id: PlayerId, t: number): InputCommand | null =>
      t % 4 === 0 && t <= 60 ? command(id, t) : null;
    const rig = play(60 + NET_INPUT_REPEAT_TICKS + 30, {
      up: 2,
      down: 2,
      ahead: 3,
      inputFor: sparse,
    });
    expect(rig.p.stats.corrections).toBe(0);
    const last = localAt(rig.server.get(60 + NET_INPUT_REPEAT_TICKS + 30), 1);
    expect(Math.hypot(last.vel.x, last.vel.y)).toBe(0);
  });
});

describe('determinism', () => {
  it('moves exactly like tick() for the same inputs, with no other players near', () => {
    const state = newGame([1]);
    const p = createPrediction(true);
    resetPrediction(p, state.level);
    reconcile(p, snapshotOf(state, 0), [1]);
    for (let t = 0; t < 340; t++) {
      recordInputs(p, [command(1, t)]);
      advancePrediction(p, t);
      tick(state, [command(1, t)]);
      expect(movement(localAt(p.current, 1))).toEqual(movement(localAt(state.players, 1)));
    }
  });
});

describe('reconciliation', () => {
  it('takes the server position after a mismatch and replays on top of it, gliding the difference', () => {
    // At tick 100 something (a push prediction couldn't know about) moves the player 0.4 tiles.
    const meddle = (s: GameState, t: number): GameEvent[] => {
      if (t === 100) localAt(s.players, 1).pos.y += 0.4;
      return [];
    };
    const rig = play(112, { up: 4, down: 4, ahead: 5, meddle });
    const { p } = rig;
    expect(p.stats.corrections).toBeGreaterThan(0);
    expect(p.stats.snaps).toBe(0);
    expect(p.stats.maxErrorTiles).toBeGreaterThan(0.3);
    // The predicted player is where the (meddled) server will be at that tick.
    const ahead = play(p.tick, { up: 4, down: 4, ahead: 5, meddle });
    expect(movement(localAt(p.current, 1))).toEqual(movement(localAt(ahead.server.get(p.tick), 1)));
    // The drawn player hasn't jumped: the correction is an offset back toward the old spot.
    const offset = p.offsets[1];
    expect(offset).toBeDefined();
    expect(Math.hypot(offset?.x ?? 0, offset?.y ?? 0)).toBeGreaterThan(0.3);
    expect(offset?.y).toBeLessThan(0);
  });

  it('snaps a correction past the snap distance', () => {
    const meddle = (s: GameState, t: number): GameEvent[] => {
      if (t === 100) localAt(s.players, 1).pos = { x: 10, y: 6 };
      return [];
    };
    const rig = play(112, { up: 4, down: 4, ahead: 5, meddle });
    expect(rig.p.stats.maxErrorTiles).toBeGreaterThan(NET_PREDICT_SNAP_DISTANCE);
    expect(rig.p.stats.snaps).toBe(1);
    expect(rig.p.offsets).toEqual({});
  });

  it('snaps when the snapshot says a local player was shoved or bumped', () => {
    const meddle = (s: GameState, t: number): GameEvent[] => {
      // Walking right in the open: a sideways knock stays in the path.
      if (t !== 20) return [];
      localAt(s.players, 1).pos.y += 0.3;
      return [{ type: 'shoved', by: 2, target: 1 }];
    };
    const rig = play(32, { up: 4, down: 4, ahead: 5, meddle });
    expect(rig.p.stats.corrections).toBe(1);
    expect(rig.p.stats.snaps).toBe(1);
    expect(rig.p.offsets).toEqual({});
  });

  it('predicts walking into (and pushing) a teammate standing still exactly', () => {
    // Player 2 (another machine, no input) stands at (6, 3), right in player 1's way.
    const rig = play(90, {
      up: 6,
      down: 6,
      ahead: 7,
      players: [1, 2],
      local: [1],
      meddle: (s, t) => {
        if (t === 0) localAt(s.players, 2).pos = { x: 6, y: 3 };
        return [];
      },
      inputFor: (id, t) => ({ ...command(id, t), move: { x: 1, y: 0 }, dash: false }),
    });
    // The server pushes both along; prediction does the same.
    expect(localAt(rig.server.get(90), 2).pos.x).toBeGreaterThan(6.5);
    // Only the first snapshots after the teleport above correct anything.
    expect(rig.correctionsSeen.every((t) => t <= 15)).toBe(true);
    expect(rig.p.stats.snaps).toBe(0);
    for (let t = 30; t <= 90; t++) {
      expect(movement(localAt(rig.predicted.get(t), 1))).toEqual(
        movement(localAt(rig.server.get(t), 1)),
      );
    }
  });

  it('only corrects a little when a teammate walks across', () => {
    // Player 2 (another machine) walks down across player 1's path.
    const rig = play(90, {
      up: 6,
      down: 6,
      ahead: 7,
      players: [1, 2],
      local: [1],
      meddle: (s, t) => {
        if (t === 0) localAt(s.players, 2).pos = { x: 6, y: 1.2 };
        return [];
      },
      inputFor: (id, t) => ({ ...command(id, t), move: { x: 1, y: 0 }, dash: false }),
      remoteInput: (id, t) => ({ ...command(id, t), move: { x: 0, y: 1 }, dash: false }),
    });
    // They did meet: player 2 was pushed off its straight line down.
    const path = [...rig.server.values()].map((ps) => localAt(ps, 2).pos.x);
    expect(Math.max(...path.map((x) => Math.abs(x - 6)))).toBeGreaterThan(0.05);
    expect(rig.p.stats.corrections).toBeGreaterThan(0);
    expect(rig.p.stats.snaps).toBe(0);
    expect(rig.p.stats.maxErrorTiles).toBeLessThan(NET_PREDICT_SNAP_DISTANCE);
  });

  it('predicts nothing while the round is not running, and holds the server position', () => {
    // Paused from tick 60 on.
    const rig = play(100, { up: 4, down: 4, ahead: 5, running: (t) => t < 60 });
    const { p } = rig;
    expect(p.runsFrom).toBeNull();
    const server = localAt(rig.server.get(100), 1);
    expect(movement(localAt(p.current, 1))).toEqual(movement(server));
    const tickBefore = p.tick;
    advancePrediction(p, 500);
    expect(p.tick).toBe(tickBefore);
  });

  it('stands still through the countdown and moves from its end on, like the server', () => {
    // The sim starts at tick 30; every snapshot before says so.
    const rig = play(80, {
      up: 6,
      down: 6,
      ahead: 7,
      running: (t) => t >= 30,
      runsFrom: () => 30,
    });
    expect(rig.p.stats.corrections).toBe(0);
    for (let t = 8; t <= 80; t++) {
      expect(movement(localAt(rig.predicted.get(t), 1))).toEqual(
        movement(localAt(rig.server.get(t), 1)),
      );
    }
    expect(localAt(rig.server.get(30), 1).pos).toEqual(localAt(rig.server.get(0), 1).pos);
  });

  it('glides the step back when a pause comes in after running ahead', () => {
    const rig = play(70, { up: 4, down: 4, ahead: 5, running: (t) => t < 60 });
    // It ran ahead past tick 60 and had to come back: a small correction, not a snap.
    expect(rig.p.stats.corrections).toBeGreaterThan(0);
    expect(rig.p.stats.snaps).toBe(0);
  });
});

describe('limits', () => {
  it('never simulates more than NET_PREDICT_MAX_TICKS at once', () => {
    const state = newGame();
    const p = createPrediction(true);
    resetPrediction(p, state.level);
    reconcile(p, snapshotOf(state, 0), [1]);
    advancePrediction(p, 100_000);
    expect(p.tick).toBe(100_001);
    // It stood still (no inputs): the jump costs nothing visible.
    expect(localAt(p.current, 1).pos).toEqual(localAt(state.players, 1).pos);
    expect(NET_PREDICT_MAX_TICKS).toBeLessThan(100_000);
  });

  it('does nothing when turned off', () => {
    const state = newGame();
    const p = createPrediction(false);
    resetPrediction(p, state.level);
    expect(p.enabled).toBe(false);
    reconcile(p, snapshotOf(state, 0), [1]);
    recordInputs(p, [command(1, 0)]);
    advancePrediction(p, 10);
    expect(isPredicting(p)).toBe(false);
    expect(predictedPlayer(p, 1, 0.5)).toBeNull();
  });

  it('ignores inputs the server already ran', () => {
    const state = newGame();
    const p = createPrediction(true);
    resetPrediction(p, state.level);
    reconcile(p, snapshotOf(state, 30), [1]);
    recordInputs(p, [command(1, 29), command(1, 31), command(1, 30)]);
    expect(p.inputs.map((i) => i.tick)).toEqual([30, 31]);
  });
});

describe('drawing', () => {
  it('draws between the last two predicted ticks, plus the gliding correction', () => {
    const state = newGame();
    const p = createPrediction(true);
    resetPrediction(p, state.level);
    reconcile(p, snapshotOf(state, 0), [1]);
    for (let t = 0; t < 10; t++) recordInputs(p, [{ ...command(1, t), move: { x: 1, y: 0 } }]);
    advancePrediction(p, 9.25);
    expect(p.tick).toBe(10);
    expect(predictionAlpha(p, 9.25)).toBeCloseTo(0.25);
    const was = localAt(p.previous, 1).pos;
    const now = localAt(p.current, 1).pos;
    const drawn = predictedPlayer(p, 1, 0.25)?.pos;
    expect(drawn?.x).toBeCloseTo(was.x + (now.x - was.x) * 0.25);
    p.offsets[1] = { x: -0.2, y: 0 };
    expect(predictedPlayer(p, 1, 0.25)?.pos.x).toBeCloseTo(was.x + (now.x - was.x) * 0.25 - 0.2);
    // A target behind the prediction (the clock estimate moved back) draws the newest tick.
    expect(predictionAlpha(p, 3)).toBe(0);
    expect(predictionAlpha(p, 12)).toBe(1);
  });

  it('lets a correction decay smoothly toward zero without overshooting', () => {
    const p = createPrediction(true);
    p.offsets[1] = { x: 0.5, y: -0.2 };
    const offsetX = (): number => p.offsets[1]?.x ?? 0;
    let last = 0.5;
    for (let frame = 0; frame < 30; frame++) {
      decayCorrections(p, 1000 / 60);
      const x = offsetX();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(last);
      // Per frame it never moves more than a walking step (5 tiles/s): no visible jump.
      expect(last - x).toBeLessThan(5 / 60);
      last = x;
    }
    decayCorrections(p, NET_PREDICT_SMOOTH_MS * 10);
    expect(p.offsets).toEqual({});
  });
});

describe('countdownEndTick', () => {
  it('is the first server tick whose flow update finds the countdown over', () => {
    const total = COUNTDOWN_STEPS * COUNTDOWN_STEP_MS;
    for (const startTick of [0, 1, 7, 599, 12_345]) {
      const start = startTick * (1000 / TICKS_PER_SECOND);
      const end = countdownEndTick(start);
      expect(end * (1000 / TICKS_PER_SECOND) - start).toBeGreaterThanOrEqual(total);
      expect((end - 1) * (1000 / TICKS_PER_SECOND) - start).toBeLessThan(total);
    }
  });
});
