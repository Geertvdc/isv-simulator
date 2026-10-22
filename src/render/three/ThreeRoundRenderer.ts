import Phaser from 'phaser';
import * as THREE from 'three';
import { CAMERA_FIT_PADDING, CAMERA_HUD_BOTTOM } from '../../sim/balance';
import { type LevelMap, getTile, isWorkSurface } from '../../sim/level';
import { type PlayerId, targetTile } from '../../sim/state';
import type { TicketKind } from '../../sim/tickets';
import { effectsFor } from '../effects';
import type { MapLook } from '../MapRenderer';
import { playerColor } from '../playerColors';
import {
  type CameraPose,
  type Point,
  type Vec3,
  fitCamera3d,
  focalLength,
  gridToWorld,
  projectPoint,
  screenToGround,
} from '../projection';
import type { RoundFrame, RoundRenderer } from '../RoundRenderer';
import { OVERLAY_SCALE, Overlays, POPUP_HEIGHT, type ScreenPoint, overlayScale } from './Overlays';
import { People } from './People';
import { WorldFx } from './WorldFx';
import { blockHeight, levelBox, pickTile, placeTicket } from './layout';
import { createLights, dressScene } from './look';
import { kitMaterials } from './kit';
import { buildMap } from './MapView';
import { ticketModel } from './models';
import { type Stage, disposeTree, getStage } from './stage';

const HOVER_COLOR = 0xffffff;
/**
 * The top band the 3D camera keeps free, as a share of the height. Less than
 * 2D's `CAMERA_HUD_TOP`: the order cards only cover the left of that band,
 * and the back wall may reach under it.
 */
const HUD_TOP_3D = 0.1;
/** How far down the HUD's order cards reach, as a share of the height. */
const HUD_ORDERS_BAND = 0.135;
/** About how tall an overlay drawn up from its point is (a card and its title), in overlay pixels. */
const OVERLAY_TALL = 52;

/**
 * The 3D look (`?render=3d`): the level and round drawn with three.js on the
 * stage canvas under Phaser's. Phaser keeps the scene, the loop, sound and
 * the fade; this syncs three.js objects keyed by entity id, like the 2D
 * renderers do with Phaser objects.
 */
export class ThreeRoundRenderer implements RoundRenderer {
  private readonly stage: Stage;
  private readonly world = new THREE.Scene();
  private pose: CameraPose;
  private readonly tickets = new Map<number, THREE.Mesh>();
  private readonly ticketGeometries = new Map<TicketKind, THREE.BufferGeometry>();
  private readonly materials = kitMaterials();
  private readonly targets = new Map<PlayerId, THREE.Group>();
  private readonly hover: THREE.LineLoop;
  private readonly overlays: Overlays;
  private readonly fx: WorldFx;
  private readonly people: People;
  private readonly carrierYaw = (id: PlayerId): number | undefined => this.people.yawOf(id);
  /** The last round frame, placed again every render with the camera as it is then. */
  private frame: RoundFrame | null = null;
  private readonly shared = {
    target: new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2),
    targetFrame: squareFrame(0.5, 0.42),
    targetRim: squareFrame(0.42, 0.39),
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: LevelMap,
    look: MapLook,
  ) {
    const parent = scene.game.canvas.parentElement;
    if (!parent) throw new Error('The game canvas has no parent');
    this.stage = getStage(parent);
    dressScene(this.world, this.stage.renderer);
    this.world.add(...createLights(map), buildMap(map, look));
    this.hover = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, 0, -0.5),
        new THREE.Vector3(0.5, 0, -0.5),
        new THREE.Vector3(0.5, 0, 0.5),
        new THREE.Vector3(-0.5, 0, 0.5),
      ]),
      new THREE.LineBasicMaterial({ color: HOVER_COLOR }),
    );
    this.hover.visible = false;
    this.world.add(this.hover);
    this.overlays = new Overlays(scene, map);
    this.fx = new WorldFx(this.world, map);
    this.people = new People(this.world, this.materials);

    this.pose = this.fit();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
    this.people.destroy();
    for (const geometry of Object.values(this.shared)) geometry.dispose();
    for (const geometry of this.ticketGeometries.values()) geometry.dispose();
    const { body, glow, glass } = this.materials;
    for (const material of [body, glow, glass]) material.dispose();
    this.stage.forget(this.world);
    if (this.world.background instanceof THREE.Texture) this.world.background.dispose();
    disposeTree(this.world);
    this.world.clear();
    this.frame = null;
  }

  syncRound(frame: RoundFrame): void {
    const { view, events, timeMs } = frame;
    const { state } = view;
    this.frame = frame;

    const seenPlayers = this.people.sync(view, events, timeMs);

    const seenTickets = new Set<number>();
    for (const ticket of state.tickets) {
      const placed = placeTicket(view, ticket, this.carrierYaw);
      if (!placed) continue;
      seenTickets.add(ticket.id);
      let mesh = this.tickets.get(ticket.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.ticketGeometry(ticket.kind), this.materials.body);
        mesh.castShadow = true;
        this.world.add(mesh);
        this.tickets.set(ticket.id, mesh);
      }
      mesh.visible = placed.visible;
      putAt(mesh, placed.pos);
      mesh.rotation.y = placed.yaw;
    }
    // Tickets share their geometry and material: nothing to free.
    this.dropMissing(this.tickets, seenTickets, false);

    for (const id of seenPlayers) this.updateTarget(id, targetTile(state, id));
    this.dropMissing(this.targets, seenPlayers);
    this.fx.sync(state, timeMs);

    for (const effect of effectsFor(state, events)) {
      switch (effect.kind) {
        case 'shake':
          this.fx.startShake(effect.ms, effect.intensity, timeMs);
          break;
        case 'puff':
          this.fx.puff(effect.at, effect.facing, timeMs);
          break;
        case 'popup':
          this.overlays.popup(
            gridToWorld(effect.at.x, effect.at.y, POPUP_HEIGHT),
            effect.text,
            effect.color,
            timeMs,
          );
          break;
      }
    }
  }

  render(timeMs: number, deltaMs: number): void {
    const { width, height } = this.scene.scale;
    this.stage.resize(width, height);
    const shake = this.fx.update(timeMs, { width, height });
    const pose = {
      ...this.pose,
      principal: { x: this.pose.principal.x + shake.x, y: this.pose.principal.y + shake.y },
    };
    this.stage.setPose(pose);
    const project = this.project(pose);
    const frame = this.frame;
    if (frame) this.overlays.sync(frame.view, frame.hints, frame.hintsVisible, timeMs, project);
    this.overlays.place(project, timeMs);
    this.stage.render(this.world, deltaMs);
  }

  setShake(enabled: boolean): void {
    this.fx.shakeEnabled = enabled;
  }

  setDebug(enabled: boolean): void {
    this.overlays.setDebug(enabled);
  }

  tileAt(sx: number, sy: number): Point {
    return pickTile(this.map, (h) => screenToGround(this.pose, sx, sy, h)) ?? { x: -1, y: -1 };
  }

  setHover(tile: Point | null): void {
    this.hover.visible = tile !== null;
    if (!tile) return;
    putAt(this.hover, gridToWorld(tile.x, tile.y, blockHeight(this.map, tile.x, tile.y) + 0.01));
  }

  /** Canvas point, overlay scale and draw order of world points seen from `pose`. */
  private project(pose: CameraPose): (p: Vec3) => ScreenPoint {
    const f = focalLength(pose);
    // The HUD's order cards cover the top band: overlays over the back row are pushed
    // down to stay under it (most are drawn up from their point, about this tall).
    const hudBottom = pose.viewport.height * HUD_ORDERS_BAND;
    return (p) => {
      const s = projectPoint(pose, p);
      const scale = overlayScale(f / s.depth);
      const y = Math.max(s.y, hudBottom + OVERLAY_TALL * scale * OVERLAY_SCALE);
      return { x: s.x, y, scale, depth: 1000 - s.depth };
    };
  }

  private readonly onResize = (): void => {
    this.pose = this.fit();
  };

  /** Frames the level between the HUD bands, like the 2D camera. */
  private fit(): CameraPose {
    const { width, height } = this.scene.scale;
    return fitCamera3d(
      levelBox(this.map),
      { width, height },
      {
        top: CAMERA_FIT_PADDING + height * HUD_TOP_3D,
        right: CAMERA_FIT_PADDING,
        bottom: CAMERA_FIT_PADDING + height * CAMERA_HUD_BOTTOM,
        left: CAMERA_FIT_PADDING,
      },
    );
  }

  /** A see-through plate in the player's color on the block they face; nothing for floor and walls. */
  private updateTarget(id: PlayerId, target: Point): void {
    let mesh = this.targets.get(id);
    if (!mesh) {
      // A light tint, a thick frame in the player's color and a thin white one inside it,
      // so it shows even on a block of the same color.
      const flat = (color: number, opacity: number) =>
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      mesh = new THREE.Group();
      mesh.add(
        new THREE.Mesh(this.shared.target, flat(playerColor(id), 0.3)),
        new THREE.Mesh(this.shared.targetFrame, flat(playerColor(id), 1)),
        new THREE.Mesh(this.shared.targetRim, flat(0xffffff, 0.9)),
      );
      this.world.add(mesh);
      this.targets.set(id, mesh);
    }
    const onSurface = isWorkSurface(getTile(this.map, target.x, target.y));
    mesh.visible = onSurface;
    if (!onSurface) return;
    // Later players sit slightly higher so two players targeting one block both show.
    const top = blockHeight(this.map, target.x, target.y);
    putAt(mesh, gridToWorld(target.x, target.y, top + 0.01 + id * 0.002));
  }

  /** One folder geometry per ticket kind, made on first use. */
  private ticketGeometry(kind: TicketKind): THREE.BufferGeometry {
    let geometry = this.ticketGeometries.get(kind);
    if (!geometry) {
      geometry = ticketModel(kind).body;
      this.ticketGeometries.set(kind, geometry);
    }
    return geometry;
  }

  private dropMissing<K>(
    objects: Map<K, THREE.Object3D>,
    seen: ReadonlySet<K>,
    dispose = true,
  ): void {
    for (const [key, obj] of objects) {
      if (seen.has(key)) continue;
      this.world.remove(obj);
      if (dispose)
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            for (const mat of [child.material as THREE.Material].flat()) mat.dispose();
          }
        });
      objects.delete(key);
    }
  }
}

/** A flat square frame on the floor plane, `outer` and `inner` half-widths. */
function squareFrame(outer: number, inner: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape([
    new THREE.Vector2(-outer, -outer),
    new THREE.Vector2(outer, -outer),
    new THREE.Vector2(outer, outer),
    new THREE.Vector2(-outer, outer),
  ]);
  shape.holes.push(
    new THREE.Path([
      new THREE.Vector2(-inner, -inner),
      new THREE.Vector2(-inner, inner),
      new THREE.Vector2(inner, inner),
      new THREE.Vector2(inner, -inner),
    ]),
  );
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

/** Puts `obj` at world point `p` (from `gridToWorld`, so grid ↔ world stays in projection.ts). */
function putAt(obj: THREE.Object3D, p: Vec3): void {
  obj.position.set(p.x, p.y, p.z);
}

/** The `?render=3d` factory. */
export function createThreeRoundRenderer(
  scene: Phaser.Scene,
  map: LevelMap,
  look: MapLook,
): RoundRenderer {
  return new ThreeRoundRenderer(scene, map, look);
}
