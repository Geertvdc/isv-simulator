import Phaser from 'phaser';
import garage from '../../maps/level-01-garage.txt?raw';
import { type LevelMap, type Tile, getTile, isWorkSurface, parseLevelMap } from '../sim/level';
import { createGame, targetTile } from '../sim/state';
import { CameraController } from './CameraController';
import type { WorldRect } from './cameraFit';
import { GameLoop } from './GameLoop';
import { KeyboardInput } from './KeyboardInput';
import { MAP_OVERHANG, MapRenderer, OVERLAY_DEPTH, vectors } from './MapRenderer';
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

const HOVER_COLOR = 0xffffff;
const TARGET_COLOR = 0xfff3a0;
/** Over the target block's top, under its label. */
const TARGET_DEPTH_OFFSET = 0.005;
/** Fixed until levels pick their own; the sim has no randomness yet anyway. */
const GAME_SEED = 1;
const LOCAL_PLAYER = 1;

export class GameScene extends Phaser.Scene {
  private map!: LevelMap;
  private cameraController!: CameraController;
  private mapRenderer!: MapRenderer;
  private hoverOutline!: Phaser.GameObjects.Graphics;
  private loop!: GameLoop;
  private keyboard!: KeyboardInput;
  private playerRenderer!: PlayerRenderer;
  private targetHighlight!: Phaser.GameObjects.Graphics;
  private targeted: { x: number; y: number } | null = null;
  private hovered: TileHover | null = null;
  private debugVisible = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.map = parseLevelMap(garage);
    this.mapRenderer = new MapRenderer(this, this.map);
    this.hoverOutline = this.add.graphics().setDepth(OVERLAY_DEPTH).setVisible(false);
    this.loop = new GameLoop(createGame(this.map, GAME_SEED));
    this.keyboard = new KeyboardInput(this, LOCAL_PLAYER);
    this.playerRenderer = new PlayerRenderer(this);
    this.targetHighlight = this.add.graphics().setVisible(false);
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
    this.loop.advance(delta, (tick) => [this.keyboard.command(tick)]);
    this.playerRenderer.sync(this.loop);
    this.updateTarget();
    this.updateHover();
  }

  /** Outlines the counter or station the player faces; nothing for floor and walls. */
  private updateTarget(): void {
    const target = targetTile(this.loop.state, LOCAL_PLAYER);
    const next = isWorkSurface(getTile(this.map, target.x, target.y)) ? target : null;
    const prev = this.targeted;
    if (prev?.x === next?.x && prev?.y === next?.y) return;
    this.targeted = next;

    const g = this.targetHighlight;
    g.clear();
    const top = next && this.mapRenderer.blockTop(next.x, next.y);
    g.setVisible(top !== null);
    if (!next || !top) return;
    g.setDepth(tileDepth(next.x, next.y) + TARGET_DEPTH_OFFSET);
    g.fillStyle(TARGET_COLOR, 0.35);
    g.fillPoints(vectors(top), true);
    g.lineStyle(3, TARGET_COLOR);
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
