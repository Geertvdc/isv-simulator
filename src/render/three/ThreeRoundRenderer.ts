import Phaser from 'phaser';
import * as THREE from 'three';
import {
  CAMERA_FIT_PADDING,
  CAMERA_HUD_BOTTOM,
  CAMERA_HUD_TOP,
  PLAYER_RADIUS,
} from '../../sim/balance';
import { type LevelMap, type Tile, getTile, isWorkSurface } from '../../sim/level';
import { type PlayerId, targetTile } from '../../sim/state';
import type { TicketKind } from '../../sim/tickets';
import { playerColor } from '../playerColors';
import {
  type CameraPose,
  type Point,
  fitCamera3d,
  gridToWorld,
  screenToGround,
} from '../projection';
import type { RoundFrame, RoundRenderer } from '../RoundRenderer';
import {
  BODY_HEIGHT,
  CARD_SIZE,
  SLAB_DEPTH,
  blockHeight,
  facingYaw,
  levelBox,
  placeTicket,
} from './layout';
import { type Stage, disposeTree, getStage } from './stage';

/** Greybox colors until the look pass (14c). */
const FLOOR_COLOR = 0x5b6b7e;
const FLOOR_ALT_COLOR = 0x55647a;
const SLAB_COLOR = 0x2e3440;
const BLOCK_COLORS: Readonly<Record<Exclude<Tile, 'floor'>, number>> = {
  wall: 0x9aa3b5,
  counter: 0x8a8f99,
  inbox: 0x4fa3e0,
  bugQueue: 0xe05a5a,
  keyboard: 0x6cc070,
  testBench: 0xe0b44f,
  review: 0xb07ce0,
  pipeline: 0xe07c4f,
  ship: 0x4fe0b0,
  bin: 0x5a5a5a,
};
const BLOCK_LABELS: Partial<Record<Tile, string>> = {
  inbox: 'I',
  bugQueue: 'B',
  keyboard: 'K',
  testBench: 'T',
  review: 'R',
  pipeline: 'P',
  ship: 'S',
  bin: 'X',
};
const CARD_COLORS: Readonly<Record<TicketKind, number>> = {
  feature: 0xf4f1e8,
  bug: 0xf6c4bd,
  incident: 0xff6b57,
};
const MANAGER_COLOR = 0x3b3f4a;
const HOVER_COLOR = 0xffffff;

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
  private readonly players = new Map<PlayerId, THREE.Group>();
  private readonly managers = new Map<number, THREE.Group>();
  private readonly tickets = new Map<number, THREE.Mesh>();
  private readonly targets = new Map<PlayerId, THREE.Mesh>();
  private readonly hover: THREE.LineLoop;
  private readonly shared = {
    body: new THREE.CapsuleGeometry(PLAYER_RADIUS * 0.8, BODY_HEIGHT - PLAYER_RADIUS * 1.6, 6, 16),
    nose: new THREE.SphereGeometry(0.08, 12, 8),
    card: new THREE.BoxGeometry(CARD_SIZE.width, CARD_SIZE.thickness, CARD_SIZE.depth),
    target: new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2),
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: LevelMap,
  ) {
    const parent = scene.game.canvas.parentElement;
    if (!parent) throw new Error('The game canvas has no parent');
    this.stage = getStage(parent);
    this.world.background = null;
    this.addLights();
    this.buildMap();
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

    this.pose = this.fit();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
      for (const geometry of Object.values(this.shared)) geometry.dispose();
      disposeTree(this.world);
    });
  }

  syncRound({ view }: RoundFrame): void {
    const { state } = view;

    const seenPlayers = new Set<PlayerId>();
    for (const player of state.players) {
      const pos = view.renderPos(player.id);
      if (!pos) continue;
      seenPlayers.add(player.id);
      let g = this.players.get(player.id);
      if (!g) {
        g = this.createPlayer(player.id);
        this.players.set(player.id, g);
      }
      g.position.set(pos.x, 0, pos.y);
      g.rotation.y = facingYaw(player.facing);
    }
    this.dropMissing(this.players, seenPlayers);

    const seenManagers = new Set<number>();
    for (const manager of state.managers) {
      const pos = view.renderManagerPos(manager.id);
      if (!pos) continue;
      seenManagers.add(manager.id);
      let g = this.managers.get(manager.id);
      if (!g) {
        g = this.createManager();
        this.managers.set(manager.id, g);
      }
      g.position.set(pos.x, 0, pos.y);
      g.rotation.y = facingYaw(manager.facing);
    }
    this.dropMissing(this.managers, seenManagers);

    const seenTickets = new Set<number>();
    for (const ticket of state.tickets) {
      const placed = placeTicket(view, ticket);
      if (!placed) continue;
      seenTickets.add(ticket.id);
      let mesh = this.tickets.get(ticket.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          this.shared.card,
          new THREE.MeshStandardMaterial({ color: CARD_COLORS[ticket.kind], roughness: 0.8 }),
        );
        mesh.castShadow = true;
        this.world.add(mesh);
        this.tickets.set(ticket.id, mesh);
      }
      mesh.visible = placed.visible;
      mesh.position.set(placed.pos.x, placed.pos.y + CARD_SIZE.thickness / 2, placed.pos.z);
      mesh.rotation.y = placed.yaw;
    }
    this.dropMissing(this.tickets, seenTickets);

    for (const player of state.players) this.updateTarget(player.id, targetTile(state, player.id));
  }

  render(): void {
    const { width, height } = this.scene.scale;
    this.stage.resize(width, height);
    this.stage.setPose(this.pose);
    this.stage.render(this.world);
  }

  setShake(): void {
    // Screen shake comes with the effects (14b).
  }

  setDebug(): void {
    // Tile labels come with the overlays (14b).
  }

  tileAt(sx: number, sy: number): Point {
    const g = screenToGround(this.pose, sx, sy);
    if (!g) return { x: -1, y: -1 };
    return { x: Math.round(g.x) + 0, y: Math.round(g.y) + 0 };
  }

  setHover(tile: Point | null): void {
    this.hover.visible = tile !== null;
    if (!tile) return;
    this.hover.position.set(tile.x, blockHeight(this.map, tile.x, tile.y) + 0.01, tile.y);
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
        top: CAMERA_FIT_PADDING + height * CAMERA_HUD_TOP,
        right: CAMERA_FIT_PADDING,
        bottom: CAMERA_FIT_PADDING + height * CAMERA_HUD_BOTTOM,
        left: CAMERA_FIT_PADDING,
      },
    );
  }

  private addLights(): void {
    this.world.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3f35, 1.4));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    const { width, height } = this.map;
    const cx = (width - 1) / 2;
    const cz = (height - 1) / 2;
    // From the front left and high up, so shadows fall back and to the right.
    sun.position.set(cx - width * 0.35, 14, cz + height * 0.6);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    const reach = Math.max(width, height) * 0.75;
    const cam = sun.shadow.camera;
    cam.left = -reach;
    cam.right = reach;
    cam.top = reach;
    cam.bottom = -reach;
    cam.near = 1;
    cam.far = 40;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.world.add(sun, sun.target);
  }

  private buildMap(): void {
    const { width, height } = this.map;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(width, SLAB_DEPTH, height),
      new THREE.MeshStandardMaterial({ color: SLAB_COLOR, roughness: 0.9 }),
    );
    slab.position.set((width - 1) / 2, -SLAB_DEPTH / 2 - 0.001, (height - 1) / 2);
    this.world.add(slab);

    const floorGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const floorMaterials = [FLOOR_COLOR, FLOOR_ALT_COLOR].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
    );
    const blockMaterials = new Map<Exclude<Tile, 'floor'>, THREE.MeshStandardMaterial>();
    const blockGeometries = new Map<number, THREE.BoxGeometry>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = getTile(this.map, x, y);
        if (!tile) continue;
        const floor = new THREE.Mesh(floorGeometry, floorMaterials[(x + y) % 2]);
        floor.position.set(x, 0, y);
        floor.receiveShadow = true;
        this.world.add(floor);
        if (tile === 'floor') continue;

        const h = blockHeight(this.map, x, y);
        let geometry = blockGeometries.get(h);
        if (!geometry) {
          geometry = new THREE.BoxGeometry(1, h, 1);
          blockGeometries.set(h, geometry);
        }
        let material = blockMaterials.get(tile);
        if (!material) {
          material = new THREE.MeshStandardMaterial({ color: BLOCK_COLORS[tile], roughness: 0.8 });
          blockMaterials.set(tile, material);
        }
        const block = new THREE.Mesh(geometry, material);
        block.position.set(x, h / 2, y);
        block.castShadow = true;
        block.receiveShadow = true;
        this.world.add(block);

        const label = BLOCK_LABELS[tile];
        if (label) this.world.add(labelPlane(label, gridToWorld(x, y, h + 0.005)));
      }
    }
  }

  private createPlayer(id: PlayerId): THREE.Group {
    const g = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: playerColor(id), roughness: 0.6 });
    const body = new THREE.Mesh(this.shared.body, material);
    body.position.y = BODY_HEIGHT / 2;
    body.castShadow = true;
    const nose = new THREE.Mesh(
      this.shared.nose,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    );
    nose.position.set(0, BODY_HEIGHT * 0.72, PLAYER_RADIUS * 0.8);
    nose.castShadow = true;
    g.add(body, nose);
    this.world.add(g);
    return g;
  }

  private createManager(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      this.shared.body,
      new THREE.MeshStandardMaterial({ color: MANAGER_COLOR, roughness: 0.6 }),
    );
    body.scale.set(1.1, 1.15, 1.1);
    body.position.y = (BODY_HEIGHT * 1.15) / 2;
    body.castShadow = true;
    g.add(body);
    this.world.add(g);
    return g;
  }

  /** A see-through plate in the player's color on the block they face; nothing for floor and walls. */
  private updateTarget(id: PlayerId, target: Point): void {
    let mesh = this.targets.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        this.shared.target,
        new THREE.MeshBasicMaterial({
          color: playerColor(id),
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      );
      this.world.add(mesh);
      this.targets.set(id, mesh);
    }
    const onSurface = isWorkSurface(getTile(this.map, target.x, target.y));
    mesh.visible = onSurface;
    if (!onSurface) return;
    // Later players sit slightly higher so two players targeting one block both show.
    mesh.position.set(
      target.x,
      blockHeight(this.map, target.x, target.y) + 0.01 + id * 0.002,
      target.y,
    );
  }

  private dropMissing<K>(objects: Map<K, THREE.Object3D>, seen: Set<K>): void {
    for (const [key, obj] of objects) {
      if (seen.has(key)) continue;
      this.world.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          for (const mat of [child.material as THREE.Material].flat()) mat.dispose();
        }
      });
      objects.delete(key);
    }
  }
}

/** A letter lying on a block top, for the greybox. */
function labelPlane(text: string, at: { x: number; y: number; z: number }): THREE.Mesh {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = `bold ${size * 0.7}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, size / 2, size / 2 + 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, size / 2, size / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.position.set(at.x, at.y, at.z);
  return mesh;
}

/** The `?render=3d` factory. */
export function createThreeRoundRenderer(scene: Phaser.Scene, map: LevelMap): RoundRenderer {
  return new ThreeRoundRenderer(scene, map);
}
