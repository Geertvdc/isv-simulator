import type Phaser from 'phaser';
import { type LevelMap, getTile, isWorkSurface } from '../sim/level';
import { type PlayerId, targetTile } from '../sim/state';
import { CameraController } from './CameraController';
import type { WorldRect } from './cameraFit';
import { EffectsRenderer } from './EffectsRenderer';
import { HintRenderer } from './HintRenderer';
import { MAP_OVERHANG, MapRenderer, OVERLAY_DEPTH, vectors } from './MapRenderer';
import type { MapLook } from './mapLook';
import { ManagerRenderer } from './ManagerRenderer';
import { MeetingRenderer } from './MeetingRenderer';
import { PipelineRenderer } from './PipelineRenderer';
import { PlayerRenderer } from './PlayerRenderer';
import { playerColor } from './playerColors';
import { type Point, screenToTile, tileCorners, tileDepth } from './projection';
import type { RoundFrame, RoundRenderer } from './RoundRenderer';
import type { RoundView } from './roundView';
import { TicketRenderer } from './TicketRenderer';

const HOVER_COLOR = 0xffffff;
/** Over the target block's top, under its label. */
const TARGET_DEPTH_OFFSET = 0.005;

interface TargetHighlight {
  g: Phaser.GameObjects.Graphics;
  tile: { x: number; y: number } | null;
}

/** The 2D look: the level and round drawn with Phaser Graphics and sprites at our 3/4 view. */
export class PhaserRoundRenderer implements RoundRenderer {
  private readonly cameraController: CameraController;
  private readonly mapRenderer: MapRenderer;
  private readonly hoverOutline: Phaser.GameObjects.Graphics;
  private readonly playerRenderer: PlayerRenderer;
  private readonly managerRenderer: ManagerRenderer;
  private readonly meetingRenderer: MeetingRenderer;
  private readonly ticketRenderer: TicketRenderer;
  private readonly pipelineRenderer: PipelineRenderer;
  private readonly effects: EffectsRenderer;
  private readonly hintRenderer: HintRenderer;
  private readonly targets = new Map<PlayerId, TargetHighlight>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: LevelMap,
    look: MapLook,
  ) {
    this.mapRenderer = new MapRenderer(scene, map, look);
    this.hoverOutline = scene.add.graphics().setDepth(OVERLAY_DEPTH).setVisible(false);
    this.playerRenderer = new PlayerRenderer(scene);
    this.managerRenderer = new ManagerRenderer(scene);
    this.meetingRenderer = new MeetingRenderer(scene, map);
    this.ticketRenderer = new TicketRenderer(scene, this.mapRenderer);
    this.pipelineRenderer = new PipelineRenderer(scene, this.mapRenderer);
    this.effects = new EffectsRenderer(scene);
    this.hintRenderer = new HintRenderer(scene, map, this.mapRenderer);
    this.cameraController = new CameraController(scene, this.mapBounds());
  }

  syncRound({ view, events, hints, hintsVisible, timeMs }: RoundFrame): void {
    const { state } = view;
    this.playerRenderer.sync(view);
    this.managerRenderer.sync(view, timeMs);
    this.meetingRenderer.sync(view, timeMs);
    this.ticketRenderer.sync(view);
    this.pipelineRenderer.sync(state, timeMs);
    this.effects.play(state, events);
    for (const player of state.players) this.updateTarget(view, player.id);
    // A player who left (online) takes their highlight along.
    for (const [id, highlight] of this.targets) {
      if (state.players.some((p) => p.id === id)) continue;
      highlight.g.destroy();
      this.targets.delete(id);
    }
    this.hintRenderer.sync(hints, hintsVisible, timeMs);
  }

  render(): void {
    // Phaser draws its game objects by itself.
  }

  destroy(): void {
    // Phaser destroys the scene's game objects itself.
    this.targets.clear();
  }

  setShake(enabled: boolean): void {
    this.effects.shakeEnabled = enabled;
  }

  setDebug(enabled: boolean): void {
    this.mapRenderer.setDebugVisible(enabled);
    this.cameraController.setDebug(enabled);
  }

  tileAt(sx: number, sy: number): Point {
    const world = this.cameraController.screenToWorld(sx, sy);
    return screenToTile(world.x, world.y);
  }

  setHover(tile: Point | null): void {
    this.hoverOutline.clear();
    this.hoverOutline.setVisible(tile !== null);
    if (!tile) return;
    this.hoverOutline.lineStyle(2, HOVER_COLOR);
    this.hoverOutline.strokePoints(vectors(tileCorners(tile.x, tile.y)), true);
  }

  /** Outlines the counter or station a player faces, in their color; nothing for floor and walls. */
  private updateTarget(view: RoundView, id: PlayerId): void {
    let highlight = this.targets.get(id);
    if (!highlight) {
      highlight = { g: this.scene.add.graphics().setVisible(false), tile: null };
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
}

/** The default renderer factory. */
export function createPhaserRoundRenderer(
  scene: Phaser.Scene,
  map: LevelMap,
  look: MapLook,
): RoundRenderer {
  return new PhaserRoundRenderer(scene, map, look);
}
