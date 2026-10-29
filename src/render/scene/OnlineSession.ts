import { buildInputCommands } from '../../input/commands';
import type { DevicePress } from '../../input/controller';
import type { InputFrame } from '../../input/devices';
import { claimOrphanedPlayer } from '../../input/lobby';
import type { FlowCommand } from '../../flow/commands';
import {
  type Flow,
  type OnlineError,
  enterOnline,
  joinFailed,
  joinSucceeded,
  onlineEnded,
} from '../../flow/flow';
import type { Identity } from '../../flow/identity';
import {
  type OnlineRole,
  type OnlineState,
  applyServerMessage,
  createOnline,
  createRejoin,
  localBindings,
  onlineConnected,
  onlineMenuPresses,
  setOnlineStatus,
} from '../../flow/online';
import { type SaveData, type StorageLike, recordLevel, writeSave } from '../../flow/save';
import {
  type NetConnection,
  helloFor,
  hostRoom,
  joinRoomByCode,
  rejoinRoom,
  toJoinError,
} from '../../net/client';
import {
  type ClockSync,
  addPong,
  createClockSync,
  inputTargetTick,
  inputTargetTickExact,
} from '../../net/clock';
import { createInputStamper, resetInputStamper, stampInputs } from '../../net/inputStamp';
import type { InterpolatedFrame, InterpolationStatus } from '../../net/interpolation';
import type { LagSettings } from '../../net/lag';
import {
  type OnlineRound,
  continueOnlineRound,
  pushRoundSnapshot,
  roundRenderTick,
  sampleRound,
  takeDueEvents,
} from '../../net/onlineRound';
import {
  type Prediction,
  type PredictionStats,
  advancePrediction,
  createPrediction,
  decayCorrections,
  isPredicting,
  predictionAlpha,
  recordInputs,
  reconcile,
  resetPrediction,
} from '../../net/prediction';
import type { ServerMessage } from '../../net/protocol';
import { parseTicket } from '../../net/rejoin';
import type { Snapshot } from '../../net/snapshot';
import {
  NET_MAX_INPUTS_PER_MESSAGE,
  NET_MAX_PRESSES_PER_MESSAGE,
  NET_PING_FAST_COUNT,
  NET_PING_FAST_INTERVAL_MS,
  NET_PING_INTERVAL_MS,
} from '../../sim/balance';
import type { GameEvent } from '../../sim/orders';
import type { GameState } from '../../sim/state';
import { type RoundView, frameView, predictedView } from '../roundView';
import { runsFrom, ticketUpdate } from './onlineRules';

/** How the scene reaches the game server; `null` where online play is off (`?scene=`). */
export interface OnlineOptions {
  /** The server's http(s) address (`serverUrl` in `profileApi.ts`). */
  serverUrl: string;
  /** Who this browser is right now: sent in the hello. */
  identity: () => Identity;
  /** Dev only (`?lag=&jitter=`): delays every message in and out. */
  lag: LagSettings | null;
  /** The ping corner shows from the start (`N` toggles it). */
  netHud: boolean;
  /** Predict this machine's players' movement (`?predict=0` turns it off, for comparison). */
  predict: boolean;
  /** Where this tab keeps its rejoin ticket (`sessionStorage`), so a reload gets back into the room. */
  tickets: TicketStore | null;
}

/** Keeps one text (the rejoin ticket) for this browser tab, with the wall clock to date it. */
export interface TicketStore {
  load(): string | null;
  /** `null` forgets it. */
  save(text: string | null): void;
  nowMs(): number;
}

/** What the ping corner shows. */
export interface NetStats {
  /** Smoothed round trip, or `null` before the first pong. */
  rttMs: number | null;
  /** Where render time is against the snapshots; `null` outside a round. */
  status: InterpolationStatus | null;
  /** Simulated lag, if on. */
  lag: LagSettings | null;
  /** Whether this machine's players are predicted. */
  predict: boolean;
}

/**
 * Emitted on `game.events` with `NetStats` a few times a second while online
 * and the ping corner is on, and with `null` when it should hide.
 */
export const NET_STATS_EVENT = 'net-stats';

/** How often the ping corner updates. */
const NET_STATS_EVERY_MS = 250;

/**
 * Dev builds put this on `window.isvNet` while online, for checking
 * smoothness from a script: what the last frame drew.
 */
export interface NetDebug {
  renderTick: number | null;
  status: InterpolationStatus | null;
  rttMs: number | null;
  /** Frames drawn in the round, and how many of them held a snapshot waiting for the next. */
  frames: number;
  waitingFrames: number;
  /** Where each player was drawn, by id. */
  players: Record<number, { x: number; y: number }>;
  /** Where the newest snapshot has each player (the server's word), by id. */
  server: Record<number, { x: number; y: number }>;
  score: number | null;
  ticksLeft: number | null;
  screen: string | null;
  /** The state drawn (not a copy: read it, don't change it). */
  state: GameState | null;
  /** Snapshot events played this round, by type. */
  eventsPlayed: Record<string, number>;
  /** The music track playing. */
  music: string | null;
  /** Prediction of this machine's players: on or off, who, how it's going. */
  predict: { on: boolean; local: number[]; stats: PredictionStats | null };
  /**
   * Set it to `[]` from a script to record every drawn frame (time, render
   * tick, input target tick, drawn positions); `null` records nothing.
   */
  trace: TraceFrame[] | null;
}

/** One drawn frame of an online round, for `NetDebug.trace`. */
export interface TraceFrame {
  t: number;
  renderTick: number | null;
  targetTick: number | null;
  players: Record<number, { x: number; y: number }>;
}

/** The trace never grows past this many frames (a few minutes at 60 Hz). */
const TRACE_MAX_FRAMES = 20_000;

/** What `OnlineSession` needs from the game around it. */
export interface OnlineSessionDeps {
  /** This browser's own flow, kept for the whole game (its `online` screen shows the room). */
  flow: Flow;
  save: SaveData;
  storage: StorageLike | null;
  /** A new online round started: anything couch-only (first-level hints) goes. */
  onRoundStart(): void;
  /** The ping corner: what to show, or `null` to hide it. */
  emitNetStats(stats: NetStats | null): void;
}

/** One frame of the online round, ready to draw. */
export interface OnlineFrame {
  view: RoundView;
  events: GameEvent[];
  /** The room's state (not the predicted one). */
  state: GameState;
}

/**
 * This browser's online room: connecting, hosting, joining and rejoining
 * after a reload (with the tab's rejoin ticket), the clock synced by pings,
 * this machine's inputs and presses out to the server, the round from its
 * snapshots, and prediction of this machine's players. Kept across scene
 * restarts.
 */
export class OnlineSession {
  /** The room this browser is in (or connecting to), or `null`. */
  state: OnlineState | null = null;
  /** The online round on screen (from `roundStart` on). */
  round: OnlineRound | null = null;
  readonly debug: NetDebug = {
    renderTick: null,
    status: null,
    rttMs: null,
    frames: 0,
    waitingFrames: 0,
    players: {},
    server: {},
    score: null,
    ticksLeft: null,
    screen: null,
    state: null,
    eventsPlayed: {},
    music: null,
    predict: { on: false, local: [], stats: null },
    trace: null,
  };
  private connection: NetConnection | null = null;
  /** Bumped whenever a join is dropped, so a late answer to it is left at once. */
  private attempt = 0;
  /** A network callback changed what the screens show. */
  private dirty = false;
  /** The online round was dropped: the scene restarts for a clean map. */
  private roundDropped = false;
  /** The round whose results this browser already chimed and saved. */
  private recordedRound: OnlineRound | null = null;
  private clock: ClockSync = createClockSync();
  private readonly stamper = createInputStamper();
  private pingsSent = 0;
  private lastPingMs = -Infinity;
  private netHudOn: boolean;
  private lastNetStatsMs = -Infinity;
  /** Prediction of this machine's players' movement in the online round. */
  private readonly prediction: Prediction;
  private lastPredictMs: number | null = null;

  constructor(
    private readonly options: OnlineOptions | null,
    private readonly deps: OnlineSessionDeps,
  ) {
    this.netHudOn = options?.netHud ?? false;
    this.prediction = createPrediction(options?.predict ?? true);
  }

  /** Whether something changed what the screens show since the last call. */
  takeDirty(): boolean {
    const dirty = this.dirty;
    this.dirty = false;
    return dirty;
  }

  /** `N`: shows or hides the ping corner. */
  toggleNetHud(): void {
    this.netHudOn = !this.netHudOn;
    this.lastNetStatsMs = -Infinity;
  }

  /** This browser picked a new display name: tell the room. */
  rename(displayName: string): void {
    this.connection?.send({ type: 'rename', displayName });
  }

  /**
   * Sends a flow command to the room's server, which answers a refusal with
   * an `error` (kept as `setupError`). Returns `false` outside a room.
   */
  sendCommand(command: FlowCommand): boolean {
    const online = this.state;
    if (!online) return false;
    online.setupError = null;
    this.dirty = true;
    this.connection?.send(command);
    return true;
  }

  /**
   * Hands players whose device went away to a device that pressed (and
   * tells the server). Returns the presses that didn't claim anyone.
   */
  claimDevices(frame: InputFrame): DevicePress[] {
    const online = this.state;
    if (!online) return [...frame.presses];
    const bindings = localBindings(online);
    const before = bindings.map((p) => p.deviceId);
    claimOrphanedPlayer(bindings, frame.presses, new Set(frame.readings.keys()));
    const claimed = bindings.filter((p, i) => p.deviceId !== before[i]);
    for (const p of claimed)
      this.connection?.send({ type: 'takeover', playerId: p.playerId, deviceId: p.deviceId });
    return frame.presses.filter((p) => !claimed.some((b) => b.deviceId === p.deviceId));
  }

  /**
   * This machine's menu presses go to the server. Returns `true` when they
   * ask to leave the room instead (back on the lobby), and sends nothing.
   */
  sendMenu(presses: readonly DevicePress[], nowMs: number): boolean {
    const online = this.state;
    if (!online) return false;
    const { send, leave, changed } = onlineMenuPresses(online, presses, nowMs);
    if (leave) return true;
    if (changed) this.dirty = true;
    if (send.length > 0) {
      online.setupError = null;
      this.connection?.send({ type: 'menu', presses: send.slice(0, NET_MAX_PRESSES_PER_MESSAGE) });
    }
    return false;
  }

  /**
   * The level the scene must restart on, when the online round needs another
   * map (a round on another level started, by index in `levelIds`) or a clean
   * one (the round was dropped); `null` when it doesn't.
   */
  takeRestart(levelIds: readonly string[], mapLevelIndex: number): number | null {
    const round = this.round;
    if (round) {
      const index = levelIds.indexOf(round.levelId);
      if (index >= 0 && index !== mapLevelIndex) {
        this.roundDropped = false;
        return index;
      }
    }
    if (!this.roundDropped) return null;
    this.roundDropped = false;
    return mapLevelIndex;
  }

  /** Pings the server now and then, so the clock stays synced. */
  ping(now: number): void {
    const connection = this.connection;
    if (!connection || this.state?.status !== 'connected') return;
    const every =
      this.pingsSent < NET_PING_FAST_COUNT ? NET_PING_FAST_INTERVAL_MS : NET_PING_INTERVAL_MS;
    if (now - this.lastPingMs < every) return;
    this.lastPingMs = now;
    connection.send({ type: 'ping', id: this.pingsSent++, clientTimeMs: now });
  }

  /**
   * This machine's players' inputs for the tick they'll land on, while the
   * round takes them (and during the countdown, so the first tick has them).
   */
  sendInputs(frame: InputFrame, now: number): void {
    const online = this.state;
    if (!online) return;
    const screen = online.flow?.screen;
    if (!this.connection || online.status !== 'connected') return;
    if (screen !== 'playing' && screen !== 'countdown') return;
    const target = inputTargetTick(this.clock, now);
    const bindings = localBindings(online);
    if (target === null || bindings.length === 0) return;
    const inputs = stampInputs(
      this.stamper,
      buildInputCommands(bindings, frame.readings, target),
      target,
    );
    if (inputs.length === 0) return;
    const sent = inputs.slice(0, NET_MAX_INPUTS_PER_MESSAGE);
    recordInputs(this.prediction, sent);
    this.connection.send({ type: 'inputs', inputs: sent });
  }

  /**
   * The online round as it was a moment ago, with the events that happened
   * by then and this machine's players where prediction has them; `null`
   * before there is anything to draw. Updates `debug`.
   */
  sampleFrame(round: OnlineRound, flow: Flow, now: number): OnlineFrame | null {
    const renderTick = roundRenderTick(this.clock, now);
    const frame = sampleRound(round, renderTick);
    if (!frame) return null;
    const events = takeDueEvents(round, renderTick);
    const view = this.predictedFrame(frame, now);

    const debug = this.debug;
    debug.renderTick = renderTick;
    debug.status = frame.status;
    debug.rttMs = this.clock.rttMs;
    debug.frames++;
    if (frame.status === 'waiting') debug.waitingFrames++;
    debug.players = {};
    for (const player of view.state.players) {
      const pos = view.renderPos(player.id);
      if (pos) debug.players[player.id] = { x: pos.x, y: pos.y };
    }
    const newest = round.buffer.entries[round.buffer.entries.length - 1];
    debug.server = {};
    for (const player of newest?.state.players ?? []) {
      debug.server[player.id] = { x: player.pos.x, y: player.pos.y };
    }
    debug.predict = {
      on: this.prediction.enabled,
      local: this.prediction.current.map((p) => p.id),
      stats: { ...this.prediction.stats },
    };
    if (debug.trace) {
      if (debug.trace.length >= TRACE_MAX_FRAMES) debug.trace.shift();
      debug.trace.push({
        t: now,
        renderTick,
        targetTick: inputTargetTickExact(this.clock, now),
        players: debug.players,
      });
    }
    debug.score = frame.state.score;
    debug.ticksLeft = frame.state.settings.durationTicks - frame.state.tick;
    debug.screen = flow.screen;
    debug.state = view.state;
    for (const e of events) debug.eventsPlayed[e.type] = (debug.eventsPlayed[e.type] ?? 0) + 1;
    return { view, events, state: frame.state };
  }

  /**
   * The room's results came up: the round goes in this browser's save too
   * (the server writes the same into the profile). Once per round. Returns
   * the stars to chime, or `null` when there is nothing to chime.
   */
  finishRound(round: OnlineRound, flow: Flow): number | null {
    const results = flow.results;
    if (flow.screen !== 'results' || !results || this.recordedRound === round) return null;
    // Right after the host picks Retry or Next, the new round's `roundStart`
    // is here before the snapshot that leaves the results: only a round that
    // ended counts.
    const newest = round.buffer.entries[round.buffer.entries.length - 1];
    if (!newest?.state.result) return null;
    this.recordedRound = round;
    // A page that came back (reload) on the results didn't see the round end:
    // no chimes, and the server's profile has it already.
    if (!round.sawPlaying) return null;
    // Someone who joined while it ran only watched: not their round.
    const { save, storage } = this.deps;
    if (storage && round.counted) {
      recordLevel(save.levels, round.levelId, { score: results.score, stars: results.stars });
      writeSave(storage, save);
    }
    return results.stars;
  }

  /** Tells the ping corner what to show, a few times a second. */
  updateNetStats(now: number): void {
    if (now - this.lastNetStatsMs < NET_STATS_EVERY_MS) return;
    this.lastNetStatsMs = now;
    const stats: NetStats | null =
      this.netHudOn && this.state
        ? {
            rttMs: this.clock.rttMs,
            status: this.round ? this.debug.status : null,
            lag: this.options?.lag ?? null,
            predict: this.prediction.enabled,
          }
        : null;
    this.deps.emitNetStats(stats);
    if (import.meta.env.DEV) window.isvNet = this.debug;
  }

  /** Creates (host) or joins a room. The answer arrives later, in `connected` or as a failure. */
  start(role: OnlineRole, code = ''): void {
    const options = this.options;
    const attempt = ++this.attempt;
    this.state = role === 'host' ? createOnline('host') : null;
    this.dirty = true;
    if (!options) {
      this.failed(role, 'unreachable');
      return;
    }
    const hello = helloFor(options.identity());
    const connect = { lag: options.lag };
    const pending =
      role === 'host'
        ? hostRoom(options.serverUrl, hello, connect)
        : joinRoomByCode(options.serverUrl, code, hello, connect);
    pending.then(
      (connection) => {
        if (attempt !== this.attempt) {
          void connection.leave();
          return;
        }
        this.connected(role, connection);
      },
      (error: unknown) => {
        if (attempt === this.attempt) this.failed(role, toJoinError(error).code);
      },
    );
  }

  /** The join that is out is dropped: a late answer to it is left at once. */
  cancelJoin(): void {
    this.attempt++;
  }

  /**
   * Once per page: a tab that was in a room before a reload goes straight
   * back in, and the ticket gets a fresh date when the page goes away (the
   * server's grace period starts then).
   */
  boot(): void {
    const tickets = this.options?.tickets;
    if (!tickets) return;
    window.addEventListener('pagehide', () => {
      this.saveTicket();
    });
    const ticket = parseTicket(tickets.load(), tickets.nowMs());
    if (!ticket) {
      tickets.save(null);
      return;
    }
    enterOnline(this.deps.flow);
    this.startRejoin(ticket.role, ticket.joinCode, ticket.token);
  }

  /**
   * Leaves the room (or drops the join that is out) and takes the flow back
   * to the title. Returns `true` when a round was on screen: the scene then
   * restarts for a clean map.
   */
  leave(): boolean {
    this.attempt++;
    const role = this.state?.role;
    void this.connection?.leave();
    this.connection = null;
    this.state = null;
    this.saveTicket();
    const { flow } = this.deps;
    if (flow.screen === 'online') {
      onlineEnded(flow, role === 'join' ? 'joinOnline' : 'hostOnline');
    }
    this.deps.emitNetStats(null);
    if (!this.round) return false;
    this.round = null;
    this.roundDropped = false;
    return true;
  }

  /**
   * The round's frame with this machine's players where prediction has them:
   * runs the prediction up to this frame's input tick and lets corrections
   * glide. Without prediction (off, or nothing to predict), the frame as is.
   */
  private predictedFrame(frame: InterpolatedFrame<GameState>, now: number): RoundView {
    const prediction = this.prediction;
    const target = inputTargetTickExact(this.clock, now);
    if (target !== null) advancePrediction(prediction, target);
    decayCorrections(prediction, this.lastPredictMs === null ? 0 : now - this.lastPredictMs);
    this.lastPredictMs = now;
    if (!isPredicting(prediction)) return frameView(frame);
    const alpha = target === null ? 1 : predictionAlpha(prediction, target);
    return predictedView(frame, prediction, alpha);
  }

  /**
   * Prediction takes in a snapshot the round kept: where the server had this
   * machine's players, and whether the round was playing then.
   */
  private reconcilePrediction(online: OnlineState, snapshot: Snapshot, flow: Flow | null): void {
    const { state } = snapshot;
    reconcile(
      this.prediction,
      {
        serverTick: snapshot.serverTick,
        players: state.players,
        managers: state.managers,
        events: snapshot.events,
        runsFrom: runsFrom(flow, snapshot.serverTick, state.result !== null),
      },
      localBindings(online).map((b) => b.playerId),
    );
  }

  /** A message from the room: the session state, the clock, and the round. */
  private serverMessage(online: OnlineState, message: ServerMessage): void {
    if (applyServerMessage(online, message)) this.dirty = true;
    switch (message.type) {
      case 'pong':
        addPong(this.clock, message, performance.now());
        break;
      case 'roundStart': {
        const before = this.round;
        // The same round again after a reconnect carries on; a new one starts clean.
        this.round = continueOnlineRound(before, message);
        if (this.round === before) {
          this.reconcilePrediction(online, message.snapshot, online.flow);
          break;
        }
        resetPrediction(this.prediction, message.level);
        this.reconcilePrediction(online, message.snapshot, online.flow);
        this.deps.onRoundStart();
        this.debug.frames = 0;
        this.debug.waitingFrames = 0;
        this.debug.eventsPlayed = {};
        resetInputStamper(this.stamper);
        break;
      }
      case 'snapshot': {
        const round = this.round;
        if (!round) break;
        if (!message.game) {
          this.dropRound();
        } else if (
          message.game.state.levelId === round.levelId &&
          pushRoundSnapshot(round, message.game)
        ) {
          this.reconcilePrediction(online, message.game, message.flow);
        }
        break;
      }
      default:
        break;
    }
  }

  /** The online round is over (back to the level select, or the room is gone). */
  private dropRound(): void {
    if (!this.round) return;
    this.round = null;
    this.roundDropped = true;
    resetPrediction(this.prediction, null);
    this.debug.status = null;
  }

  /** Back into the room this tab was in (a reload), with the token it kept. */
  private startRejoin(role: OnlineRole, joinCode: string, token: string): void {
    const options = this.options;
    if (!options) return;
    const attempt = ++this.attempt;
    this.state = createRejoin(role, joinCode);
    this.dirty = true;
    rejoinRoom(options.serverUrl, token, { lag: options.lag }).then(
      (connection) => {
        if (attempt !== this.attempt) {
          void connection.leave();
          return;
        }
        this.connected(role, connection);
      },
      (error: unknown) => {
        if (attempt !== this.attempt || !this.state) return;
        const code = toJoinError(error).code;
        setOnlineStatus(this.state, 'closed', code === 'unreachable' ? code : 'reconnectFailed');
        this.saveTicket();
        this.dirty = true;
      },
    );
  }

  /** Keeps this tab's way back into the room (or forgets it once out of the room). */
  private saveTicket(): void {
    const tickets = this.options?.tickets;
    if (!tickets) return;
    const update = ticketUpdate(this.state, this.connection, tickets.nowMs());
    if (update.kind === 'clear') tickets.save(null);
    else if (update.kind === 'save') tickets.save(update.text);
  }

  private failed(role: OnlineRole, error: OnlineError): void {
    if (role === 'join') joinFailed(this.deps.flow, error);
    else if (this.state) setOnlineStatus(this.state, 'closed', error);
    this.dirty = true;
  }

  private connected(role: OnlineRole, connection: NetConnection): void {
    const online = this.state ?? createOnline(role);
    this.state = online;
    this.connection = connection;
    this.clock = createClockSync();
    resetInputStamper(this.stamper);
    this.pingsSent = 0;
    this.lastPingMs = -Infinity;
    onlineConnected(online, connection.sessionId, connection.joinCode);
    if (role === 'join') joinSucceeded(this.deps.flow);
    connection.onMessage((message) => {
      if (this.connection === connection) this.serverMessage(online, message);
    });
    connection.onStatus((status, error) => {
      if (this.connection !== connection) return;
      setOnlineStatus(online, status, error);
      if (status === 'connected') {
        // Back after a drop: a new token for a reload, and inputs start over.
        resetInputStamper(this.stamper);
        this.saveTicket();
      }
      if (status === 'closed') {
        this.connection = null;
        this.saveTicket();
        this.dropRound();
      }
      this.dirty = true;
    });
    this.saveTicket();
    this.dirty = true;
  }
}
