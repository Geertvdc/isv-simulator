import Phaser from 'phaser';
import { buildInputCommands } from '../input/commands';
import type { DevicePress } from '../input/controller';
import { type InputFrame, InputDevices } from '../input/devices';
import { claimOrphanedPlayer } from '../input/lobby';
import {
  type Flow,
  type FlowContext,
  type FlowEffect,
  type FlowUpdate,
  type OnlineError,
  cancelJoinCode,
  countdownNumber,
  createFlow,
  editJoinCode,
  enterOnline,
  finishRound,
  isRoundRunning,
  joinFailed,
  joinSucceeded,
  onlineEnded,
  resultsReady,
  submitJoinCode,
  updateFlow,
} from '../flow/flow';
import type { Identity } from '../flow/identity';
import {
  type OnlineRole,
  type OnlineState,
  applyServerMessage,
  createOnline,
  createRejoin,
  localBindings,
  onlineConnected,
  onlineMenuPresses,
  onlineNowMs,
  setOnlineStatus,
} from '../flow/online';
import {
  type NetConnection,
  helloFor,
  hostRoom,
  joinRoomByCode,
  rejoinRoom,
  toJoinError,
} from '../net/client';
import {
  type ClockSync,
  addPong,
  createClockSync,
  inputTargetTick,
  inputTargetTickExact,
} from '../net/clock';
import { createInputStamper, resetInputStamper, stampInputs } from '../net/inputStamp';
import type { InterpolatedFrame, InterpolationStatus } from '../net/interpolation';
import type { LagSettings } from '../net/lag';
import {
  type OnlineRound,
  continueOnlineRound,
  pushRoundSnapshot,
  roundRenderTick,
  sampleRound,
  takeDueEvents,
} from '../net/onlineRound';
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
} from '../net/prediction';
import { encodeTicket, parseTicket } from '../net/rejoin';
import type { ServerMessage } from '../net/protocol';
import type { Snapshot } from '../net/snapshot';
import { type HintId, startHints, updateHints } from '../flow/hints';
import {
  type ChapterInfo,
  type SaveData,
  type StorageLike,
  recordLevel,
  writeSave,
} from '../flow/save';
import {
  NET_MAX_INPUTS_PER_MESSAGE,
  NET_MAX_PRESSES_PER_MESSAGE,
  NET_PING_FAST_COUNT,
  NET_PING_FAST_INTERVAL_MS,
  NET_PING_INTERVAL_MS,
  RESULTS_STAR_DELAY_MS,
  RESULTS_STAR_INTERVAL_MS,
  SCREEN_FADE_MS,
  SFX_VOLUME_MAX,
} from '../sim/balance';
import { type LevelMap, type Tile, getTile, isWorkSurface } from '../sim/level';
import { CHAPTERS, LEVELS } from '../sim/levels';
import type { GameEvent } from '../sim/orders';
import { type Scene, sceneDone, sceneInputs, sceneState } from '../sim/scenes';
import { type GameState, type PlayerId, createGame, targetTile } from '../sim/state';
import { CameraController } from './CameraController';
import type { WorldRect } from './cameraFit';
import { EffectsRenderer } from './EffectsRenderer';
import { HintRenderer } from './HintRenderer';
import { GameLoop } from './GameLoop';
import {
  MAP_OVERHANG,
  MapRenderer,
  OVERLAY_DEPTH,
  DEFAULT_LOOK,
  FLOOR_THEMES,
  type MapLook,
  WALL_THEMES,
  preloadMapSprites,
  vectors,
} from './MapRenderer';
import { playerColor } from './playerColors';
import { ManagerRenderer } from './ManagerRenderer';
import { MeetingRenderer } from './MeetingRenderer';
import { PipelineRenderer } from './PipelineRenderer';
import { PlayerRenderer } from './PlayerRenderer';
import { MusicPlayer } from './MusicPlayer';
import { musicCue } from './music';
import { SoundPlayer } from './SoundPlayer';
import { screenToTile, tileCorners, tileDepth } from './projection';
import { type RoundView, frameView, predictedView } from './roundView';
import { TicketRenderer } from './TicketRenderer';

export interface TileHover {
  x: number;
  y: number;
  tile: Tile;
}

/**
 * Emitted on `game.events` with a `TileHover`, or `null` when off the map or
 * outside debug mode.
 */
export const TILE_HOVER_EVENT = 'tile-hover';

export interface GameFrame {
  state: GameState;
  /** Sim events from the ticks run this frame. */
  events: GameEvent[];
}

/**
 * Emitted on `game.events` with a `GameFrame` every frame while a round is
 * on screen (also while paused or on the results), and with `null` when
 * there is no round.
 */
export const GAME_FRAME_EVENT = 'game-frame';

/** What the menus show: the flow plus what it is read with. */
export interface FlowView {
  flow: Flow;
  save: SaveData;
  levelIds: readonly string[];
  chapters: readonly ChapterInfo[];
  unlockAll: boolean;
  /** On the results screen: presses count now. */
  resultsReady: boolean;
  /** During the countdown: the number showing (3, 2, 1). */
  countdown: number | null;
  /**
   * In an online room: the session. `flow` is then the room's flow from the
   * server (or this browser's own `online` screen while connecting) and
   * `save.levels` the room's unlocks.
   */
  online: OnlineState | null;
}

/** Emitted on `game.events` with a `FlowView` whenever the screens change. */
export const FLOW_EVENT = 'flow';

/** Emitted on `game.events` by the speaker button: turns all sound off or back on. */
export const TOGGLE_SOUND_EVENT = 'toggle-sound';

/** Emitted on `game.events` with a `ProfileAction` when a profile screen line is picked. */
export const PROFILE_ACTION_EVENT = 'profile-action';

/**
 * Emitted on `game.events` by the UI with `true` when a text dialog opens and
 * `false` when it closes: menu presses wait meanwhile.
 */
export const DIALOG_EVENT = 'dialog';

/** Emitted on `game.events` by the scene: a back button was pressed while a dialog is open. */
export const DIALOG_CANCEL_EVENT = 'dialog-cancel';

/** What the join-code screen's text box did. */
export type JoinCodeInput =
  { type: 'text'; text: string } | { type: 'submit' } | { type: 'cancel' };

/** Emitted on `game.events` by the UI with a `JoinCodeInput`. */
export const JOIN_CODE_EVENT = 'join-code';

/** Emitted on `game.events` by the UI: the Leave button of an online room was clicked. */
export const ONLINE_LEAVE_EVENT = 'online-leave';

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

/** Handed to the scene once, at boot. */
export interface GameSceneOptions {
  storage: StorageLike | null;
  save: SaveData;
  /** `?unlockAll`: every level is open. */
  unlockAll: boolean;
  /** `?scene=<id>`: shows that scene (see `src/sim/scenes.ts`) instead of the menus. */
  scene: Scene | null;
  online: OnlineOptions | null;
}

/**
 * Set on `window.isvScene` while a scene shows: `done` once it froze, so a
 * script (`scripts/screenshots.ts`) knows when to take the picture.
 */
export interface SceneHandle {
  done: boolean;
}

/** What the scene is restarted with when the level changes or a round is dropped. */
interface SceneData {
  levelIndex?: number;
  /** Start a round right away. */
  startRound?: boolean;
}

const HOVER_COLOR = 0xffffff;
/** Over the target block's top, under its label. */
const TARGET_DEPTH_OFFSET = 0.005;
const LEVEL_IDS: readonly string[] = LEVELS.map((l) => l.id);
const CHAPTER_INFO: readonly ChapterInfo[] = CHAPTERS.map((c) => ({
  levelIds: c.levels.map((l) => l.id),
  starGate: c.starGate,
}));

/** The id of the chapter holding level `index`, if any. */
function chapterIdOf(index: number): string | null {
  const id = LEVEL_IDS[index];
  return CHAPTERS.find((c) => c.levels.some((l) => l.id === id))?.id ?? null;
}

/** The first round's seed; every restart moves on to the next one. */
const FIRST_SEED = 1;
/** Map look per level id; levels not listed get `DEFAULT_LOOK`. */
const LEVEL_LOOKS: Readonly<Record<string, MapLook>> = {
  garage: { walls: 'plaster', floor: 'concrete' },
  'open-plan': { walls: 'glass', floor: 'carpet' },
  'scale-up': { walls: 'wood', floor: 'parquet' },
  // Startup: a loft, warm wood.
  'seed-round': { walls: 'wood', floor: 'concrete' },
  'demo-day': { walls: 'plaster', floor: 'parquet' },
  'on-call': { walls: 'wood', floor: 'carpet' },
  // Scale-Up: glass walls go in.
  'middle-management': { walls: 'glass', floor: 'concrete' },
  hypergrowth: { walls: 'glass', floor: 'parquet' },
  'hot-desking': { walls: 'plaster', floor: 'carpet' },
  // Enterprise: carpet and glass as far as the eye can see.
  'back-to-back': { walls: 'glass', floor: 'carpet' },
  synergy: { walls: 'plaster', floor: 'concrete' },
  'the-reorg': { walls: 'glass', floor: 'carpet' },
};

/** The level's look, with `?walls=` and `?floor=` overriding it to preview others. */
function mapLook(levelId: string): MapLook {
  const params = new URLSearchParams(window.location.search);
  const look = LEVEL_LOOKS[levelId] ?? DEFAULT_LOOK;
  return {
    walls: WALL_THEMES.find((t) => t === params.get('walls')) ?? look.walls,
    floor: FLOOR_THEMES.find((t) => t === params.get('floor')) ?? look.floor,
  };
}

interface TargetHighlight {
  g: Phaser.GameObjects.Graphics;
  tile: { x: number; y: number } | null;
}

export class GameScene extends Phaser.Scene {
  private map!: LevelMap;
  private cameraController!: CameraController;
  private mapRenderer!: MapRenderer;
  private hoverOutline!: Phaser.GameObjects.Graphics;
  /**
   * Kept for the whole game, across scene restarts: new devices would see
   * buttons still held from the menu press that restarted the scene as new
   * presses.
   */
  private devices: InputDevices | null = null;
  /** The music; kept across scene restarts so it plays on. */
  private music: MusicPlayer | null = null;
  /** The screens; kept across scene restarts. */
  private readonly flow: Flow = createFlow();
  /** The level whose map is loaded. */
  private mapLevelIndex = 0;
  /** The round on screen, or `null` in menus outside a round. */
  private loop: GameLoop | null = null;
  private playerRenderer!: PlayerRenderer;
  private managerRenderer!: ManagerRenderer;
  private meetingRenderer!: MeetingRenderer;
  private ticketRenderer!: TicketRenderer;
  private pipelineRenderer!: PipelineRenderer;
  private effects!: EffectsRenderer;
  private hintRenderer!: HintRenderer;
  /** First-level hints still showing in this round. */
  private hints: HintId[] = [];
  private sounds!: SoundPlayer;
  private readonly targets = new Map<PlayerId, TargetHighlight>();
  private hovered: TileHover | null = null;
  private debugVisible = false;
  private seed = FIRST_SEED;
  /** What the last `FLOW_EVENT` said about the results taking presses. */
  private shownResultsReady = false;
  /** The countdown number the last `FLOW_EVENT` showed. */
  private shownCountdown: number | null = null;
  /** Ticks the scene from `?scene=` has run, and whether it froze. */
  private sceneTicks = 0;
  /** When the scene's map started fading in. */
  private sceneStartMs = 0;
  private readonly sceneHandle: SceneHandle = { done: false };
  /** A text dialog is open in the UI: menu presses wait, back cancels it. */
  private dialogOpen = false;
  /**
   * The online room this browser is in (or connecting to), shown while the
   * local flow is on its `online` screen. Kept across scene restarts.
   */
  private online: OnlineState | null = null;
  private connection: NetConnection | null = null;
  /** Bumped whenever a join is dropped, so a late answer to it is left at once. */
  private onlineAttempt = 0;
  /** A network callback changed what the screens show. */
  private onlineDirty = false;
  /** The online round on screen (from `roundStart` on), kept across scene restarts. */
  private onlineRound: OnlineRound | null = null;
  /** An online round was dropped: the scene restarts for a clean map. */
  private onlineRoundDropped = false;
  /** The round whose results this browser already chimed and saved. */
  private recordedRound: OnlineRound | null = null;
  /** The boot-time checks (a rejoin ticket, the page-hide hook) ran; not again on scene restarts. */
  private booted = false;
  private clock: ClockSync = createClockSync();
  private readonly stamper = createInputStamper();
  private pingsSent = 0;
  private lastPingMs = -Infinity;
  private netHudOn = false;
  private lastNetStatsMs = -Infinity;
  private readonly netDebug: NetDebug = {
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
  /** Prediction of this machine's players' movement in the online round. */
  private readonly prediction: Prediction;
  private lastPredictMs: number | null = null;

  constructor(private readonly options: GameSceneOptions) {
    super('GameScene');
    const id = options.scene?.levelId;
    if (id) this.mapLevelIndex = Math.max(0, LEVEL_IDS.indexOf(id));
    this.netHudOn = options.online?.netHud ?? false;
    this.prediction = createPrediction(options.online?.predict ?? true);
  }

  preload(): void {
    preloadMapSprites(this);
    SoundPlayer.preload(this);
    MusicPlayer.preload(this);
  }

  create(data: SceneData = {}): void {
    this.mapLevelIndex = data.levelIndex ?? this.mapLevelIndex;
    const level = LEVELS[this.mapLevelIndex];
    if (!level) throw new Error(`No level ${this.mapLevelIndex}`);
    this.map = level.map;
    // Restarts reuse this object; the old sprites went with the old scene.
    this.targets.clear();
    this.hovered = null;
    this.mapRenderer = new MapRenderer(this, this.map, mapLook(level.id));
    this.hoverOutline = this.add.graphics().setDepth(OVERLAY_DEPTH).setVisible(false);
    this.devices ??= new InputDevices(window);
    if (!this.music) {
      this.music = new MusicPlayer(this.game);
      // Phaser pauses sound whenever the window loses focus (e.g. after Tab or a click
      // in the address bar) and waits for a click to bring it back. Only pause while
      // the page is actually hidden, which also stops the game loop.
      this.game.sound.pauseOnBlur = false;
      this.game.events.on(Phaser.Core.Events.HIDDEN, () => {
        this.game.sound.pauseAll();
      });
      this.game.events.on(Phaser.Core.Events.VISIBLE, () => {
        this.game.sound.resumeAll();
      });
    }
    this.game.events.off(TOGGLE_SOUND_EVENT);
    this.game.events.on(TOGGLE_SOUND_EVENT, () => {
      this.toggleSound();
    });
    this.game.events.off(DIALOG_EVENT);
    this.game.events.on(DIALOG_EVENT, (open: boolean) => {
      this.dialogOpen = open;
    });
    this.game.events.off(JOIN_CODE_EVENT);
    this.game.events.on(JOIN_CODE_EVENT, (input: JoinCodeInput) => {
      this.joinCodeInput(input);
    });
    this.game.events.off(ONLINE_LEAVE_EVENT);
    this.game.events.on(ONLINE_LEAVE_EVENT, () => {
      this.leaveOnline();
    });
    this.playerRenderer = new PlayerRenderer(this);
    this.managerRenderer = new ManagerRenderer(this);
    this.meetingRenderer = new MeetingRenderer(this, this.map);
    this.ticketRenderer = new TicketRenderer(this, this.mapRenderer);
    this.pipelineRenderer = new PipelineRenderer(this, this.mapRenderer);
    this.effects = new EffectsRenderer(this);
    this.hintRenderer = new HintRenderer(this, this.map, this.mapRenderer);
    this.sounds = new SoundPlayer(this);
    this.cameraController = new CameraController(this, this.mapBounds());
    this.cameras.main.fadeIn(SCREEN_FADE_MS);
    this.applySettings();

    this.loop = null;
    this.hints = [];
    if (!this.booted) {
      this.booted = true;
      this.boot();
    }
    if (this.options.scene) this.startScene(this.options.scene);
    else if (data.startRound) this.startRound();
    else this.game.events.emit(GAME_FRAME_EVENT, null);
    this.emitFlow(0);

    const K = Phaser.Input.Keyboard.KeyCodes;
    // Backtick for macOS, where F3 is taken by the OS; F3 still works elsewhere.
    this.input.keyboard?.addKey(K.M).on('down', () => {
      this.toggleSound();
    });
    this.input.keyboard?.addKey(K.N).on('down', () => {
      this.netHudOn = !this.netHudOn;
      this.lastNetStatsMs = -Infinity;
    });
    for (const code of [K.BACKTICK, K.F3]) {
      this.input.keyboard?.addKey(code).on('down', () => {
        this.debugVisible = !this.debugVisible;
        this.mapRenderer.setDebugVisible(this.debugVisible);
        this.cameraController.setDebug(this.debugVisible);
      });
    }
  }

  update(time: number, delta: number): void {
    if (!this.devices) return;
    const frame = this.devices.poll();
    if (this.flow.screen === 'online') {
      this.updateOnline(frame, time, delta);
      this.updateHover();
      return;
    }
    const { players } = this.flow.lobby;
    if (this.flow.lobby.started) {
      claimOrphanedPlayer(players, frame.presses, new Set(frame.readings.keys()));
    }

    const ctx = this.flowContext(time);
    const update = updateFlow(this.flow, this.menuPresses(frame.presses), ctx);
    if (this.runEffects(update.effects)) return;
    const ready = resultsReady(this.flow, time);
    const countdown = countdownNumber(this.flow, time);
    const dirty = this.takeOnlineDirty();
    if (
      update.changed ||
      dirty ||
      ready !== this.shownResultsReady ||
      countdown !== this.shownCountdown
    ) {
      this.emitFlow(time);
    }

    const loop = this.loop;
    if (loop) {
      const running = isRoundRunning(this.flow);
      if (running) {
        const scene = this.options.scene;
        if (scene) this.advanceScene(scene, loop, delta, time);
        else loop.advance(delta, (tick) => buildInputCommands(players, frame.readings, tick));
        this.followHints(loop);
        const result = loop.state.result;
        if (result) {
          this.runEffects(finishRound(this.flow, result, ctx).effects);
          this.emitFlow(time);
          this.countStars(this.flow.results?.stars ?? 0);
        }
      }
      // Paused or done: nothing new happened, so nothing to react to.
      this.renderRound(loop, running ? loop.events : [], this.flow, time);
    }
    this.updateMusic(delta, this.flow, this.loop?.state ?? null);
    this.updateHover();
  }

  /**
   * Draws the round from `view` (the couch's `GameLoop`, or an online
   * round's interpolated frame) with this frame's events: every renderer,
   * the HUD, effects and sounds.
   */
  private renderRound(
    view: RoundView,
    events: readonly GameEvent[],
    flow: Flow,
    time: number,
  ): void {
    const { state } = view;
    this.game.events.emit(GAME_FRAME_EVENT, { state, events: [...events] } satisfies GameFrame);
    this.playerRenderer.sync(view);
    this.managerRenderer.sync(view, time);
    this.meetingRenderer.sync(view, time);
    this.ticketRenderer.sync(view);
    this.pipelineRenderer.sync(state, time);
    this.effects.play(state, events);
    this.sounds.play(state, events, time);
    for (const player of state.players) this.updateTarget(view, player.id);
    const screen = flow.screen;
    this.hintRenderer.sync(this.hints, screen === 'countdown' || screen === 'playing', time);
  }

  /** This frame's presses for the menus: none while a dialog is open (back closes it). */
  private menuPresses(presses: readonly DevicePress[]): readonly DevicePress[] {
    if (!this.dialogOpen) return presses;
    if (presses.some((p) => p.dash || p.menu)) this.game.events.emit(DIALOG_CANCEL_EVENT);
    return [];
  }

  /** The music for `flow` (this browser's, or the online room's) and the round on screen. */
  private updateMusic(deltaMs: number, flow: Flow, state: GameState | null): void {
    if (!this.music) return;
    const cue = musicCue(flow, {
      chapterId: chapterIdOf(flow.levelIndex),
      ticksLeft: state ? state.settings.durationTicks - state.tick : null,
    });
    this.netDebug.music = cue.track;
    this.music.update(cue, deltaMs);
  }

  /** A chime for each star as the results screen fills them in. */
  private countStars(stars: number): void {
    for (let i = 0; i < stars; i++) {
      this.time.delayedCall(RESULTS_STAR_DELAY_MS + i * RESULTS_STAR_INTERVAL_MS, () => {
        this.sounds.sound('ship');
      });
    }
  }

  /** Drops the hints the last ticks followed; saves once all were. */
  private followHints(loop: GameLoop): void {
    if (this.hints.length === 0) return;
    const { open, finished } = updateHints(this.hints, loop.events, loop.state);
    this.hints = open;
    if (!finished) return;
    this.options.save.tutorialDone = true;
    writeSave(this.options.storage, this.options.save);
  }

  private flowContext(nowMs: number): FlowContext {
    return {
      save: this.options.save,
      levelIds: LEVEL_IDS,
      chapters: CHAPTER_INFO,
      unlockAll: this.options.unlockAll,
      nowMs,
    };
  }

  private emitFlow(nowMs: number): void {
    // Online, the screens show the room: its flow, its clock and its unlocks.
    const online = this.flow.screen === 'online' ? this.online : null;
    const flow = online?.flow ?? this.flow;
    const now = online ? onlineNowMs(online) : nowMs;
    this.shownResultsReady = resultsReady(flow, now);
    this.shownCountdown = countdownNumber(flow, now);
    this.game.events.emit(FLOW_EVENT, {
      flow,
      save: online ? { ...this.options.save, levels: online.levels } : this.options.save,
      levelIds: LEVEL_IDS,
      chapters: CHAPTER_INFO,
      unlockAll: online ? false : this.options.unlockAll,
      resultsReady: this.shownResultsReady,
      countdown: this.shownCountdown,
      online,
    } satisfies FlowView);
  }

  private takeOnlineDirty(): boolean {
    const dirty = this.onlineDirty;
    this.onlineDirty = false;
    return dirty;
  }

  // ------------------------------------------------------------ online

  /**
   * A frame in an online room: this machine's presses go to the server (back
   * on the lobby leaves instead), and the screens follow the room.
   */
  private updateOnline(frame: InputFrame, nowMs: number, deltaMs: number): void {
    const online = this.online;
    if (!online) {
      onlineEnded(this.flow);
      this.emitFlow(nowMs);
      return;
    }
    const { send, leave, changed } = onlineMenuPresses(
      online,
      this.menuPresses(frame.presses),
      nowMs,
    );
    if (leave) {
      this.leaveOnline();
      return;
    }
    if (changed) this.onlineDirty = true;
    if (send.length > 0) {
      this.connection?.send({ type: 'menu', presses: send.slice(0, NET_MAX_PRESSES_PER_MESSAGE) });
    }
    if (this.restartForOnlineRound()) return;
    const flow = online.flow;
    const roomNow = onlineNowMs(online);
    const ready = flow ? resultsReady(flow, roomNow) : false;
    const countdown = flow ? countdownNumber(flow, roomNow) : null;
    if (
      this.takeOnlineDirty() ||
      ready !== this.shownResultsReady ||
      countdown !== this.shownCountdown
    ) {
      this.emitFlow(nowMs);
    }

    const now = performance.now();
    this.ping(now);
    const round = this.onlineRound;
    let state: GameState | null = null;
    if (round && flow) {
      this.sendInputs(online, frame, now);
      state = this.renderOnlineRound(round, flow, now, nowMs);
      this.finishOnlineRound(round, flow);
    }
    this.updateMusic(deltaMs, flow ?? this.flow, state);
    this.updateNetStats(now);
  }

  /**
   * Restarts the scene when the online round needs another map (a round on
   * another level started) or a clean one (the round was dropped). Returns
   * whether it did.
   */
  private restartForOnlineRound(): boolean {
    const round = this.onlineRound;
    if (round) {
      const index = LEVEL_IDS.indexOf(round.levelId);
      if (index >= 0 && index !== this.mapLevelIndex) {
        this.onlineRoundDropped = false;
        this.scene.restart({ levelIndex: index } satisfies SceneData);
        return true;
      }
    }
    if (!this.onlineRoundDropped) return false;
    this.onlineRoundDropped = false;
    this.scene.restart({ levelIndex: this.mapLevelIndex } satisfies SceneData);
    return true;
  }

  /** Pings the server now and then, so the clock stays synced. */
  private ping(now: number): void {
    const connection = this.connection;
    if (!connection || this.online?.status !== 'connected') return;
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
  private sendInputs(online: OnlineState, frame: InputFrame, now: number): void {
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

  /** Draws the online round as it was a moment ago, with the events that happened by then. */
  private renderOnlineRound(
    round: OnlineRound,
    flow: Flow,
    now: number,
    time: number,
  ): GameState | null {
    const renderTick = roundRenderTick(this.clock, now);
    const frame = sampleRound(round, renderTick);
    if (!frame) return null;
    const events = takeDueEvents(round, renderTick);
    const view = this.predictedFrame(frame, now);
    this.renderRound(view, events, flow, time);

    const debug = this.netDebug;
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
    return frame.state;
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
        running: flow !== null && isRoundRunning(flow) && state.result === null,
      },
      localBindings(online).map((b) => b.playerId),
    );
  }

  /**
   * The room's results came up: the star chimes, and the round in this
   * browser's save too (the server writes the same into the profile). Once
   * per round.
   */
  private finishOnlineRound(round: OnlineRound, flow: Flow): void {
    const results = flow.results;
    if (flow.screen !== 'results' || !results || this.recordedRound === round) return;
    // Right after the host picks Retry or Next, the new round's `roundStart`
    // is here before the snapshot that leaves the results: only a round that
    // ended counts.
    const newest = round.buffer.entries[round.buffer.entries.length - 1];
    if (!newest?.state.result) return;
    this.recordedRound = round;
    // A page that came back (reload) on the results didn't see the round end:
    // no chimes, and the server's profile has it already.
    if (!round.sawPlaying) return;
    this.countStars(results.stars);
    // Someone who joined while it ran only watched: not their round.
    if (!this.options.storage || !round.counted) return;
    recordLevel(this.options.save.levels, round.levelId, {
      score: results.score,
      stars: results.stars,
    });
    writeSave(this.options.storage, this.options.save);
  }

  /** Tells the ping corner what to show, a few times a second. */
  private updateNetStats(now: number): void {
    if (now - this.lastNetStatsMs < NET_STATS_EVERY_MS) return;
    this.lastNetStatsMs = now;
    const stats: NetStats | null =
      this.netHudOn && this.online
        ? {
            rttMs: this.clock.rttMs,
            status: this.onlineRound ? this.netDebug.status : null,
            lag: this.options.online?.lag ?? null,
            predict: this.prediction.enabled,
          }
        : null;
    this.game.events.emit(NET_STATS_EVENT, stats);
    if (import.meta.env.DEV) {
      (window as unknown as { isvNet?: NetDebug }).isvNet = this.netDebug;
    }
  }

  /** A message from the room: the session state, the clock, and the round. */
  private serverMessage(online: OnlineState, message: ServerMessage): void {
    if (applyServerMessage(online, message)) this.onlineDirty = true;
    switch (message.type) {
      case 'pong':
        addPong(this.clock, message, performance.now());
        break;
      case 'roundStart': {
        const before = this.onlineRound;
        // The same round again after a reconnect carries on; a new one starts clean.
        this.onlineRound = continueOnlineRound(before, message);
        if (this.onlineRound === before) {
          this.reconcilePrediction(online, message.snapshot, online.flow);
          break;
        }
        resetPrediction(this.prediction, message.level);
        this.reconcilePrediction(online, message.snapshot, online.flow);
        // First-level hints are a couch thing: they'd point at one machine's players only.
        this.hints = [];
        this.netDebug.frames = 0;
        this.netDebug.waitingFrames = 0;
        this.netDebug.eventsPlayed = {};
        resetInputStamper(this.stamper);
        break;
      }
      case 'snapshot': {
        const round = this.onlineRound;
        if (!round) break;
        if (!message.game) {
          this.dropOnlineRound();
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
  private dropOnlineRound(): void {
    if (!this.onlineRound) return;
    this.onlineRound = null;
    this.onlineRoundDropped = true;
    resetPrediction(this.prediction, null);
    this.netDebug.status = null;
  }

  /** Creates (host) or joins a room. The answer arrives later, in `connected` or as a failure. */
  private startOnline(role: OnlineRole, code = ''): void {
    const options = this.options.online;
    const attempt = ++this.onlineAttempt;
    this.online = role === 'host' ? createOnline('host') : null;
    this.onlineDirty = true;
    if (!options) {
      this.onlineFailed(role, 'unreachable');
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
        if (attempt !== this.onlineAttempt) {
          void connection.leave();
          return;
        }
        this.connected(role, connection);
      },
      (error: unknown) => {
        if (attempt === this.onlineAttempt) this.onlineFailed(role, toJoinError(error).code);
      },
    );
  }

  /**
   * Once per page: a tab that was in a room before a reload goes straight
   * back in, and the ticket gets a fresh date when the page goes away (the
   * server's grace period starts then).
   */
  private boot(): void {
    const tickets = this.options.online?.tickets;
    if (!tickets || this.options.scene) return;
    window.addEventListener('pagehide', () => {
      this.saveTicket();
    });
    const ticket = parseTicket(tickets.load(), tickets.nowMs());
    if (!ticket) {
      tickets.save(null);
      return;
    }
    enterOnline(this.flow);
    this.startRejoin(ticket.role, ticket.joinCode, ticket.token);
  }

  /** Back into the room this tab was in (a reload), with the token it kept. */
  private startRejoin(role: OnlineRole, joinCode: string, token: string): void {
    const options = this.options.online;
    if (!options) return;
    const attempt = ++this.onlineAttempt;
    this.online = createRejoin(role, joinCode);
    this.onlineDirty = true;
    rejoinRoom(options.serverUrl, token, { lag: options.lag }).then(
      (connection) => {
        if (attempt !== this.onlineAttempt) {
          void connection.leave();
          return;
        }
        this.connected(role, connection);
      },
      (error: unknown) => {
        if (attempt !== this.onlineAttempt || !this.online) return;
        const code = toJoinError(error).code;
        setOnlineStatus(this.online, 'closed', code === 'unreachable' ? code : 'reconnectFailed');
        this.saveTicket();
        this.onlineDirty = true;
      },
    );
  }

  /** Keeps this tab's way back into the room (or forgets it once out of the room). */
  private saveTicket(): void {
    const tickets = this.options.online?.tickets;
    if (!tickets) return;
    const online = this.online;
    const connection = this.connection;
    // Still on the way back in: the ticket stays for another reload.
    if (online?.status === 'rejoining') return;
    if (!online || !connection || online.status === 'closed') {
      tickets.save(null);
      return;
    }
    tickets.save(
      encodeTicket({
        joinCode: connection.joinCode,
        token: connection.reconnectionToken(),
        role: online.role,
        savedAtMs: tickets.nowMs(),
      }),
    );
  }

  private onlineFailed(role: OnlineRole, error: OnlineError): void {
    if (role === 'join') joinFailed(this.flow, error);
    else if (this.online) setOnlineStatus(this.online, 'closed', error);
    this.onlineDirty = true;
  }

  private connected(role: OnlineRole, connection: NetConnection): void {
    const online = this.online ?? createOnline(role);
    this.online = online;
    this.connection = connection;
    this.clock = createClockSync();
    resetInputStamper(this.stamper);
    this.pingsSent = 0;
    this.lastPingMs = -Infinity;
    onlineConnected(online, connection.sessionId, connection.joinCode);
    if (role === 'join') joinSucceeded(this.flow);
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
        this.dropOnlineRound();
      }
      this.onlineDirty = true;
    });
    this.saveTicket();
    this.onlineDirty = true;
  }

  /** Leaves the room (or drops the join that is out) and goes back to the title. */
  private leaveOnline(): void {
    this.onlineAttempt++;
    const role = this.online?.role;
    void this.connection?.leave();
    this.connection = null;
    this.online = null;
    this.saveTicket();
    if (this.flow.screen === 'online') {
      onlineEnded(this.flow, role === 'join' ? 'joinOnline' : 'hostOnline');
    }
    this.game.events.emit(NET_STATS_EVENT, null);
    if (this.onlineRound) {
      // A clean map behind the title: no players or tickets left from the round.
      this.onlineRound = null;
      this.onlineRoundDropped = false;
      this.scene.restart({ levelIndex: this.mapLevelIndex } satisfies SceneData);
      return;
    }
    this.emitFlow(this.time.now);
  }

  /** The join-code text box: typing, Enter and Esc. */
  private joinCodeInput(input: JoinCodeInput): void {
    let update: FlowUpdate;
    if (input.type === 'text') {
      update = { changed: editJoinCode(this.flow, input.text), effects: [] };
    } else if (input.type === 'submit') {
      update = submitJoinCode(this.flow);
    } else {
      update = cancelJoinCode(this.flow);
    }
    this.runEffects(update.effects);
    // Always redrawn: the text box must show the code as the flow kept it.
    this.emitFlow(this.time.now);
  }

  /** Runs what the flow asked for. Returns whether the scene is restarting. */
  private runEffects(effects: readonly FlowEffect[]): boolean {
    for (const effect of effects) {
      switch (effect.type) {
        case 'startLevel':
          this.seed++;
          if (effect.levelIndex === this.mapLevelIndex) {
            this.startRound();
            break;
          }
          this.scene.restart({
            levelIndex: effect.levelIndex,
            startRound: true,
          } satisfies SceneData);
          return true;
        case 'resumeRound':
          this.loop?.resetTime();
          break;
        case 'stopRound':
          // A fresh scene on the same map: no players or tickets left standing around.
          this.scene.restart({ levelIndex: this.mapLevelIndex } satisfies SceneData);
          return true;
        case 'saveChanged':
          writeSave(this.options.storage, this.options.save);
          break;
        case 'settingsChanged':
          this.applySettings();
          break;
        case 'profileAction':
          this.game.events.emit(PROFILE_ACTION_EVENT, effect.action);
          break;
        case 'hostOnline':
          this.startOnline('host');
          break;
        case 'joinOnline':
          this.startOnline('join', effect.code);
          break;
        case 'cancelJoin':
          this.onlineAttempt++;
          break;
      }
    }
    return false;
  }

  /** Turns all sound and music off or back on, and remembers it. */
  private toggleSound(): void {
    const { settings } = this.options.save;
    settings.muted = !settings.muted;
    writeSave(this.options.storage, this.options.save);
    this.applySettings();
    this.emitFlow(this.time.now);
  }

  /** Sound and music volume, mute and screen shake from the save, applied right away. */
  private applySettings(): void {
    const { sfxVolume, musicVolume, screenShake, muted } = this.options.save.settings;
    this.game.sound.mute = muted;
    this.sounds.volume = sfxVolume / SFX_VOLUME_MAX;
    if (this.music) this.music.volume = musicVolume / SFX_VOLUME_MAX;
    this.effects.shakeEnabled = screenShake;
  }

  /** A fresh round of the loaded level with everyone in the lobby. */
  private startRound(): void {
    const level = LEVELS[this.mapLevelIndex];
    if (!level) return;
    const ids = this.flow.lobby.players.map((p) => p.playerId);
    this.loop = new GameLoop(createGame(level, this.seed, ids));
    this.hints = startHints(level.id, this.options.save);
  }

  /** The scene from `?scene=` as a round already playing: no title, lobby or countdown. */
  private startScene(scene: Scene): void {
    const ids = Array.from({ length: scene.players }, (_, i) => i + 1);
    this.flow.lobby = {
      players: ids.map((playerId) => ({ playerId, deviceId: `scene-${playerId}` })),
      started: true,
    };
    this.flow.levelIndex = this.mapLevelIndex;
    this.flow.screen = 'playing';
    this.loop = new GameLoop(sceneState(scene));
    this.sceneStartMs = this.time.now;
    (window as unknown as { isvScene?: SceneHandle }).isvScene = this.sceneHandle;
  }

  /** Plays the scene's ticks in real time, so effects show as in a round, then freezes. */
  private advanceScene(scene: Scene, loop: GameLoop, deltaMs: number, nowMs: number): void {
    // Wait for the fade-in, so the scene's moment shows in full.
    if (this.sceneHandle.done || nowMs < this.sceneStartMs + SCREEN_FADE_MS) {
      loop.resetTime();
      return;
    }
    // Checked before every tick, against the last tick's events: a frame may run a few.
    const done = () => {
      if (!this.sceneHandle.done)
        this.sceneHandle.done = sceneDone(scene, loop.state, this.sceneTicks);
      return this.sceneHandle.done;
    };
    loop.advance(deltaMs, () => {
      if (done()) return [];
      this.sceneTicks++;
      return sceneInputs(scene, loop.state);
    });
    done();
  }

  /** Outlines the counter or station a player faces, in their color; nothing for floor and walls. */
  private updateTarget(view: RoundView, id: PlayerId): void {
    let highlight = this.targets.get(id);
    if (!highlight) {
      highlight = { g: this.add.graphics().setVisible(false), tile: null };
      this.targets.set(id, highlight);
    }
    const target = targetTile(view.state, id);
    const next = isWorkSurface(getTile(this.map, target.x, target.y)) ? target : null;
    const prev = highlight.tile;
    if (prev?.x === next?.x && prev?.y === next?.y) return;
    highlight.tile = next;

    const g = highlight.g;
    g.clear();
    const top = next && this.mapRenderer.blockTop(next.x, next.y);
    g.setVisible(top !== null);
    if (!next || !top) return;
    const color = playerColor(id);
    // Later players draw slightly higher so two players targeting one block both show.
    g.setDepth(tileDepth(next.x, next.y) + TARGET_DEPTH_OFFSET * (1 + id / 10));
    g.fillStyle(color, 0.3);
    g.fillPoints(vectors(top), true);
    g.lineStyle(3, color);
    g.strokePoints(vectors(top), true);
  }

  /** World-space box spanned by the map's floor and what stands on it. */
  private mapBounds(): WorldRect {
    const { width, height } = this.map;
    const corners = [
      tileCorners(0, 0),
      tileCorners(width - 1, 0),
      tileCorners(0, height - 1),
      tileCorners(width - 1, height - 1),
    ].flat();
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys) - MAP_OVERHANG,
      bottom: Math.max(...ys),
    };
  }

  /** Runs every frame so hover stays right while panning/zooming with a still mouse. */
  private updateHover(): void {
    const pointer = this.input.activePointer;
    const overCanvas = pointer.active && this.input.isOver;
    let next: TileHover | null = null;
    if (this.debugVisible && overCanvas) {
      const world = this.cameraController.screenToWorld(pointer.x, pointer.y);
      const pos = screenToTile(world.x, world.y);
      const tile = getTile(this.map, pos.x, pos.y);
      if (tile) next = { ...pos, tile };
    }

    const prev = this.hovered;
    if (prev?.x === next?.x && prev?.y === next?.y) return;
    this.hovered = next;

    this.hoverOutline.clear();
    this.hoverOutline.setVisible(next !== null);
    if (next) {
      this.hoverOutline.lineStyle(2, HOVER_COLOR);
      this.hoverOutline.strokePoints(vectors(tileCorners(next.x, next.y)), true);
    }
    this.game.events.emit(TILE_HOVER_EVENT, next);
  }
}
