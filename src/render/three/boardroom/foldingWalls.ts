import * as THREE from 'three';
import type { LevelMap } from '../../../sim/level';
import { reorgWarning } from '../../../sim/reorgs';
import type { GameState } from '../../../sim/state';
import { gridToWorld } from '../../projection';
import { AMBIENT_KEY } from '../atmosphere';
import { type KitMaterials, type Model, kitMaterials } from '../kit';
import type { MovingTilesLook } from '../rooms/types';
import { disposeTree } from '../stage';
import {
  AMBER,
  CASTORS,
  DOOR_HINGE,
  GLASS_H,
  LOW_TOP,
  PLINTH_H,
  WHEEL_R,
  beaconAt,
  beaconLensModel,
  beaconSweepModel,
  beamGeometry,
  closetModel,
  doorLeafModel,
  headRailModel,
  leafGlassModel,
  leafLowerModel,
  leafUpperModel,
  tableBoardModel,
  tableHalfModel,
  tableWorkshopModel,
  trackLightModel,
  trackModel,
  upperBase,
  vinylByLeaf,
  washGeometry,
  wheelModel,
} from './models';
import {
  beacon,
  blinkOn,
  deskRoll,
  doorOpen,
  leafPoses,
  panelPose,
  reorgClock,
  runWhole,
} from './motion';
import { type Desk, type WallRun, desks, wallRuns } from './track';

/** The name cards on each table half, by its place in reading order (Mom has a board seat). */
const NAME_CARDS: readonly (readonly string[])[] = [['YOTTA', 'MOM'], ['MONOLITH']];

interface LeafLook {
  lower: THREE.Group;
  upper: THREE.Group;
  /** The frosted glass over a cut-down leaf, or null where the run is full height all along. */
  glass: THREE.Group | null;
}

/** The pocket doors swing a little past square, so their walnut faces catch the light. */
const DOOR_SWING = (100 / 180) * Math.PI;

interface PocketLook {
  doors: [THREE.Group, THREE.Group];
  spinner: THREE.Group;
  lit: THREE.Group;
}

interface RunLook {
  run: WallRun;
  leaves: LeafLook[];
  pockets: PocketLook[];
  /** The lit track per tile index. */
  lights: Map<number, THREE.Group>;
  /** The head rail, drawn while the run is whole. */
  rail: THREE.Group;
}

interface DeskLook {
  desk: Desk;
  group: THREE.Group;
  board: THREE.Group;
  workshop: THREE.Group;
  /** Its four wheels' indexes in the shared wheel mesh. */
  wheels: number;
}

/**
 * 4-2 Synergy's boardroom: its operable wall (walnut and fabric panels on a
 * steel floor track, two storage closets with amber beacons) and the
 * boardroom table that splits and rolls apart when the walls open. The
 * level's reorg tiles; see `docs/plan/synergy-environment.md` and, for how
 * it moves, `motion.ts`. Everything is placed from the map (`track.ts`).
 */
export class FoldingWalls implements MovingTilesLook {
  private readonly group = new THREE.Group();
  private readonly materials: KitMaterials = kitMaterials();
  private readonly runs: RunLook[] = [];
  private readonly desks: DeskLook[] = [];
  private readonly washes = new Map<number, THREE.Mesh>();
  private readonly washGeometry = washGeometry();
  private readonly washMaterial = new THREE.MeshBasicMaterial({
    color: AMBER,
    vertexColors: true,
    transparent: true,
    // Under the full-strength track lines and beacons, so the table tiles don't glow orange.
    opacity: 0.527,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly beamMaterial = new THREE.MeshBasicMaterial({
    color: AMBER,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  private readonly wheels: THREE.InstancedMesh;
  /**
   * Hidden by the stage on `low` quality (like the scene's ambient motion):
   * the walls snap there instead of moving.
   */
  private readonly motionProbe = new THREE.Object3D();

  constructor(
    root: THREE.Group,
    private readonly map: LevelMap,
  ) {
    root.add(this.group);
    this.motionProbe.userData[AMBIENT_KEY] = true;
    this.group.add(this.motionProbe);
    for (const run of wallRuns(map)) this.runs.push(this.buildRun(run));
    const all = desks(map);
    const wheel = wheelModel();
    this.wheels = new THREE.InstancedMesh(
      wheel.body,
      this.materials.body,
      all.length * CASTORS.length,
    );
    this.wheels.castShadow = true;
    this.wheels.frustumCulled = false;
    this.group.add(this.wheels);
    all.forEach((desk, k) => this.desks.push(this.buildDesk(desk, k)));
  }

  /** The front run's frosted glass: quieter than the kit's glass. */
  private readonly frostMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.35,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  private mesh(
    model: Model,
    shadow = true,
    glass: THREE.Material = this.materials.glass,
  ): THREE.Group {
    const g = new THREE.Group();
    const layers: [THREE.BufferGeometry | null, THREE.Material, boolean][] = [
      [model.body, this.materials.body, true],
      [model.glow, this.materials.glow, false],
      [model.glass, glass, false],
    ];
    for (const [geometry, material, lit] of layers) {
      if (!geometry?.getAttribute('position')) continue;
      const m = new THREE.Mesh(geometry, material);
      m.castShadow = shadow && lit;
      m.receiveShadow = lit;
      g.add(m);
    }
    return g;
  }

  private buildRun(run: WallRun): RunLook {
    const vinyl = vinylByLeaf(run);
    const leaves: LeafLook[] = [];
    for (let k = 0; k < run.length; k++) {
      for (const h of [0, 1] as const) {
        const look = {
          hinge: h === 0 ? (1 as const) : (-1 as const),
          vinyl: vinyl[k * 2 + h] ?? [],
          handle: h === (k < run.split ? 1 : 0),
          salt: k * 2 + h + 5,
          steelCap: k % 3 === 0,
        };
        const lower = this.mesh(leafLowerModel(look));
        const upper = this.mesh(leafUpperModel(look));
        this.group.add(lower, upper);
        let glass: THREE.Group | null = null;
        if (run.tall.some((t) => !t)) {
          glass = this.mesh(leafGlassModel(look), false, this.frostMaterial);
          this.group.add(glass);
        }
        leaves.push({ lower, upper, glass });
      }
    }
    const track = this.mesh(trackModel(run), false);
    track.traverse((m) => {
      if (m instanceof THREE.Mesh) m.receiveShadow = true;
    });
    const rail = this.mesh(headRailModel(run));
    this.group.add(track, rail);
    const lights = new Map<number, THREE.Group>();
    run.tiles.forEach((tile, i) => {
      const light = this.mesh(trackLightModel(run, i), false);
      light.visible = false;
      this.group.add(light);
      lights.set(tile.y * this.map.width + tile.x, light);
    });
    // The room's middle, to tell each closet which side is outside.
    const midX = run.tiles.reduce((m, t) => m + t.x / run.tiles.length, 0);
    const midZ = run.tiles.reduce((m, t) => m + t.y / run.tiles.length, 0);
    const pockets = run.pockets.map((p): PocketLook => {
      const closet = new THREE.Group();
      const at = gridToWorld(p.tile.x, p.tile.y);
      closet.position.set(at.x, 0, at.z);
      // Local +z is the closet's front, out of the pocket along the track.
      closet.rotation.y = Math.atan2(-p.inward.x, -p.inward.z);
      const right = { x: Math.cos(closet.rotation.y), z: -Math.sin(closet.rotation.y) };
      const outer = (p.tile.x - midX) * right.x + (p.tile.y - midZ) * right.z >= 0 ? 1 : -1;
      closet.add(this.mesh(closetModel(outer)));
      const doors = ([-1, 1] as const).map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * DOOR_HINGE, 0, 0.5);
        pivot.add(this.mesh(doorLeafModel(-side)));
        closet.add(pivot);
        return pivot;
      }) as [THREE.Group, THREE.Group];
      const [bx, by, bz] = beaconAt(outer);
      const unlit = this.mesh(beaconLensModel(false), false);
      unlit.position.set(bx, by, bz);
      const lit = this.mesh(beaconLensModel(true), false);
      lit.position.set(bx, by, bz);
      const spinner = new THREE.Group();
      spinner.position.set(bx, by, bz);
      spinner.add(this.mesh(beaconSweepModel(), false));
      const beam = new THREE.Mesh(beamGeometry(), this.beamMaterial);
      beam.position.y = 0.04;
      spinner.add(beam);
      closet.add(unlit, lit, spinner);
      this.group.add(closet);
      return { doors, spinner, lit };
    });
    return { run, leaves, pockets, lights, rail };
  }

  private buildDesk(desk: Desk, k: number): DeskLook {
    const group = new THREE.Group();
    group.add(this.mesh(tableHalfModel()));
    const board = this.mesh(tableBoardModel(NAME_CARDS[k] ?? [], k));
    const workshop = this.mesh(tableWorkshopModel(k * 3 + 1));
    group.add(board, workshop);
    this.group.add(group);
    return { desk, group, board, workshop, wheels: k * CASTORS.length };
  }

  sync(state: GameState): void {
    const animate = this.motionProbe.visible;
    const clock = reorgClock(state);
    for (const look of this.runs) this.syncRun(look, clock, animate);
    this.syncWarning(state);
    this.syncDesks(clock, animate);
  }

  private syncRun(look: RunLook, clock: ReturnType<typeof reorgClock>, animate: boolean): void {
    const { run } = look;
    look.rail.visible = runWhole(run, clock, animate);
    for (let k = 0; k < run.length; k++) {
      const panel = panelPose(run, k, clock, animate);
      // On the plinth; in a stack, each slot a hair higher than the last so the caps never fight.
      const base = PLINTH_H + (panel.lateral + 0.5) * 0.008 * (panel.lateral === 0 ? 0 : 1);
      leafPoses(run, panel).forEach((pose, h) => {
        const leaf = look.leaves[k * 2 + h];
        if (!leaf) return;
        const y = base + pose.y;
        leaf.lower.position.set(pose.x, y, pose.z);
        leaf.lower.rotation.y = pose.yaw;
        leaf.upper.position.set(pose.x, y + upperBase(pose.ext), pose.z);
        leaf.upper.rotation.y = pose.yaw;
        if (leaf.glass) {
          // The glass fills from the walnut upper's top to the wall's height, and goes as the walnut rises.
          const from = upperBase(pose.ext) - upperBase(0);
          const scale = (GLASS_H - from) / GLASS_H;
          leaf.glass.visible = scale > 0.03;
          leaf.glass.position.set(pose.x, y + LOW_TOP + from, pose.z);
          leaf.glass.scale.y = Math.max(0.001, scale);
          leaf.glass.rotation.y = pose.yaw;
        }
      });
    }
    const open = doorOpen(run, clock, animate);
    const spin = beacon(clock);
    for (const pocket of look.pockets) {
      // Each leaf swings out a quarter turn, to lie along the track either side of it.
      pocket.doors[0].rotation.y = -DOOR_SWING * open;
      pocket.doors[1].rotation.y = DOOR_SWING * open;
      pocket.lit.visible = spin.on;
      pocket.spinner.visible = spin.on && animate;
      pocket.spinner.rotation.y = spin.angle;
    }
  }

  private syncWarning(state: GameState): void {
    const warning = reorgWarning(state);
    const on = warning !== null && blinkOn(warning.inTicks);
    const lit = new Set(on ? warning.tiles : []);
    for (const look of this.runs) {
      for (const [i, light] of look.lights) light.visible = lit.has(i);
    }
    for (const i of warning?.tiles ?? []) {
      if (this.washes.has(i)) continue;
      const mesh = new THREE.Mesh(this.washGeometry, this.washMaterial);
      const at = gridToWorld(i % this.map.width, Math.floor(i / this.map.width), PLINTH_H + 0.008);
      mesh.position.set(at.x, at.y, at.z);
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.washes.set(i, mesh);
    }
    for (const [i, mesh] of this.washes) mesh.visible = lit.has(i);
  }

  private syncDesks(clock: ReturnType<typeof reorgClock>, animate: boolean): void {
    const roll = deskRoll(this.runs[0]?.run, clock, animate);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (const look of this.desks) {
      const { spots, seam, together } = look.desk;
      const from = spots[clock.from - 1] ?? spots[0] ?? { x: 0, y: 0 };
      const to = spots[clock.to - 1] ?? from;
      const x = from.x + (to.x - from.x) * roll;
      const z = from.y + (to.y - from.y) * roll;
      look.group.position.set(x, 0, z);
      const yaw = seam ? Math.atan2(-seam.y, seam.x) : 0;
      look.group.rotation.y = yaw;
      const near = roll < 0.5 ? clock.from : clock.to;
      const boardroom = together[near - 1] ?? true;
      look.board.visible = boardroom;
      look.workshop.visible = !boardroom;
      // The wheels turn with the distance rolled.
      const turn = -(x * Math.cos(yaw) - z * Math.sin(yaw)) / WHEEL_R;
      CASTORS.forEach(([cx, cz], w) => {
        const wx = x + cx * Math.cos(yaw) + cz * Math.sin(yaw);
        const wz = z - cx * Math.sin(yaw) + cz * Math.cos(yaw);
        q.setFromEuler(new THREE.Euler(0, yaw, turn, 'YXZ'));
        m.compose(new THREE.Vector3(wx, WHEEL_R + 0.004, wz), q, one);
        this.wheels.setMatrixAt(look.wheels + w, m);
      });
    }
    this.wheels.instanceMatrix.needsUpdate = true;
  }

  destroy(): void {
    this.group.removeFromParent();
    disposeTree(this.group);
    this.washGeometry.dispose();
  }
}
