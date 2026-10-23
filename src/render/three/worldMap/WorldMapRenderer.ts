import type Phaser from 'phaser';
import * as THREE from 'three';
import type { Graphics } from '../../../flow/save';
import { type MapPoint, type WorldMap, nodeIndexOf, worldMapFor } from '../../../flow/worldMap';
import { CHAPTERS } from '../../../sim/levels';
import type { MenuRenderer } from '../../MenuRenderer';
import { type MenuView, showsMap } from '../../menuView';
import { type CameraPose, gridToWorld } from '../../projection';
import { kitMaterials } from '../kit';
import { MAP_PALETTE, createLights, dressScene } from '../look';
import { type Stage, disposeTree, getStage } from '../stage';
import { type Diorama, ROAD_SURFACE, buildDiorama } from './diorama';
import { cameraTarget, glide } from './mapCamera';
import {
  type Drive,
  type RoadPath,
  buildRoadPath,
  pointAt,
  stepDrive,
  tangentAt,
} from './roadPath';
import { type Van, buildVan } from './van';

/** A high three-quarter view, like Overcooked's map: tilted well down, a little wider than the rounds. */
const CAMERA = {
  pitch: (56 * Math.PI) / 180,
  fov: (30 * Math.PI) / 180,
  distance: 26.5,
  /**
   * Where the van (and, once parked, the selected flag) sits on screen, as
   * shares of the canvas: low enough that the far row of flags clears the level card.
   */
  principal: { x: 0.5, y: 0.7 },
};
/** The ring round the selected flag's foot. */
const RING = { radius: 0.5, tube: 0.06, pulse: 0.08, pulseMs: 900 };
/** The flags flutter a little. */
const FLUTTER = { angle: 0.18, ms: 1400 };
/**
 * The van's drive, in tiles a second (and a second squared): a hop to the
 * next flag takes about a second, and a jump of more than two hops hurries
 * (up to three times as fast). It turns to the road's heading with this
 * time constant, and bounces on its springs (more the faster it goes),
 * tipping its nose as it speeds up and brakes.
 */
const VAN_DRIVE = {
  topSpeed: 10,
  accel: 24,
  hurryGap: 12,
  maxHurry: 3,
  reverseSpeed: 0.5,
  turnMs: 70,
  bounce: { height: 0.025, ms: 230 },
  tilt: { perAccel: 0.004, max: 0.07, ms: 90 },
};

/** The chapters as the flow sees them, for the map layout. */
const CHAPTER_INFO = CHAPTERS.map((c) => ({
  levelIds: c.levels.map((l) => l.id),
  starGate: c.starGate,
}));

/**
 * The world map behind the menus, drawn with three.js on the shared stage:
 * the diorama island, its road and level flags, seen from a high camera
 * that glides to the selected level.
 */
export class WorldMapRenderer implements MenuRenderer {
  private readonly stage: Stage;
  private readonly world = new THREE.Scene();
  private readonly materials = kitMaterials();
  private readonly map: WorldMap;
  private readonly diorama: Diorama;
  private readonly ring: THREE.Mesh;
  private readonly road: RoadPath;
  private readonly van: Van;
  private selected = 0;
  /** The van on the road; `null` parks it at the selected flag on the next frame (no drive). */
  private drive: Drive | null = null;
  /** Which way along the road the van last drove: 1 forward, -1 back. */
  private travel = 1;
  private heading = 0;
  private tilt = 0;
  private bouncePhase = 0;
  /** Where the camera looks now (map units); `null` until the first frame, which starts there. */
  private look: MapPoint | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const parent = scene.game.canvas.parentElement;
    if (!parent) throw new Error('The game canvas has no parent');
    this.stage = getStage(parent);
    dressScene(this.world, this.stage.renderer);
    this.map = worldMapFor(CHAPTER_INFO);
    this.diorama = buildDiorama(
      this.map,
      CHAPTERS.map((c) => c.id),
      this.materials,
    );
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(RING.radius, RING.tube, 8, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: MAP_PALETTE.selected }),
    );
    this.road = buildRoadPath(this.map);
    this.van = buildVan(this.materials);
    this.world.add(...createLights(this.map), this.diorama.root, this.ring, this.van.root);
  }

  syncMenu(view: MenuView): void {
    const id = view.levelIds[view.levelIndex];
    const node = id === undefined ? -1 : nodeIndexOf(this.map, id);
    if (node >= 0) this.selected = node;
    // While a level shows instead of the map, the van just waits at the selected flag.
    if (!showsMap(view.screen)) this.drive = null;
  }

  render(timeMs: number, deltaMs: number): void {
    const { width, height } = this.scene.scale;
    this.stage.resize(width, height);
    const van = this.driveVan(deltaMs);
    const target = cameraTarget(this.map, van);
    this.look = this.look ? glide(this.look, target, deltaMs) : target;
    this.stage.setPose(this.pose(this.look, width, height));

    const flag = this.diorama.flags[this.selected];
    if (flag) {
      const pulse = 1 + Math.sin((timeMs / RING.pulseMs) * Math.PI * 2) * RING.pulse;
      this.ring.position.set(flag.foot.x, flag.foot.y + 0.1, flag.foot.z);
      this.ring.scale.setScalar(pulse);
    }
    this.diorama.flags.forEach((f, i) => {
      f.cloth.rotation.y = Math.sin((timeMs / FLUTTER.ms) * Math.PI * 2 + i * 1.7) * FLUTTER.angle;
    });
    this.stage.render(this.world, deltaMs);
  }

  setGraphics(graphics: Graphics): void {
    this.stage.setGraphics(graphics);
  }

  destroy(): void {
    const { body, glow, glass } = this.materials;
    for (const material of [body, glow, glass]) material.dispose();
    this.stage.forget(this.world);
    if (this.world.background instanceof THREE.Texture) this.world.background.dispose();
    disposeTree(this.world);
    this.world.clear();
  }

  /** Moves the van along the road toward the selected flag; returns where it is now. */
  private driveVan(deltaMs: number): MapPoint {
    const target = this.road.nodeDistances[this.selected] ?? 0;
    const before = this.drive;
    const parked = before === null;
    const drive = before
      ? stepDrive(before, target, deltaMs, VAN_DRIVE)
      : { distance: target, speed: 0 };
    this.drive = drive;
    // Only a real drive back turns the van round, never a creep at the end of a stop.
    if (Math.abs(drive.speed) > VAN_DRIVE.reverseSpeed) this.travel = Math.sign(drive.speed);
    const at = pointAt(this.road, drive.distance);
    const tangent = tangentAt(this.road, drive.distance);
    const yaw = Math.atan2(tangent.x * this.travel, tangent.y * this.travel);
    const dt = Math.max(0, deltaMs);
    this.heading = parked
      ? yaw
      : this.heading + wrapAngle(yaw - this.heading) * ease(dt, VAN_DRIVE.turnMs);

    const { root, body, wheels, wheelRadius } = this.van;
    const p = gridToWorld(at.x, at.y, ROAD_SURFACE);
    root.position.set(p.x, p.y, p.z);
    root.rotation.y = this.heading;
    const speed = Math.abs(drive.speed);
    for (const wheel of wheels) wheel.rotation.x += (speed * dt) / 1000 / wheelRadius;
    // Springs: a bob while driving; the nose dips when braking and lifts when speeding up.
    const share = speed / VAN_DRIVE.topSpeed;
    this.bouncePhase += (dt / VAN_DRIVE.bounce.ms) * Math.PI * 2;
    body.position.y =
      this.van.ride + Math.abs(Math.sin(this.bouncePhase)) * VAN_DRIVE.bounce.height * share;
    const accel = before && dt > 0 ? ((speed - Math.abs(before.speed)) * 1000) / dt : 0;
    const { perAccel, max, ms } = VAN_DRIVE.tilt;
    const want = Math.min(Math.max(-accel * perAccel, -max), max);
    this.tilt += (want - this.tilt) * ease(dt, ms);
    body.rotation.x = this.tilt;
    return at;
  }

  private pose(look: MapPoint, width: number, height: number): CameraPose {
    return {
      target: gridToWorld(look.x, look.y),
      distance: CAMERA.distance,
      pitch: CAMERA.pitch,
      fov: CAMERA.fov,
      viewport: { width, height },
      principal: { x: width * CAMERA.principal.x, y: height * CAMERA.principal.y },
    };
  }
}

/** The share of the way to its target a smoothed value moves in `deltaMs`. */
function ease(deltaMs: number, timeMs: number): number {
  return 1 - Math.exp(-deltaMs / timeMs);
}

/** `angle` folded into (-π, π]: the short way round. */
function wrapAngle(angle: number): number {
  return angle - Math.PI * 2 * Math.round(angle / (Math.PI * 2));
}

/** The `MenuRendererFactory` `main.ts` hands to `GameScene`. */
export function createWorldMapRenderer(scene: Phaser.Scene): MenuRenderer {
  return new WorldMapRenderer(scene);
}
