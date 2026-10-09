import Phaser from 'phaser';
import { type BuildingMap, type Zone, getZone } from '../sim/map';
import { type Point, type Rotation, TILE_H, diamondPoints, tileDepth, tileToScreen } from './iso';

/** Placeholder colors until the art pass. */
const FLOOR_COLORS: Readonly<Record<Exclude<Zone, 'wall' | 'void'>, number>> = {
  floor: 0x3a4a5c,
  corridor: 0x5c5649,
  entrance: 0xe8a33d,
  locked: 0x262b33,
};
const GRID_LINE_COLOR = 0x000000;
const GRID_LINE_ALPHA = 0.3;
const LOCKED_MARK_COLOR = 0x4a515e;

const WALL_HEIGHT = TILE_H * 0.75;
const WALL_TOP_COLOR = 0x9aa3b5;
const WALL_LEFT_COLOR = 0x646c7e;
const WALL_RIGHT_COLOR = 0x4a5262;
const WALL_EDGE_COLOR = 0x2a2f38;

/** Chevron floating above entrances so front walls can't hide them. */
const ENTRANCE_MARKER_COLOR = 0xffb547;
const ENTRANCE_MARKER_LIFT = TILE_H * 1.4;
const ENTRANCE_MARKER_SIZE = 8;

/** Floor sits below everything; walls use `tileDepth`, which is >= 0. */
const FLOOR_DEPTH = -1;
/** Overlays draw above all tile-depth objects. */
export const OVERLAY_DEPTH = 1_000_000;

/** Phaser's polygon helpers are typed for Vector2; iso math returns plain points. */
export function vectors(points: readonly Point[]): Phaser.Math.Vector2[] {
  return points.map((p) => new Phaser.Math.Vector2(p.x, p.y));
}

/**
 * Draws a building map: one Graphics for all floor diamonds and one per wall
 * block so walls depth-sort by `tileDepth`. Everything is rebuilt when the
 * view rotates; the map is small enough that this is instant.
 */
export class MapRenderer {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private debugLabels: Phaser.GameObjects.Text[] = [];
  private rotation: Rotation = 0;
  private debugVisible = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: BuildingMap,
  ) {
    this.draw();
  }

  setRotation(rotation: Rotation): void {
    if (rotation === this.rotation) return;
    this.rotation = rotation;
    this.draw();
  }

  setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    for (const label of this.debugLabels) label.setVisible(visible);
  }

  private draw(): void {
    for (const obj of this.objects) obj.destroy();
    this.objects = [];
    this.debugLabels = [];
    this.drawFloor();
    this.drawWalls();
    this.drawEntranceMarkers();
    this.createDebugLabels();
  }

  private forEachTile(fn: (x: number, y: number, zone: Zone) => void): void {
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) fn(x, y, getZone(this.map, x, y));
    }
  }

  private graphics(depth: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics().setDepth(depth);
    this.objects.push(g);
    return g;
  }

  private drawFloor(): void {
    const g = this.graphics(FLOOR_DEPTH);
    this.forEachTile((x, y, zone) => {
      if (zone === 'void' || zone === 'wall') return;
      const points = diamondPoints(x, y, this.rotation);
      g.fillStyle(FLOOR_COLORS[zone]);
      g.fillPoints(vectors(points), true);
      g.lineStyle(1, GRID_LINE_COLOR, GRID_LINE_ALPHA);
      g.strokePoints(vectors(points), true);
      if (zone === 'locked') {
        // An inset diamond marks plots you can't use yet.
        const c = tileToScreen(x, y, this.rotation);
        const inset = points.map((p) => ({
          x: c.x + (p.x - c.x) * 0.5,
          y: c.y + (p.y - c.y) * 0.5,
        }));
        g.lineStyle(1, LOCKED_MARK_COLOR);
        g.strokePoints(vectors(inset), true);
      }
    });
  }

  private drawWalls(): void {
    this.forEachTile((x, y, zone) => {
      if (zone !== 'wall') return;
      const [top, right, bottom, left] = diamondPoints(x, y, this.rotation);
      const up = (p: Point): Point => ({ x: p.x, y: p.y - WALL_HEIGHT });
      const g = this.graphics(tileDepth(x, y, this.rotation));

      const leftFace = [up(left), up(bottom), bottom, left];
      const rightFace = [up(bottom), up(right), right, bottom];
      const topFace = [up(top), up(right), up(bottom), up(left)];

      g.fillStyle(WALL_LEFT_COLOR);
      g.fillPoints(vectors(leftFace), true);
      g.fillStyle(WALL_RIGHT_COLOR);
      g.fillPoints(vectors(rightFace), true);
      g.fillStyle(WALL_TOP_COLOR);
      g.fillPoints(vectors(topFace), true);
      g.lineStyle(1, WALL_EDGE_COLOR, 0.6);
      g.strokePoints(vectors(leftFace), true);
      g.strokePoints(vectors(rightFace), true);
      g.strokePoints(vectors(topFace), true);
    });
  }

  private drawEntranceMarkers(): void {
    const g = this.graphics(OVERLAY_DEPTH - 1);
    this.forEachTile((x, y, zone) => {
      if (zone !== 'entrance') return;
      const c = tileToScreen(x, y, this.rotation);
      const tipY = c.y - ENTRANCE_MARKER_LIFT;
      const s = ENTRANCE_MARKER_SIZE;
      g.fillStyle(ENTRANCE_MARKER_COLOR);
      g.lineStyle(2, 0x000000, 0.5);
      g.fillTriangle(c.x - s, tipY - s * 1.5, c.x + s, tipY - s * 1.5, c.x, tipY);
      g.strokeTriangle(c.x - s, tipY - s * 1.5, c.x + s, tipY - s * 1.5, c.x, tipY);
    });
  }

  private createDebugLabels(): void {
    this.forEachTile((x, y, zone) => {
      if (zone === 'void') return;
      const c = tileToScreen(x, y, this.rotation);
      const label = this.scene.add
        .text(c.x, zone === 'wall' ? c.y - WALL_HEIGHT : c.y, `${x},${y}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(OVERLAY_DEPTH)
        .setVisible(this.debugVisible);
      this.objects.push(label);
      this.debugLabels.push(label);
    });
  }
}
