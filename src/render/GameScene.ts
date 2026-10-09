import Phaser from 'phaser';
import garage from '../../maps/level-01-garage.txt?raw';
import { buildInputCommands } from '../input/commands';
import { InputDevices } from '../input/devices';
import { type Lobby, claimOrphanedPlayer, createLobby, updateLobby } from '../input/lobby';
import { type LevelMap, type Tile, getTile, isWorkSurface, parseLevelMap } from '../sim/level';
import { type PlayerId, createGame, targetTile } from '../sim/state';
import { CameraController } from './CameraController';
import type { WorldRect } from './cameraFit';
import { GameLoop } from './GameLoop';
import { MAP_OVERHANG, MapRenderer, OVERLAY_DEPTH, vectors } from './MapRenderer';
import { playerColor } from './playerColors';
import { PlayerRenderer } from './PlayerRenderer';
import { screenToTile, tileCorners, tileDepth } from './projection';

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

const HOVER_COLOR = 0xffffff;
/** Over the target block's top, under its label. */
const TARGET_DEPTH_OFFSET = 0.005;
/** Fixed until levels pick their own; the sim has no randomness yet anyway. */
const GAME_SEED = 1;

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
  /** `null` while players are still joining in the lobby. */
  private loop: GameLoop | null = null;
  private playerRenderer!: PlayerRenderer;
  private readonly targets = new Map<PlayerId, TargetHighlight>();
  private hovered: TileHover | null = null;
  private debugVisible = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.map = parseLevelMap(garage);
    this.mapRenderer = new MapRenderer(this, this.map);
    this.hoverOutline = this.add.graphics().setDepth(OVERLAY_DEPTH).setVisible(false);
    this.devices = new InputDevices(window);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.devices.destroy();
    });
    this.lobby = createLobby();
    this.loop = null;
    this.game.events.emit(LOBBY_EVENT, this.lobby);
    this.playerRenderer = new PlayerRenderer(this);
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

  update(_time: number, delta: number): void {
    const frame = this.devices.poll();
    if (!this.loop) {
      if (updateLobby(this.lobby, frame.presses)) {
        this.game.events.emit(LOBBY_EVENT, this.lobby.started ? null : this.lobby);
      }
      if (!this.lobby.started) {
        this.updateHover();
        return;
      }
      const ids = this.lobby.players.map((p) => p.playerId);
      this.loop = new GameLoop(createGame(this.map, GAME_SEED, ids));
    } else {
      claimOrphanedPlayer(this.lobby.players, frame.presses, new Set(frame.readings.keys()));
    }

    const loop = this.loop;
    loop.advance(delta, (tick) => buildInputCommands(this.lobby.players, frame.readings, tick));
    this.playerRenderer.sync(loop);
    for (const player of loop.state.players) this.updateTarget(loop, player.id);
    this.updateHover();
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
