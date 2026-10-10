import Phaser from 'phaser';
import { buildInputCommands } from '../input/commands';
import { InputDevices } from '../input/devices';
import { claimOrphanedPlayer } from '../input/lobby';
import {
  type Flow,
  type FlowContext,
  type FlowEffect,
  createFlow,
  finishRound,
  isRoundRunning,
  resultsReady,
  updateFlow,
} from '../flow/flow';
import { type SaveData, type StorageLike, writeSave } from '../flow/save';
import { SFX_VOLUME_MAX } from '../sim/balance';
import { type LevelMap, type Tile, getTile, isWorkSurface } from '../sim/level';
import { LEVELS } from '../sim/levels';
import type { GameEvent } from '../sim/orders';
import { type GameState, type PlayerId, createGame, targetTile } from '../sim/state';
import { CameraController } from './CameraController';
import type { WorldRect } from './cameraFit';
import { EffectsRenderer } from './EffectsRenderer';
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
import { PipelineRenderer } from './PipelineRenderer';
import { PlayerRenderer } from './PlayerRenderer';
import { SoundPlayer } from './SoundPlayer';
import { screenToTile, tileCorners, tileDepth } from './projection';
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
  unlockAll: boolean;
  /** On the results screen: presses count now. */
  resultsReady: boolean;
}

/** Emitted on `game.events` with a `FlowView` whenever the screens change. */
export const FLOW_EVENT = 'flow';

/** Handed to the scene once, at boot. */
export interface GameSceneOptions {
  storage: StorageLike | null;
  save: SaveData;
  /** `?unlockAll`: every level is open. */
  unlockAll: boolean;
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
/** The first round's seed; every restart moves on to the next one. */
const FIRST_SEED = 1;
/** Map look per level id; levels not listed get `DEFAULT_LOOK`. */
const LEVEL_LOOKS: Readonly<Record<string, MapLook>> = {
  garage: { walls: 'plaster', floor: 'concrete' },
  'open-plan': { walls: 'glass', floor: 'carpet' },
  'scale-up': { walls: 'wood', floor: 'parquet' },
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
  /** The screens; kept across scene restarts. */
  private readonly flow: Flow = createFlow();
  /** The level whose map is loaded. */
  private mapLevelIndex = 0;
  /** The round on screen, or `null` in menus outside a round. */
  private loop: GameLoop | null = null;
  private playerRenderer!: PlayerRenderer;
  private ticketRenderer!: TicketRenderer;
  private pipelineRenderer!: PipelineRenderer;
  private effects!: EffectsRenderer;
  private sounds!: SoundPlayer;
  private readonly targets = new Map<PlayerId, TargetHighlight>();
  private hovered: TileHover | null = null;
  private debugVisible = false;
  private seed = FIRST_SEED;
  /** What the last `FLOW_EVENT` said about the results taking presses. */
  private shownResultsReady = false;

  constructor(private readonly options: GameSceneOptions) {
    super('GameScene');
  }

  preload(): void {
    preloadMapSprites(this);
    SoundPlayer.preload(this);
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
    this.playerRenderer = new PlayerRenderer(this);
    this.ticketRenderer = new TicketRenderer(this, this.mapRenderer);
    this.pipelineRenderer = new PipelineRenderer(this, this.mapRenderer);
    this.effects = new EffectsRenderer(this);
    this.sounds = new SoundPlayer(this);
    this.cameraController = new CameraController(this, this.mapBounds());
    this.applySettings();

    this.loop = null;
    if (data.startRound) this.startRound();
    else this.game.events.emit(GAME_FRAME_EVENT, null);
    this.emitFlow(0);

    const K = Phaser.Input.Keyboard.KeyCodes;
    // Backtick for macOS, where F3 is taken by the OS; F3 still works elsewhere.
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
    const { players } = this.flow.lobby;
    if (this.flow.lobby.started) {
      claimOrphanedPlayer(players, frame.presses, new Set(frame.readings.keys()));
    }

    const ctx = this.flowContext(time);
    const update = updateFlow(this.flow, frame.presses, ctx);
    if (this.runEffects(update.effects)) return;
    const ready = resultsReady(this.flow, time);
    if (update.changed || ready !== this.shownResultsReady) this.emitFlow(time);

    const loop = this.loop;
    if (loop) {
      const running = isRoundRunning(this.flow);
      if (running) {
        loop.advance(delta, (tick) => buildInputCommands(players, frame.readings, tick));
        const result = loop.state.result;
        if (result) {
          this.runEffects(finishRound(this.flow, result, ctx).effects);
          this.emitFlow(time);
        }
      }
      // Paused or done: nothing new happened, so nothing to react to.
      const events = running ? loop.events : [];
      this.game.events.emit(GAME_FRAME_EVENT, { state: loop.state, events } satisfies GameFrame);
      this.playerRenderer.sync(loop);
      this.ticketRenderer.sync(loop);
      this.pipelineRenderer.sync(loop.state, time);
      this.effects.play(loop.state, events);
      this.sounds.play(loop.state, events, time);
      for (const player of loop.state.players) this.updateTarget(loop, player.id);
    }
    this.updateHover();
  }

  private flowContext(nowMs: number): FlowContext {
    return {
      save: this.options.save,
      levelIds: LEVELS.map((l) => l.id),
      unlockAll: this.options.unlockAll,
      nowMs,
    };
  }

  private emitFlow(nowMs: number): void {
    this.shownResultsReady = resultsReady(this.flow, nowMs);
    this.game.events.emit(FLOW_EVENT, {
      flow: this.flow,
      save: this.options.save,
      levelIds: LEVELS.map((l) => l.id),
      unlockAll: this.options.unlockAll,
      resultsReady: this.shownResultsReady,
    } satisfies FlowView);
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
      }
    }
    return false;
  }

  /** Sound volume and screen shake from the save, applied right away. */
  private applySettings(): void {
    const { sfxVolume, screenShake } = this.options.save.settings;
    this.sound.volume = sfxVolume / SFX_VOLUME_MAX;
    this.effects.shakeEnabled = screenShake;
  }

  /** A fresh round of the loaded level with everyone in the lobby. */
  private startRound(): void {
    const level = LEVELS[this.mapLevelIndex];
    if (!level) return;
    const ids = this.flow.lobby.players.map((p) => p.playerId);
    this.loop = new GameLoop(createGame(level, this.seed, ids));
  }

  /** Outlines the counter or station a player faces, in their color; nothing for floor and walls. */
  private updateTarget(loop: GameLoop, id: PlayerId): void {
    let highlight = this.targets.get(id);
    if (!highlight) {
      highlight = { g: this.add.graphics().setVisible(false), tile: null };
      this.targets.set(id, highlight);
    }
    const target = targetTile(loop.state, id);
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
