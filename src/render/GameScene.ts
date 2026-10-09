import Phaser from 'phaser';
import startupPit from '../../maps/startup-pit.txt?raw';
import { type BuildingMap, type Zone, getZone, parseMap } from '../sim/map';
import { CameraController } from './CameraController';
import { TILE_H, TILE_W, diamondPoints, screenToTile, tileToScreen } from './iso';
import { MAP_OVERHANG, MapRenderer, OVERLAY_DEPTH, vectors } from './MapRenderer';

export interface TileHover {
  x: number;
  y: number;
  zone: Zone;
}

/**
 * Emitted on `game.events` with a `TileHover`, or `null` when off the map or
 * outside debug mode.
 */
export const TILE_HOVER_EVENT = 'tile-hover';

const HOVER_COLOR = 0xffffff;

export class GameScene extends Phaser.Scene {
  private map!: BuildingMap;
  private cameraController!: CameraController;
  private mapRenderer!: MapRenderer;
  private hoverOutline!: Phaser.GameObjects.Graphics;
  private hovered: TileHover | null = null;
  private debugVisible = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.map = parseMap(startupPit);
    this.mapRenderer = new MapRenderer(this, this.map);
    this.hoverOutline = this.add.graphics().setDepth(OVERLAY_DEPTH).setVisible(false);
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

  update(): void {
    this.updateHover();
  }

  /** World-space box spanned by the map's diamonds and what stands on them. */
  private mapBounds() {
    const { width, height } = this.map;
    const corners = [
      tileToScreen(0, 0),
      tileToScreen(width - 1, 0),
      tileToScreen(0, height - 1),
      tileToScreen(width - 1, height - 1),
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    return {
      left: Math.min(...xs) - TILE_W / 2,
      right: Math.max(...xs) + TILE_W / 2,
      top: Math.min(...ys) - TILE_H / 2 - MAP_OVERHANG,
      bottom: Math.max(...ys) + TILE_H / 2,
    };
  }

  /** Runs every frame so hover stays right while panning/zooming with a still mouse. */
  private updateHover(): void {
    const pointer = this.input.activePointer;
    const overCanvas = pointer.active && this.input.isOver;
    let next: TileHover | null = null;
    if (this.debugVisible && overCanvas) {
      const world = this.cameraController.screenToWorld(pointer.x, pointer.y);
      const tile = screenToTile(world.x, world.y);
      const zone = getZone(this.map, tile.x, tile.y);
      if (zone !== 'void') next = { ...tile, zone };
    }

    const prev = this.hovered;
    if (prev?.x === next?.x && prev?.y === next?.y) return;
    this.hovered = next;

    this.hoverOutline.clear();
    this.hoverOutline.setVisible(next !== null);
    if (next) {
      this.hoverOutline.lineStyle(2, HOVER_COLOR);
      this.hoverOutline.strokePoints(vectors(diamondPoints(next.x, next.y)), true);
    }
    this.game.events.emit(TILE_HOVER_EVENT, next);
  }
}
