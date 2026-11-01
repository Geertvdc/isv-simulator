import Phaser from 'phaser';
import { buildInputCommands } from '../input/commands';
import type { DevicePress } from '../input/controller';
import { type InputFrame, InputDevices } from '../input/devices';
import type { FlowCommand } from '../flow/commands';
import { rolesForRoster } from '../flow/roster';
import {
  type Flow,
  type FlowEffect,
  finishDemoRound,
  isRoundRunning,
  onlineEnded,
} from '../flow/flow';
import { onlineNowMs } from '../flow/online';
import { type HintId, startHints, updateHints } from '../flow/hints';
import { type SaveData, type StorageLike, writeSave } from '../flow/save';
import { DEMO_BOTS, SCREEN_FADE_MS } from '../sim/balance';
import { type LevelMap, type Tile, getTile } from '../sim/level';
import { type Bot, botInput, createBot } from '../sim/bot';
import { LEVELS, levelById, type Level } from '../sim/levels';
import type { GameEvent } from '../sim/orders';
import { type Scene, sceneDone, sceneInputs, sceneState } from '../sim/scenes';
import { type GameState, createGame } from '../sim/state';
import { GameLoop } from './GameLoop';
import { DEFAULT_LOOK, FLOOR_THEMES, LEVEL_LOOKS, type MapLook, WALL_THEMES } from './mapLook';
import type { MenuRenderer, MenuRendererFactory } from './MenuRenderer';
import { drawsMap, menuViewOf } from './menuView';
import type { RoundRenderer, RoundRendererFactory } from './RoundRenderer';
import type { RoundView } from './roundView';
import { AudioController } from './scene/AudioController';
import { LEVEL_IDS, chapterIdOf } from './scene/campaign';
import { FlowController, type JoinCodeInput } from './scene/FlowController';
import { NET_STATS_EVENT, type OnlineOptions, OnlineSession } from './scene/OnlineSession';

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

export type { FlowView, JoinCodeInput } from './scene/FlowController';

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

/** Emitted on `game.events` by the UI with a `JoinCodeInput`. */
export const JOIN_CODE_EVENT = 'join-code';

/** Emitted on `game.events` by the UI: the Leave button of an online room was clicked. */
export const ONLINE_LEAVE_EVENT = 'online-leave';
/** This browser picked a new display name (the identity already has it): tell the room. */
export const ONLINE_RENAME_EVENT = 'online-rename';
export {
  NET_STATS_EVENT,
  type NetDebug,
  type NetStats,
  type OnlineOptions,
  type TicketStore,
  type TraceFrame,
} from './scene/OnlineSession';

/** Emitted on `game.events` by the UI with a `FlowCommand` (roles, readiness). */
export const COMMAND_EVENT = 'flow-command';
export const INTRO_GUIDE_EVENT = 'intro-guide';

/** Handed to the scene once, at boot. */
export interface GameSceneOptions {
  storage: StorageLike | null;
  save: SaveData;
  /** `?unlockAll`: every level is open. */
  unlockAll: boolean;
  /** `?scene=<id>`: shows that scene (see `src/sim/scenes.ts`) instead of the menus. */
  scene: Scene | null;
  /** `?demo`: a kiosk for a booth. Starts in the demo, and every menu goes back to it when left alone. */
  kiosk: boolean;
  practiceLevel?: Level;
  /** `?draft=` with `?scene=`: a redesign draft shown in place of the scene's level of the same id. */
  draftLevel?: Level;
  online: OnlineOptions | null;
  /** Draws the level and rounds: `createThreeRoundRenderer`, passed in by `main.ts`. */
  roundRenderer: RoundRendererFactory;
  /** Draws the world map behind the menus: `createWorldMapRenderer`, passed in by `main.ts`. */
  menuRenderer: MenuRendererFactory;
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

/** The first round's seed; every restart moves on to the next one. */
const FIRST_SEED = 1;
/** The level's look, with `?walls=` and `?floor=` overriding it to preview others. */
function mapLook(levelId: string): MapLook {
  const params = new URLSearchParams(window.location.search);
  const look = LEVEL_LOOKS[levelId] ?? DEFAULT_LOOK;
  return {
    walls: WALL_THEMES.find((t) => t === params.get('walls')) ?? look.walls,
    floor: FLOOR_THEMES.find((t) => t === params.get('floor')) ?? look.floor,
    // `?setting=<chapter id>` previews another chapter's surroundings.
    setting:
      params.get('setting') ?? look.setting ?? chapterIdOf(LEVEL_IDS.indexOf(levelId)) ?? undefined,
  };
}

export class GameScene extends Phaser.Scene {
  private map!: LevelMap;
  private roundRenderer!: RoundRenderer;
  private menuRenderer!: MenuRenderer;
  /**
   * Kept for the whole game, across scene restarts: new devices would see
   * buttons still held from the menu press that restarted the scene as new
   * presses.
   */
  private devices: InputDevices | null = null;
  /** Music and sound effects; kept across scene restarts so the music plays on. */
  private readonly audio: AudioController;
  /** The screens and flow commands; kept across scene restarts. */
  private readonly flows: FlowController;
  /** The level whose map is loaded. */
  private mapLevelIndex = 0;
  /** The round on screen, or `null` in menus outside a round. */
  private loop: GameLoop | null = null;
  /** The bots playing the round, in the demo. */
  private bots: Bot[] = [];
  /** First-level hints still showing in this round. */
  private hints: HintId[] = [];
  private hovered: TileHover | null = null;
  private debugVisible = false;
  private seed = FIRST_SEED;
  /** Ticks the scene from `?scene=` has run, and whether it froze. */
  private sceneTicks = 0;
  /** When the scene's map started fading in. */
  private sceneStartMs = 0;
  private readonly sceneHandle: SceneHandle = { done: false };
  /** A text dialog is open in the UI: menu presses wait, back cancels it. */
  private dialogOpen = false;
  /** The online room, kept across scene restarts. */
  private readonly session: OnlineSession;
  /** The boot-time checks (a rejoin ticket, the page-hide hook) ran; not again on scene restarts. */
  private booted = false;

  constructor(private readonly options: GameSceneOptions) {
    super('GameScene');
    const id = options.scene?.levelId;
    if (id) this.mapLevelIndex = Math.max(0, LEVEL_IDS.indexOf(id));
    const session = (): OnlineSession => this.session;
    this.flows = new FlowController(
      {
        save: options.save,
        unlockAll: options.unlockAll,
        scene: options.scene !== null,
        kiosk: options.kiosk,
        practiceLevelId: options.practiceLevel?.id ?? null,
      },
      {
        get state() {
          return session().state;
        },
        sendCommand: (command) => session().sendCommand(command),
      },
      (view) => {
        this.menuRenderer.syncMenu(menuViewOf(view));
        this.game.events.emit(FLOW_EVENT, view);
      },
    );
    this.session = new OnlineSession(options.online, {
      flow: this.flow,
      save: options.save,
      storage: options.storage,
      onRoundStart: () => {
        // First-level hints are a couch thing: they'd point at one machine's players only.
        this.hints = [];
      },
      emitNetStats: (stats) => {
        this.game.events.emit(NET_STATS_EVENT, stats);
      },
    });
    this.audio = new AudioController(options.save, options.storage, chapterIdOf);
  }

  /** The screens; kept across scene restarts. */
  private get flow(): Flow {
    return this.flows.flow;
  }

  preload(): void {
    AudioController.preload(this);
  }

  create(data: SceneData = {}): void {
    this.mapLevelIndex = data.levelIndex ?? this.mapLevelIndex;
    // A scene may be on a lab level, outside the campaign.
    const sceneLevel = this.options.scene ? this.sceneLevel(this.options.scene) : undefined;
    const level = sceneLevel ?? this.options.practiceLevel ?? LEVELS[this.mapLevelIndex];
    if (!level) throw new Error(`No level ${this.mapLevelIndex}`);
    this.map = level.map;
    // Restarts reuse this object; the old sprites went with the old scene.
    this.hovered = null;
    const roundRenderer = this.options.roundRenderer(this, this.map, mapLook(level.id));
    this.roundRenderer = roundRenderer;
    const menuRenderer = this.options.menuRenderer(this);
    this.menuRenderer = menuRenderer;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      roundRenderer.destroy();
      menuRenderer.destroy();
    });
    this.devices ??= new InputDevices(window);
    this.audio.attach(this);
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
    this.game.events.off(ONLINE_RENAME_EVENT);
    this.game.events.on(ONLINE_RENAME_EVENT, (displayName: string) => {
      this.session.rename(displayName);
    });
    this.game.events.off(COMMAND_EVENT);
    this.game.events.on(COMMAND_EVENT, (command: FlowCommand) => {
      this.flows.dispatch(command, this.time.now);
    });
    this.cameras.main.fadeIn(SCREEN_FADE_MS);
    this.applySettings();

    this.loop = null;
    this.hints = [];
    if (!this.booted) {
      this.booted = true;
      if (!this.options.scene) this.session.boot();
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
      this.session.toggleNetHud();
    });
    for (const code of [K.BACKTICK, K.F3]) {
      this.input.keyboard?.addKey(code).on('down', () => {
        this.debugVisible = !this.debugVisible;
        this.roundRenderer.setDebug(this.debugVisible);
      });
    }
  }

  update(time: number, delta: number): void {
    if (!this.devices) return;
    const frame = this.devices.poll();
    if (this.flow.screen === 'online') {
      this.updateOnline(frame, time, delta);
      this.updateHover();
      this.renderStage(time, delta);
      return;
    }
    const { players } = this.flow.lobby;
    const presses = this.flows.claimDevices(frame);
    const update = this.flows.update(this.menuPresses(presses), time);
    if (this.runEffects(update.effects)) return;
    const dirty = this.session.takeDirty();
    if (update.changed || dirty || this.flows.shownChanged(this.flow, time)) {
      this.emitFlow(time);
    }

    const loop = this.loop;
    if (loop) {
      const running = isRoundRunning(this.flow);
      if (running) {
        const scene = this.options.scene;
        const bots = this.bots;
        if (scene) this.advanceScene(scene, loop, delta, time);
        else if (this.flow.screen === 'demo') {
          loop.advance(delta, () => bots.map((bot) => botInput(loop.state, bot, bots)));
        } else loop.advance(delta, (tick) => buildInputCommands(players, frame.readings, tick));
        this.followHints(loop);
        const result = loop.state.result;
        if (result && this.flow.screen === 'demo') {
          finishDemoRound(this.flow, result, time);
          this.emitFlow(time);
        } else if (result) {
          this.runEffects(this.flows.finishRound(result, time).effects);
          this.emitFlow(time);
          this.audio.countStars(this.flow.results?.stars ?? 0);
        }
      }
      // Paused or done: nothing new happened, so nothing to react to.
      this.renderRound(loop, running ? loop.events : [], this.flow, time);
    }
    this.updateMusic(delta, this.flow, this.loop?.state ?? null);
    this.updateHover();
    this.renderStage(time, delta);
  }

  /** Draws the world map on the menus and the level around a round: one of the two per frame. */
  private renderStage(time: number, delta: number): void {
    const room = this.flow.screen === 'online' ? (this.session.state?.flow ?? null) : null;
    if (drawsMap(this.flow, room, this.options.scene !== null)) {
      this.menuRenderer.render(time, delta);
    } else {
      this.roundRenderer.render(time, delta);
    }
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
    const screen = flow.screen;
    this.roundRenderer.syncRound({
      view,
      events,
      hints: this.hints,
      hintsVisible: screen === 'countdown' || screen === 'playing',
      timeMs: time,
    });
    this.audio.play(state, events, time);
  }

  /** This frame's presses for the menus: none while a dialog is open (back closes it). */
  private menuPresses(presses: readonly DevicePress[]): readonly DevicePress[] {
    if (this.dialogOpen) {
      if (presses.some((p) => p.dash || p.menu)) this.game.events.emit(DIALOG_CANCEL_EVENT);
      return [];
    }
    if (
      (this.session.state?.flow ?? this.flow).screen === 'intro' &&
      presses.some((p) => p.nav.y !== 0)
    )
      this.game.events.emit(INTRO_GUIDE_EVENT);
    return presses;
  }

  /** The music for `flow` (this browser's, or the online room's) and the round on screen. */
  private updateMusic(deltaMs: number, flow: Flow, state: GameState | null): void {
    this.session.debug.music = this.audio.updateMusic(deltaMs, flow, state);
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

  private emitFlow(nowMs: number): void {
    this.flows.emit(nowMs);
  }

  // ------------------------------------------------------------ online

  /**
   * A frame in an online room: this machine's presses go to the server (back
   * on the lobby leaves instead), and the screens follow the room.
   */
  private updateOnline(frame: InputFrame, nowMs: number, deltaMs: number): void {
    const session = this.session;
    const online = session.state;
    if (!online) {
      onlineEnded(this.flow);
      this.emitFlow(nowMs);
      return;
    }
    const presses = session.claimDevices(frame);
    if (session.sendMenu(this.menuPresses(presses), nowMs)) {
      this.leaveOnline();
      return;
    }
    const restart = session.takeRestart(LEVEL_IDS, this.mapLevelIndex);
    if (restart !== null) {
      this.scene.restart({ levelIndex: restart } satisfies SceneData);
      return;
    }
    const flow = online.flow;
    if (session.takeDirty() || this.flows.shownChanged(flow, onlineNowMs(online))) {
      this.emitFlow(nowMs);
    }

    const now = performance.now();
    session.ping(now);
    const round = session.round;
    let state: GameState | null = null;
    if (round && flow) {
      session.sendInputs(frame, now);
      const drawn = session.sampleFrame(round, flow, now);
      if (drawn) {
        this.renderRound(drawn.view, drawn.events, flow, nowMs);
        state = drawn.state;
      }
      const stars = session.finishRound(round, flow);
      if (stars !== null) this.audio.countStars(stars);
    }
    this.updateMusic(deltaMs, flow ?? this.flow, state);
    session.updateNetStats(now);
  }

  /** Leaves the room (or drops the join that is out) and goes back to the title. */
  private leaveOnline(): void {
    if (this.session.leave()) {
      // A clean map behind the title: no players or tickets left from the round.
      this.scene.restart({ levelIndex: this.mapLevelIndex } satisfies SceneData);
      return;
    }
    this.emitFlow(this.time.now);
  }

  /** The join-code text box: typing, Enter and Esc. */
  private joinCodeInput(input: JoinCodeInput): void {
    const update = this.flows.joinCode(input);
    this.runEffects(update.effects);
    // Always redrawn: the text box must show the code as the flow kept it.
    this.emitFlow(this.time.now);
  }

  /** Runs what the flow asked for. Returns whether the scene is restarting. */
  private runEffects(effects: readonly FlowEffect[]): boolean {
    for (const effect of effects) {
      switch (effect.type) {
        case 'lockRoster':
          this.startRound();
          break;
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
          this.session.start('host');
          break;
        case 'joinOnline':
          this.session.start('join', effect.code);
          break;
        case 'cancelJoin':
          this.session.cancelJoin();
          break;
      }
    }
    return false;
  }

  /** Turns all sound and music off or back on, and remembers it. */
  private toggleSound(): void {
    this.audio.toggleMute();
    this.applySettings();
    this.emitFlow(this.time.now);
  }

  /** Sound and music volume, mute, screen shake and graphics from the save, applied right away. */
  private applySettings(): void {
    const { screenShake, graphics } = this.options.save.settings;
    this.audio.applySettings();
    this.roundRenderer.setShake(screenShake);
    this.roundRenderer.setGraphics(graphics);
    this.menuRenderer.setGraphics(graphics);
  }

  /** A fresh round of the loaded level with everyone in the lobby, or bots in the demo. */
  private startRound(): void {
    const level = this.options.practiceLevel ?? LEVELS[this.mapLevelIndex];
    if (!level) return;
    const demo = this.flow.screen === 'demo';
    const ids = demo
      ? Array.from({ length: DEMO_BOTS }, (_, i) => i + 1)
      : this.flow.lobby.players.map((p) => p.playerId);
    this.bots = demo ? ids.map((id) => createBot(id)) : [];
    this.loop = new GameLoop(
      createGame(level, this.seed, ids, demo ? {} : rolesForRoster(this.flow.lobby)),
    );
    this.hints = demo ? [] : startHints(level.id, this.options.save);
  }

  /** The scene's level, or the draft from `?draft=` standing in for it. */
  private sceneLevel(scene: Scene): Level | undefined {
    const draft = this.options.draftLevel;
    return draft?.id === scene.levelId ? draft : levelById(scene.levelId);
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
    this.loop = new GameLoop(sceneState(scene, this.sceneLevel(scene)));
    this.sceneStartMs = this.time.now;
    window.isvScene = this.sceneHandle;
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

  /** Runs every frame so hover stays right while the view changes under a still mouse. */
  private updateHover(): void {
    const pointer = this.input.activePointer;
    const overCanvas = pointer.active && this.input.isOver;
    let next: TileHover | null = null;
    if (this.debugVisible && overCanvas) {
      const pos = this.roundRenderer.tileAt(pointer.x, pointer.y);
      const tile = getTile(this.map, pos.x, pos.y);
      if (tile) next = { ...pos, tile };
    }

    const prev = this.hovered;
    if (prev?.x === next?.x && prev?.y === next?.y) return;
    this.hovered = next;

    this.roundRenderer.setHover(next);
    this.game.events.emit(TILE_HOVER_EVENT, next);
  }
}
