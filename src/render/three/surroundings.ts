import * as THREE from 'three';
import type { LevelMap } from '../../sim/level';
import { tileHash } from '../mapShape';
import { type Vec3, gridToWorld } from '../projection';
import { type Character, applyPose, createExtra } from './Characters';
import { type KitMaterials, type Model, kitMaterials } from './kit';
import { SLAB_DEPTH } from './layout';
import { matte } from './look';
import { type Pose, type PoseInput, playerPose } from './pose';
import { SETTINGS, type SeatPose, type SetPiece } from './setDressing';

/**
 * The world around a level (phase 15): the ground, rows of the chapter's
 * props down the sides and along the back, people at desks and chatting,
 * and a few walking past. Pure decoration: nothing here is in the sim, and
 * nothing stands on the level's floor.
 */

/** The ground outside sits at the foot of the level's slab. */
export const GROUND_Y = -SLAB_DEPTH - 0.013;
const GROUND_SIZE = 90;
/** Space between the slab and the near row, and between the slab and the far row. */
const NEAR_GAP = 0.9;
/** Far enough out for the deepest near-row prop (2 tiles) and a 1-tile lane for walkers. */
const FAR_GAP = NEAR_GAP + 2 + 1;
/** Space between props in a row: varies from prop to prop, so rows don't read as a grid. */
const ROW_GAP_MIN = 0.35;
const ROW_GAP_MAX = 1.2;
/** Loose props turn up to this much either way from facing the office. */
const YAW_JITTER = 0.2;
/** How far the rows run past the level, in tiles. */
const RUN_OVER = 3;
const WALK_SPEED = 0.9;
/** Most background people in a level: enough for life, few enough to never crowd the players. */
const MAX_EXTRAS = 14;

export type Row = 'near' | 'far';

/** One prop placed in the world: where its center goes, how it's turned, and in which row. */
export interface Placement {
  piece: SetPiece;
  at: Vec3;
  yaw: number;
  row: Row;
  side: 'left' | 'right' | 'back';
}

/** A background person and what they do. */
interface Extra {
  character: Character;
  pose: SeatPose | 'walking';
  phase: number;
  /** Walkers pace back and forth along x between these, at `z`. */
  walk?: { from: number; to: number; z: number };
}

/** `tileHash` stirred, so its low bits don't cycle (a plain `% 4` of it does). */
function mixed(i: number, salt: number): number {
  let h = tileHash(i, salt);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A number from 0 to 1 for slot `i` of row `salt`. */
function unit(i: number, salt: number): number {
  return (mixed(i * 31 + 7, salt) % 1000) / 1000;
}

/**
 * Where a chapter's props go around a `width` × `height` level: a near and
 * a far row down each side (facing the office, from the back edge forward)
 * and along the back (running out past both sides, so the corners are
 * covered without the rows crossing). Spacing and turn vary per prop, the
 * same piece never stands twice in a row, and each rare piece (the car, the
 * cat) shows once, at the start of a far row. Pure and deterministic; no
 * two props overlap and nothing lands on the slab.
 */
export function placeSetPieces(setting: string, width: number, height: number): Placement[] {
  const s = SETTINGS[setting];
  if (!s) return [];
  const out: Placement[] = [];
  const left = -0.5;
  const right = width - 0.5;
  const back = -0.5;
  const rare = [...s.rare];
  /**
   * The pieces of a row in order, never the same twice running. Side far rows
   * (in view from the back edge forward) take the rare pieces at slots 0 and 2.
   */
  const pick = (row: readonly SetPiece[], takesRare: boolean, salt: number) => {
    let last: SetPiece | null = null;
    let i = 0;
    return (): SetPiece | null => {
      const slot = i++;
      if (takesRare && (slot === 0 || slot === 2) && rare.length > 0) {
        return (last = rare.shift() ?? null);
      }
      let index = mixed(slot, salt) % row.length;
      if (row[index] === last && row.length > 1) index = (index + 1) % row.length;
      return (last = row[index] ?? null);
    };
  };
  const jitter = (i: number, salt: number) => (unit(i, salt + 1) * 2 - 1) * YAW_JITTER;
  // Down the sides, from the back edge forward: the prop's front (+z) turns toward the office.
  const side = (row: readonly SetPiece[], kind: Row, dir: -1 | 1, salt: number) => {
    if (row.length === 0) return;
    const next = pick(row, kind === 'far', salt);
    const gap = kind === 'near' ? NEAR_GAP : FAR_GAP;
    let z = back;
    for (let i = 0; z < height + RUN_OVER; i++) {
      const piece = next();
      if (!piece) break;
      const [sx, sz] = piece.size;
      // Turned a quarter, the prop's depth (sz) runs across x and its width along z.
      const x = dir < 0 ? left - gap - sz / 2 : right + gap + sz / 2;
      const yaw = (dir * -Math.PI) / 2 + jitter(i, salt);
      const at = gridToWorld(x, z + sx / 2, GROUND_Y);
      out.push({ piece, at, yaw, row: kind, side: dir < 0 ? 'left' : 'right' });
      z += sx + ROW_GAP_MIN + unit(i, salt) * (ROW_GAP_MAX - ROW_GAP_MIN);
    }
  };
  // Along the back, out past the sides' rows of the same kind (and no further: off screen).
  const along = (row: readonly SetPiece[], kind: Row, salt: number) => {
    if (row.length === 0) return;
    const next = pick(row, false, salt);
    const gap = kind === 'near' ? NEAR_GAP : FAR_GAP;
    const reach = gap + 2 + 1;
    let x = left - reach;
    for (let i = 0; x < right + reach; i++) {
      const piece = next();
      if (!piece) break;
      const [sx, sz] = piece.size;
      const at = gridToWorld(x + sx / 2, back - gap - sz / 2, GROUND_Y);
      out.push({ piece, at, yaw: jitter(i, salt), row: kind, side: 'back' });
      x += sx + ROW_GAP_MIN + unit(i, salt) * (ROW_GAP_MAX - ROW_GAP_MIN);
    }
  };
  side(s.far, 'far', -1, 37);
  side(s.far, 'far', 1, 41);
  along(s.far, 'far', 67);
  along(s.near, 'near', 53);
  side(s.near, 'near', -1, 11);
  side(s.near, 'near', 1, 23);
  return out;
}

/**
 * The surroundings for a level, as one group, and `update` to move the
 * people in them. Props of a kind share one instanced mesh.
 */
export class Surroundings {
  readonly root = new THREE.Group();
  private readonly extras: Extra[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  /**
   * The surroundings' own materials: the kit's, a third darker, and screens
   * that glow softly instead of blooming, so nothing out here outshines the office.
   */
  private readonly materials: KitMaterials = dimmedMaterials();

  constructor(map: LevelMap, setting: string | undefined) {
    const s = setting === undefined ? undefined : SETTINGS[setting];
    if (!s) return;
    const { width, height } = map;
    const cx = (width - 1) / 2;
    const cz = (height - 1) / 2;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE).rotateX(-Math.PI / 2),
      matte(s.ground, 0.95),
    );
    put(ground, gridToWorld(cx, cz, GROUND_Y));
    ground.receiveShadow = true;
    this.root.add(ground);
    if (s.path !== null) {
      // A driveway or aisle down the left, under the far row.
      const path = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, height + 2 * RUN_OVER + 6).rotateX(-Math.PI / 2),
        matte(s.path, 0.9),
      );
      put(path, gridToWorld(-0.5 - FAR_GAP - 2 - 1.3, cz, GROUND_Y + 0.004));
      path.receiveShadow = true;
      this.root.add(path);
    }

    const placements = placeSetPieces(setting ?? '', width, height);
    this.addProps(placements);
    let n = 0;
    // People only in the near rows (further out they'd only be clutter), and not too many.
    for (const p of placements) {
      // Not along the back either: heads would bob over the back wall, by the stations.
      if (p.row !== 'near' || p.side === 'back') continue;
      for (const seat of p.piece.seats ?? []) {
        if (n >= MAX_EXTRAS - s.walkers) break;
        const cos = Math.cos(p.yaw);
        const sin = Math.sin(p.yaw);
        const [sx, sz] = seat.at;
        const at = {
          x: p.at.x + sx * cos + sz * sin,
          y: GROUND_Y,
          z: p.at.z - sx * sin + sz * cos,
        };
        this.addExtra(n++, at, p.yaw + seat.yaw, seat.pose);
      }
    }
    // Walkers pace the lane between the back rows, out past the sides.
    for (let i = 0; i < s.walkers; i++) {
      const z = -0.5 - NEAR_GAP - 2 - 0.5 - (i % 2) * 0.3;
      const lane = { from: -0.5 - FAR_GAP, to: width - 0.5 + FAR_GAP, z };
      this.addExtra(n++, gridToWorld(lane.from, z, GROUND_Y), Math.PI / 2, 'walking', lane);
    }
  }

  /** Moves the background people; `animate` false (low quality) leaves them still. */
  update(timeMs: number, animate: boolean): void {
    if (!animate) return;
    for (const extra of this.extras) {
      const { character } = extra;
      const t = timeMs / 1000 + extra.phase * 10;
      if (extra.pose === 'walking' && extra.walk) {
        const { from, to, z } = extra.walk;
        const span = to - from;
        const cycle = (t * WALK_SPEED) % (span * 2);
        const forward = cycle < span;
        const x = forward ? from + cycle : to - (cycle - span);
        put(character.root, gridToWorld(x, z, GROUND_Y));
        character.root.rotation.y = forward ? Math.PI / 2 : -Math.PI / 2;
      }
      applyPose(character, poseFor(extra, timeMs));
    }
  }

  destroy(): void {
    for (const g of this.geometries) g.dispose();
    const { body, glow, glass } = this.materials;
    for (const m of [body, glow, glass]) m.dispose();
    for (const extra of this.extras) for (const g of extra.character.geometries) g.dispose();
  }

  private addProps(placements: readonly Placement[]): void {
    // One instanced mesh per piece and row: far props cast no shadow (they're
    // outside the sun's shadow map anyway, and it'd cut off with a hard line).
    const groups = new Map<string, { piece: SetPiece; row: Row; at: Placement[] }>();
    const models = new Map<SetPiece, Model>();
    const ids = new Map<SetPiece, number>();
    for (const p of placements) {
      const id = ids.get(p.piece) ?? ids.size;
      ids.set(p.piece, id);
      const key = `${id}:${p.row}`;
      const group = groups.get(key) ?? { piece: p.piece, row: p.row, at: [] };
      group.at.push(p);
      groups.set(key, group);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (const { piece, row, at } of groups.values()) {
      let model = models.get(piece);
      if (!model) {
        model = piece.model();
        models.set(piece, model);
        for (const g of [model.body, model.glow, model.glass]) if (g) this.geometries.push(g);
      }
      const layers: [THREE.BufferGeometry | null, THREE.Material, boolean][] = [
        [model.body, this.materials.body, true],
        [model.glow, this.materials.glow, false],
        [model.glass, this.materials.glass, false],
      ];
      for (const [geometry, material, lit] of layers) {
        if (!geometry?.getAttribute('position')) continue;
        const mesh = new THREE.InstancedMesh(geometry, material, at.length);
        at.forEach((p, i) => {
          q.setFromAxisAngle(up, p.yaw);
          mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.at.x, p.at.y, p.at.z), q, one));
        });
        mesh.castShadow = lit && row === 'near';
        mesh.receiveShadow = lit;
        this.root.add(mesh);
      }
    }
  }

  private addExtra(
    n: number,
    at: Vec3,
    yaw: number,
    pose: Extra['pose'],
    walk?: Extra['walk'],
  ): void {
    const character = createExtra(n * 7 + 3, this.materials);
    put(character.root, at);
    character.root.rotation.y = yaw;
    // Hands are too small to matter in a shadow out here.
    character.leftHand.castShadow = false;
    character.rightHand.castShadow = false;
    this.root.add(character.root);
    const extra: Extra = { character, pose, phase: (n * 0.61) % 1, ...(walk ? { walk } : {}) };
    this.extras.push(extra);
    applyPose(character, poseFor(extra, 0));
  }
}

const STILL: PoseInput = {
  speed: 0,
  fullSpeed: 1,
  carrying: false,
  working: false,
  dashing: false,
  windUp: 0,
  shovedMs: null,
  phase: 0,
};

/** What a background person is doing now. */
function poseFor(extra: Extra, timeMs: number): Pose {
  const input: PoseInput = {
    ...STILL,
    phase: extra.phase,
    working: extra.pose === 'typing',
    speed: extra.pose === 'walking' ? WALK_SPEED : 0,
  };
  const pose = playerPose(input, timeMs);
  if (extra.pose === 'chatting') {
    // Talking with their hands, nodding along.
    const t = timeMs / 1000 + extra.phase * 7;
    pose.nod = Math.sin(t * 2.3) * 0.12;
    pose.rightHand = { x: 0.36, y: 0.6 + Math.max(0, Math.sin(t * 3.1)) * 0.15, z: 0.25 };
  }
  return pose;
}

function put(obj: THREE.Object3D, p: Vec3): void {
  obj.position.set(p.x, p.y, p.z);
}

/** How much darker the world outside is than the office. */
const DIM = 0.66;
/** Screens outside glow at this, well under the bloom threshold. */
const OUTSIDE_GLOW = 0.55;

function dimmedMaterials(): KitMaterials {
  const m = kitMaterials();
  m.body.color.setScalar(DIM);
  m.glass.color.setScalar(DIM);
  // Not boosted by the stage: these never bloom.
  m.glow.userData = {};
  m.glow.color.setScalar(OUTSIDE_GLOW);
  return m;
}
