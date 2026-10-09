import Phaser from 'phaser';
import { buildInputCommands } from '../input/commands';
import { type InputFrame, InputDevices } from '../input/devices';
import { type LevelSelect, createLevelSelect, updateLevelSelect } from '../input/levelSelect';
import { type Lobby, claimOrphanedPlayer, createLobby, updateLobby } from '../input/lobby';
import { END_SCREEN_INPUT_DELAY_MS } from '../sim/balance';
import { type LevelMap, type Tile, getTile, isWorkSurface } from '../sim/level';
import { LEVELS, type Level } from '../sim/levels';
import type { GameEvent } from '../sim/orders';
import { type GameState, type PlayerId, createGame, targetTile } from '../sim/state';
import { CameraController } from './CameraController';
import type { WorldRect } from './cameraFit';
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

/**
 * Emitted on `game.events` with the `Lobby` whenever it changes, and with
 * `null` once the game starts.
 */
export const LOBBY_EVENT = 'lobby';

export interface GameFrame {
  state: GameState;
  /** Sim events from the ticks run this frame. */
  events: GameEvent[];
  /** Whether the end screen takes a restart press yet. */
  canRestart: boolean;
}

/**
 * Emitted on `game.events` with a `GameFrame` every frame while a game runs,
 * and with `null` when it stops for the level select.
 */
export const GAME_FRAME_EVENT = 'game-frame';

/** Emitted on `game.events` with the `LevelSelect` whenever it changes, and with `null` once a level starts. */
export const LEVEL_SELECT_EVENT = 'level-select';

/** What the scene is restarted with when the level changes. */
interface SceneData {
  lobby?: Lobby;
  levelIndex?: number;
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
  private devices!: InputDevices;
  private lobby!: Lobby;
  private level!: Level;
  private levelIndex = 0;
  /** Set while players pick a level, after the lobby or between rounds. */
  private levelSelect: LevelSelect | null = null;
  /** `null` while players are still joining in the lobby or picking a level. */
  private loop: GameLoop | null = null;
  private playerRenderer!: PlayerRenderer;
  private ticketRenderer!: TicketRenderer;
  private pipelineRenderer!: PipelineRenderer;
  private readonly targets = new Map<PlayerId, TargetHighlight>();
  private hovered: TileHover | null = null;
  private debugVisible = false;
  private seed = FIRST_SEED;
  /** Scene time the current level ended, or `null` while it runs. */
  private endedAt: number | null = null;

  constructor() {
    super('GameScene');
  }

  preload(): void {
    preloadMapSprites(this);
  }

  create(data: SceneData = {}): void {
    this.levelIndex = data.levelIndex ?? this.levelIndex;
    const level = LEVELS[this.levelIndex];
    if (!level) throw new Error(`No level ${this.levelIndex}`);
    this.level = level;
    this.map = level.map;
    // Restarts reuse this object; the old sprites went with the old scene.
    this.targets.clear();
    this.hovered = null;
    this.endedAt = null;
    this.mapRenderer = new MapRenderer(this, this.map, mapLook(level.id));
    this.hoverOutline = this.add.graphics().setDepth(OVERLAY_DEPTH).setVisible(false);
    this.devices = new InputDevices(window);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.devices.destroy();
    });
    this.loop = null;
    this.levelSelect = null;
    if (data.lobby) {
      // Back from picking a different level: straight into a round.
      this.lobby = data.lobby;
      this.startRound();
    } else {
      this.lobby = createLobby();
      this.game.events.emit(LOBBY_EVENT, this.lobby);
    }
    this.playerRenderer = new PlayerRenderer(this);
    this.ticketRenderer = new TicketRenderer(this, this.mapRenderer);
    this.pipelineRenderer = new PipelineRenderer(this, this.mapRenderer);
    this.cameraController = new CameraController(this, this.mapBounds());

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
    const frame = this.devices.poll();
    const joined = new Set(this.lobby.players.map((p) => p.deviceId));
    if (!this.lobby.started) {
      this.updateLobby(frame.presses);
      this.updateHover();
      return;
    }
    claimOrphanedPlayer(this.lobby.players, frame.presses, new Set(frame.readings.keys()));

    const select = this.levelSelect;
    if (select) {
      if (updateLevelSelect(select, frame.presses, joined, LEVELS.length)) {
        this.game.events.emit(LEVEL_SELECT_EVENT, select);
      }
      if (select.chosen) this.playLevel(select.index);
      this.updateHover();
      return;
    }

    let loop = this.loop;
    if (!loop) return;
    loop.advance(delta, (tick) => buildInputCommands(this.lobby.players, frame.readings, tick));
    if (loop.state.result && this.endedAt === null) this.endedAt = time;
    const canRestart = this.endedAt !== null && time - this.endedAt >= END_SCREEN_INPUT_DELAY_MS;
    const ownPresses = frame.presses.filter((p) => joined.has(p.deviceId));
    if (canRestart && ownPresses.some((p) => p.dash)) {
      this.openLevelSelect();
      return;
    }
    if (canRestart && ownPresses.some((p) => p.join || p.interact)) {
      this.seed++;
      loop = this.startRound();
    }

    this.game.events.emit(GAME_FRAME_EVENT, {
      state: loop.state,
      events: loop.events,
      canRestart,
    } satisfies GameFrame);
    this.playerRenderer.sync(loop);
    this.ticketRenderer.sync(loop);
    this.pipelineRenderer.sync(loop.state, time);
    for (const player of loop.state.players) this.updateTarget(loop, player.id);
    this.updateHover();
  }

  /** Joins and starts in the lobby; once it starts, on to the level select. */
  private updateLobby(presses: InputFrame['presses']): void {
    if (!updateLobby(this.lobby, presses)) return;
    this.game.events.emit(LOBBY_EVENT, this.lobby.started ? null : this.lobby);
    if (this.lobby.started) this.openLevelSelect();
  }

  /** A fresh round of the level with everyone in the lobby. */
  private startRound(): GameLoop {
    const ids = this.lobby.players.map((p) => p.playerId);
    this.loop = new GameLoop(createGame(this.level, this.seed, ids));
    this.endedAt = null;
    return this.loop;
  }

  /** Stops any round and lets the players pick a level, starting on the current one. */
  private openLevelSelect(): void {
    this.loop = null;
    this.levelSelect = createLevelSelect(this.levelIndex);
    this.game.events.emit(GAME_FRAME_EVENT, null);
    this.game.events.emit(LEVEL_SELECT_EVENT, this.levelSelect);
  }

  /** Starts the picked level: on this map right away, or after rebuilding the scene for another. */
  private playLevel(index: number): void {
    this.levelSelect = null;
    this.game.events.emit(LEVEL_SELECT_EVENT, null);
    this.seed++;
    if (index === this.levelIndex) {
      this.startRound();
      return;
    }
    this.scene.restart({ lobby: this.lobby, levelIndex: index } satisfies SceneData);
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
