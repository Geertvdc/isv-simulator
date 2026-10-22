import * as THREE from 'three';
import type { LevelMap } from '../../sim/level';
import { tileHash } from '../mapShape';
import { type Vec3, gridToWorld } from '../projection';
import { type Character, applyPose, createExtra } from './Characters';
import { type KitMaterials, type Model } from './kit';
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
/** Space between the slab and the near row, and between the rows. */
const NEAR_GAP = 0.45;
const FAR_GAP = 3.1;
const ROW_GAP = 0.35;
/** How far the rows run past the level's corners, in tiles. */
const RUN_OVER = 3;
const WALK_SPEED = 0.9;

/** One prop placed in the world: where its center goes and how it's turned. */
export interface Placement {
  piece: SetPiece;
  at: Vec3;
  yaw: number;
}

/** A background person and what they do. */
interface Extra {
  character: Character;
  pose: SeatPose | 'walking';
  phase: number;
  /** Walkers pace back and forth along x between these, at `z`. */
  walk?: { from: number; to: number; z: number };
}

/**
 * Where a chapter's props go around a `width` × `height` level: a near and a
 * far row down each side (facing the office) and along the back. Pure and
 * deterministic, so it can be tested; nothing lands on the slab.
 */
export function placeSetPieces(setting: string, width: number, height: number): Placement[] {
  const s = SETTINGS[setting];
  if (!s) return [];
  const out: Placement[] = [];
  const left = -0.5;
  const right = width - 0.5;
  const back = -0.5;
  // Down the sides: the prop's front (+z) turns toward the office.
  const side = (row: readonly SetPiece[], gap: number, dir: -1 | 1, salt: number) => {
    let z = -RUN_OVER;
    for (let i = 0; z < height + RUN_OVER && row.length > 0; i++) {
      const piece = row[tileHash(i, salt) % row.length];
      if (!piece) break;
      const [sx, sz] = piece.size;
      // Turned a quarter, the prop's depth (sz) runs across x and its width along z.
      const x = dir < 0 ? left - gap - sz / 2 : right + gap + sz / 2;
      out.push({ piece, at: gridToWorld(x, z + sx / 2, GROUND_Y), yaw: (dir * -Math.PI) / 2 });
      z += sx + ROW_GAP;
    }
  };
  const along = (row: readonly SetPiece[], gap: number, salt: number) => {
    let x = -RUN_OVER - 2;
    for (let i = 0; x < width + RUN_OVER + 2 && row.length > 0; i++) {
      const piece = row[tileHash(salt, i) % row.length];
      if (!piece) break;
      const [sx, sz] = piece.size;
      out.push({ piece, at: gridToWorld(x + sx / 2, back - gap - sz / 2, GROUND_Y), yaw: 0 });
      x += sx + ROW_GAP;
    }
  };
  side(s.near, NEAR_GAP, -1, 11);
  side(s.near, NEAR_GAP, 1, 23);
  side(s.far, FAR_GAP, -1, 37);
  side(s.far, FAR_GAP, 1, 41);
  along(s.near, NEAR_GAP, 53);
  along(s.far, FAR_GAP, 67);
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

  constructor(
    map: LevelMap,
    setting: string | undefined,
    private readonly materials: KitMaterials,
  ) {
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
      put(path, gridToWorld(-0.5 - FAR_GAP - 1, cz, GROUND_Y + 0.004));
      path.receiveShadow = true;
      this.root.add(path);
    }

    const placements = placeSetPieces(setting ?? '', width, height);
    this.addProps(placements);
    let n = 0;
    for (const p of placements) {
      for (const seat of p.piece.seats ?? []) {
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
    // Walkers pace the lane between the back rows.
    for (let i = 0; i < s.walkers; i++) {
      const z = -0.5 - (NEAR_GAP + FAR_GAP) / 2 - 0.6 - i * 0.5;
      const lane = { from: -RUN_OVER, to: width - 1 + RUN_OVER, z };
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
    for (const extra of this.extras) for (const g of extra.character.geometries) g.dispose();
  }

  private addProps(placements: readonly Placement[]): void {
    const byPiece = new Map<SetPiece, Placement[]>();
    for (const p of placements) byPiece.set(p.piece, [...(byPiece.get(p.piece) ?? []), p]);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (const [piece, at] of byPiece) {
      const model: Model = piece.model();
      const layers: [THREE.BufferGeometry | null, THREE.Material, boolean][] = [
        [model.body, this.materials.body, true],
        [model.glow, this.materials.glow, false],
        [model.glass, this.materials.glass, false],
      ];
      for (const [geometry, material, lit] of layers) {
        if (!geometry?.getAttribute('position')) continue;
        this.geometries.push(geometry);
        const mesh = new THREE.InstancedMesh(geometry, material, at.length);
        at.forEach((p, i) => {
          q.setFromAxisAngle(up, p.yaw);
          mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.at.x, p.at.y, p.at.z), q, one));
        });
        mesh.castShadow = lit;
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
