import * as THREE from 'three';
import type { GridPoint, LevelMap } from '../../../sim/level';
import { reorgWarning } from '../../../sim/reorgs';
import type { GameState } from '../../../sim/state';
import { gridToWorld } from '../../projection';
import { AMBIENT_KEY } from '../atmosphere';
import { type ReorgClock, blinkOn, reorgClock } from '../boardroom/motion';
import { layoutsOf } from '../boardroom/track';
import { type KitMaterials, type Model, kitMaterials } from '../kit';
import type { MovingTilesLook } from '../rooms/types';
import { disposeTree } from '../stage';
import {
  type Leaf,
  type LeafMove,
  type PartitionLayout,
  type SignSpot,
  type StackSpot,
  allLeaves,
  headerSigns,
  parkedStacks,
  partitionLayout,
  rollingDesks,
  transition,
} from './layouts';
import {
  LOW_TOP,
  deskModel,
  leafGlassModel,
  leafLowerModel,
  leafUpperModel,
  parkedStackModel,
  SIGN_PX,
  signModel,
  signWidth,
  tapeXModel,
  trolleyModel,
} from './models';
import { OPEN, TRAIN_END, TRAIN_START, deskPose, leafPose, leafWhole, ramp } from './motion';
import { WALL_HEIGHT } from '../layout';

/** The org vinyl per layout (Silos, Open Plan, Matrix, and round again). */
const ORG_SIGNS: readonly (readonly string[])[] = [
  ['SILO: DEV', 'SILO: OPS', 'SILO: QA'],
  ['TRIBE', 'SQUAD'],
  ['TRIBE', 'SQUAD', 'CHAPTER', 'GUILD'],
];

const WARN = 0xffa53d;

interface LeafLook {
  leaf: Leaf;
  group: THREE.Group;
  upper: THREE.Group;
  glass: THREE.Group;
  /** Its header board per layout (index `phase - 1`), if it carries one there. */
  signs: (THREE.Group | null)[];
}

interface StackLook {
  spot: StackSpot;
  /** The layout it belongs to (index `phase - 1`). */
  layout: number;
  group: THREE.Group;
}

interface DeskLook {
  spots: GridPoint[];
  group: THREE.Group;
  materials: KitMaterials;
  tape: THREE.Group;
}

/** Stripes for the telegraph: amber diagonals, built as data (no canvas). */
function stripeTexture(): THREE.DataTexture {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const edge = x < 2 || y < 2 || x >= n - 2 || y >= n - 2;
      const on = edge || Math.floor((x + y) / 4) % 2 === 0;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = on ? 255 : 40;
    }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 4-3 The Reorg's moving tiles: the consultants' mobile partitions (half
 * tile leaves that roll in as trains and roll off into their lines' ends),
 * the rolling bench desks, and the amber striped telegraph on the tiles
 * about to change. Everything is placed from the map's layouts
 * (`layouts.ts`) and posed from the sim's tick (`motion.ts`); on `low` it
 * snaps.
 */
export class Partitions implements MovingTilesLook {
  private readonly group = new THREE.Group();
  private readonly materials: KitMaterials = kitMaterials();
  private readonly layouts: PartitionLayout[];
  private readonly leaves: LeafLook[] = [];
  private readonly desks: DeskLook[] = [];
  private readonly stacks: StackLook[] = [];
  private readonly moves = new Map<string, Map<string, LeafMove>>();
  private readonly warnings = new Map<number, THREE.Mesh>();
  /** The panel trolleys at the trains' free ends, by end. */
  private readonly trolleys = new Map<string, THREE.Group>();
  private readonly stripes = stripeTexture();
  private readonly warnGeometry = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
  private readonly warnMaterial = new THREE.MeshBasicMaterial({
    color: WARN,
    map: this.stripes,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly frost = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.4,
    metalness: 0,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  /** Hidden by the stage on `low` quality: the kit snaps there instead of moving. */
  private readonly motionProbe = new THREE.Object3D();

  constructor(
    root: THREE.Group,
    private readonly map: LevelMap,
  ) {
    root.add(this.group);
    this.motionProbe.userData[AMBIENT_KEY] = true;
    this.group.add(this.motionProbe);
    this.layouts = layoutsOf(map).map((_, k) => partitionLayout(map, k + 1));
    const signs = this.layouts.map((layout, li) =>
      headerSigns(layout, ORG_SIGNS[li % ORG_SIGNS.length] ?? []),
    );
    for (const leaf of allLeaves(map).values()) this.leaves.push(this.buildLeaf(leaf, signs));
    this.layouts.forEach((layout, li) => {
      for (const spot of parkedStacks(map, layout, li + 1)) {
        const group = this.mesh(parkedStackModel(spot.w, spot.d, spot.x * 13 + spot.y * 5 + li));
        const top = spot.low ? LOW_TOP : WALL_HEIGHT;
        group.position.set(spot.cx, top - 0.012, spot.cz);
        group.visible = false;
        this.group.add(group);
        this.stacks.push({ spot, layout: li, group });
      }
    });
    rollingDesks(map).forEach((desk, k) => this.desks.push(this.buildDesk(desk.spots, k)));
  }

  private mesh(model: Model, materials = this.materials, glass?: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const layers: [THREE.BufferGeometry | null, THREE.Material, boolean][] = [
      [model.body, materials.body, true],
      [model.glow, materials.glow, false],
      [model.glass, glass ?? materials.glass, false],
    ];
    for (const [geometry, material, lit] of layers) {
      if (!geometry?.getAttribute('position')) continue;
      const m = new THREE.Mesh(geometry, material);
      m.castShadow = lit;
      m.receiveShadow = lit;
      g.add(m);
    }
    return g;
  }

  private buildLeaf(leaf: Leaf, signs: Map<string, SignSpot>[]): LeafLook {
    const edge = leaf.outer === 1 ? leaf.b : leaf.a;
    // Feet on every second tile edge (and every line end), so a run doesn't read as a ladder.
    const lineEnd = this.layouts.some((l) =>
      l.lines.some(
        (line) =>
          line.axis === leaf.axis &&
          line.line === leaf.line &&
          (Math.abs(line.a - edge) < 1e-6 || Math.abs(line.b - edge) < 1e-6),
      ),
    );
    const look = {
      outer: leaf.outer,
      foot: lineEnd || Math.round(edge - 0.5 + leaf.line) % 2 === 0,
      salt: leaf.x * 31 + leaf.y * 7 + leaf.outer,
    };
    const group = new THREE.Group();
    const lower = this.mesh(leafLowerModel(look));
    const upper = this.mesh(leafUpperModel(look));
    upper.position.y = LOW_TOP;
    const glass = this.mesh(leafGlassModel(look), this.materials, this.frost);
    glass.position.y = LOW_TOP;
    group.add(lower, upper, glass);
    group.visible = false;
    const signGroups = signs.map((byLeaf) => {
      const spot = byLeaf.get(leaf.key);
      if (!spot) return null;
      // As big as the run has room for, up to the board's full size.
      const cols = spot.text.length * 4 - 1;
      const px = Math.min(SIGN_PX, (spot.room - 0.4 - signWidth('', 0)) / cols);
      const sign = this.mesh(signModel(spot.text, px));
      sign.position.set(spot.offset, WALL_HEIGHT, 0);
      sign.visible = false;
      group.add(sign);
      return sign;
    });
    // Axis x: local x along world x; axis y: local x along world z (the +z face toward −x).
    group.rotation.y = leaf.axis === 'x' ? 0 : -Math.PI / 2;
    this.group.add(group);
    return { leaf, group, upper, glass, signs: signGroups };
  }

  private buildDesk(spots: GridPoint[], k: number): DeskLook {
    const materials = kitMaterials();
    const group = this.mesh(deskModel(k * 5 + 3), materials);
    const tape = this.mesh(tapeXModel());
    tape.visible = false;
    this.group.add(group, tape);
    return { spots, group, materials, tape };
  }

  private movesFor(clock: ReorgClock): Map<string, LeafMove> {
    const key = `${clock.from}>${clock.to}`;
    let moves = this.moves.get(key);
    if (!moves) {
      const from = this.layouts[clock.from - 1] ?? this.layouts[0];
      const to = this.layouts[clock.to - 1] ?? from;
      moves = from && to ? transition(this.map, from, to) : new Map();
      this.moves.set(key, moves);
    }
    return moves;
  }

  sync(state: GameState): void {
    const animate = this.motionProbe.visible;
    const clock = reorgClock(state);
    const moves = this.movesFor(clock);
    const now = clock.t < 0 ? clock.from : clock.to;
    const layout = this.layouts[now - 1];
    const whole = new Set<string>();
    for (const look of this.leaves) {
      const move = moves.get(look.leaf.key);
      const pose = move ? leafPose(look.leaf, move, clock, animate) : null;
      const { group, leaf } = look;
      group.visible = pose?.visible ?? false;
      if (!pose?.visible) continue;
      if (leafWhole(pose)) whole.add(look.leaf.key);
      const scale = pose.len / 0.5;
      group.scale.set(Math.max(0.001, scale), Math.max(0.001, pose.rise), 1);
      const [x, z] = leaf.axis === 'x' ? [pose.c, leaf.line] : [leaf.line, pose.c];
      group.position.set(x, 0, z);
      group.rotation.set(pose.tip, (leaf.axis === 'x' ? 0 : -Math.PI / 2) + pose.wobble, 0, 'YXZ');
      // Tall or cut down as in the layout it's in now (or the one it's coming into).
      const low =
        layout?.low.get(leaf.key) ??
        this.layouts[clock.to - 1]?.low.get(leaf.key) ??
        this.layouts[clock.from - 1]?.low.get(leaf.key) ??
        false;
      look.upper.visible = !low;
      look.glass.visible = low;
      // The board only on a whole leaf (a sliding one is squashed along its line).
      look.signs.forEach((sign, li) => {
        if (sign) sign.visible = li === now - 1 && leafWhole(pose);
      });
    }
    // A parked stack shows once every leaf of its tiles stands whole.
    for (const look of this.stacks)
      look.group.visible =
        look.layout === now - 1 && look.spot.leaves.every((key) => whole.has(key));
    this.syncTrolleys(moves, clock, animate);
    this.syncDesks(state, clock, animate);
    this.syncWarning(state);
  }

  /**
   * A trolley at each free end a train rolls out of or into, while it rolls:
   * just past the end, along the line. Only at ends on a tile's edge (open
   * floor beyond), not at corners.
   */
  private syncTrolleys(moves: Map<string, LeafMove>, clock: ReorgClock, animate: boolean): void {
    const { t } = clock;
    const live = new Set<string>();
    if (animate && clock.from !== clock.to) {
      for (const look of this.leaves) {
        const move = moves.get(look.leaf.key);
        if (!move || move.mode !== 'train') continue;
        if (move.change !== 'close' && move.change !== 'open') continue;
        const on =
          move.change === 'close'
            ? t >= -TRAIN_START - 10 && t < -TRAIN_END + 6
            : t >= -6 && t < OPEN + 10;
        if (!on || Math.abs(move.end - Math.round(move.end)) < 0.25) continue;
        const { axis, line } = look.leaf;
        const key = `${axis}${line},${move.end}`;
        if (live.has(key)) continue;
        live.add(key);
        let trolley = this.trolleys.get(key);
        if (!trolley) {
          trolley = this.mesh(trolleyModel());
          const c = move.end - move.sign * 0.26;
          const [x, z] = axis === 'x' ? [c, line] : [line, c];
          trolley.position.set(x, 0, z);
          trolley.rotation.y = (axis === 'x' ? 0 : -Math.PI / 2) + (move.sign > 0 ? Math.PI : 0);
          this.group.add(trolley);
          this.trolleys.set(key, trolley);
        }
      }
    }
    for (const [key, trolley] of this.trolleys) trolley.visible = live.has(key);
  }

  private syncDesks(state: GameState, clock: ReorgClock, animate: boolean): void {
    const warning = reorgWarning(state);
    const wallIn = (phase: number, p: GridPoint): boolean =>
      (layoutsOf(this.map)[phase - 1]?.tiles ?? this.map.tiles)[p.y * this.map.width + p.x] ===
      'wall';
    for (const look of this.desks) {
      const from = look.spots[clock.from - 1] ?? look.spots[0] ?? { x: 0, y: 0 };
      const to = look.spots[clock.to - 1] ?? from;
      const pose = deskPose(
        from,
        to,
        clock,
        wallIn(clock.to, from),
        wallIn(clock.from, to),
        animate,
      );
      look.group.position.set(pose.x, 0, pose.z);
      // A little sway while it rolls.
      const moving = pose.x !== Math.round(pose.x) || pose.z !== Math.round(pose.z);
      look.group.rotation.z = moving && animate ? Math.sin(state.tick * 0.9) * 0.01 : 0;
      look.group.visible = pose.opacity > 0.02;
      const fading = pose.opacity < 0.999;
      for (const m of [look.materials.body, look.materials.glow]) {
        if (m.transparent !== fading) m.needsUpdate = true;
        m.transparent = fading;
        m.opacity = pose.opacity;
        m.depthWrite = !fading;
      }
      // The tape X where it will stop, through the warning.
      const going = warning !== null && (from.x !== to.x || from.y !== to.y);
      look.tape.visible = going && clock.t < 0;
      if (going) {
        const at = gridToWorld(to.x, to.y, 0.02);
        look.tape.position.set(at.x, at.y, at.z);
      }
    }
  }

  private syncWarning(state: GameState): void {
    const warning = reorgWarning(state);
    const on = warning !== null && blinkOn(warning.inTicks);
    for (const i of warning?.tiles ?? []) {
      if (this.warnings.has(i)) continue;
      const mesh = new THREE.Mesh(this.warnGeometry, this.warnMaterial);
      const at = gridToWorld(i % this.map.width, Math.floor(i / this.map.width), 0.03);
      mesh.position.set(at.x, at.y, at.z);
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.warnings.set(i, mesh);
    }
    const lit = new Set(warning?.tiles ?? []);
    for (const [i, mesh] of this.warnings) mesh.visible = lit.has(i);
    // Bright on the blink, a steady glow between, quickening to the switch.
    this.warnMaterial.opacity = on ? 0.95 : 0.35 + 0.25 * ramp(-(warning?.inTicks ?? 0), -180, 0);
  }

  destroy(): void {
    this.group.removeFromParent();
    disposeTree(this.group);
    this.stripes.dispose();
    this.warnGeometry.dispose();
    for (const d of this.desks) {
      d.materials.body.dispose();
      d.materials.glow.dispose();
      d.materials.glass.dispose();
      d.materials.character.dispose();
    }
  }
}
