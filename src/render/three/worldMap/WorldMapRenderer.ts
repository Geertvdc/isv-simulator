import type Phaser from 'phaser';
import * as THREE from 'three';
import type { Graphics } from '../../../flow/save';
import { type MapPoint, type WorldMap, nodeIndexOf, worldMapFor } from '../../../flow/worldMap';
import { CHAPTERS } from '../../../sim/levels';
import type { MenuRenderer } from '../../MenuRenderer';
import type { MenuView } from '../../menuView';
import { type CameraPose, gridToWorld } from '../../projection';
import { kitMaterials } from '../kit';
import { MAP_PALETTE, createLights, dressScene } from '../look';
import { type Stage, disposeTree, getStage } from '../stage';
import { type Diorama, buildDiorama } from './diorama';
import { cameraTarget, glide } from './mapCamera';

/** A high three-quarter view, like Overcooked's map: tilted well down, a little wider than the rounds. */
const CAMERA = {
  pitch: (56 * Math.PI) / 180,
  fov: (30 * Math.PI) / 180,
  distance: 24,
  /** Where the selected flag sits on screen, as shares of the canvas: under the level card. */
  principal: { x: 0.5, y: 0.66 },
};
/** The ring round the selected flag's foot. */
const RING = { radius: 0.5, tube: 0.06, pulse: 0.08, pulseMs: 900 };
/** The flags flutter a little. */
const FLUTTER = { angle: 0.18, ms: 1400 };

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
  private selected = 0;
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
    this.world.add(...createLights(this.map), this.diorama.root, this.ring);
  }

  syncMenu(view: MenuView): void {
    const id = view.levelIds[view.levelIndex];
    const node = id === undefined ? -1 : nodeIndexOf(this.map, id);
    if (node >= 0) this.selected = node;
  }

  render(timeMs: number, deltaMs: number): void {
    const { width, height } = this.scene.scale;
    this.stage.resize(width, height);
    const node = this.map.nodes[this.selected] ?? { x: 0, y: 0 };
    const target = cameraTarget(this.map, node);
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

/** The `MenuRendererFactory` `main.ts` hands to `GameScene`. */
export function createWorldMapRenderer(scene: Phaser.Scene): MenuRenderer {
  return new WorldMapRenderer(scene);
}
