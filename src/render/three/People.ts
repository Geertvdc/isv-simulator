import * as THREE from 'three';
import {
  MANAGER_SPEED,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  THROW_HOLD_TICKS,
} from '../../sim/balance';
import { stationWorkStep } from '../../sim/interact';
import { getTile } from '../../sim/level';
import type { GameEvent } from '../../sim/orders';
import { isDashing } from '../../sim/movement';
import { type GameState, type Player, type PlayerId, targetTile } from '../../sim/state';
import { ticketCarriedBy, ticketOnTile } from '../../sim/tickets';
import { playerColor } from '../playerColors';
import { type Vec3, gridToWorld } from '../projection';
import type { RoundView } from '../roundView';
import { type Character, applyPose, createDeveloper, createManager } from './Characters';
import type { KitMaterials } from './kit';
import { facingYaw } from './layout';
import {
  type FacingHold,
  type Gait,
  type Motion,
  type PoseInput,
  createFacingHold,
  createMotion,
  noteMotion,
  playerPose,
  shownYaw,
  stepGait,
  turnToward,
} from './pose';

/** The ring on the floor around each player, in their color. */
const RING = { inner: PLAYER_RADIUS * 0.95, outer: PLAYER_RADIUS * 1.25, lift: 0.006 };
/** How fast characters turn to face a new way, radians per second. */
const TURN_SPEED = 20;
/** Working shows for this long after the last bit of progress, so a tick without any doesn't flicker. */
const WORK_HOLD_MS = 200;

interface Person {
  character: Character;
  /** The way they face on screen now, turning toward where the sim says. */
  yaw: number;
  phase: number;
  /** The walk cycle as drawn, integrated frame by frame so speed changes don't jump it. */
  gait: Gait;
  /** Where they were last drawn moving, so frozen speeds don't walk them on the spot. */
  motion: Motion;
  /** Keeps a diagonal facing shown when they stop just after going straight. */
  facing: FacingHold;
  /** Visual-only memory of the work in front of them. */
  work: WorkMemory;
  shovedAtMs: number | null;
  ring: THREE.Mesh | null;
  materials: THREE.Material[];
}

/**
 * The developers and managers in the 3D world, keyed by id: placed where the view says, turned smoothly, and posed from
 * what they're doing (walking, carrying, working, dashing, winding up a
 * throw, stumbling after a shove).
 */
export class People {
  private readonly players = new Map<PlayerId, Person>();
  private readonly managers = new Map<number, Person>();
  private readonly ringGeometry = new THREE.RingGeometry(RING.inner, RING.outer, 40).rotateX(
    -Math.PI / 2,
  );
  private lastMs: number | null = null;
  private readonly seen = new Set<PlayerId>();
  private readonly seenManagers = new Set<number>();

  constructor(
    private readonly world: THREE.Scene,
    private readonly materials: KitMaterials,
  ) {}

  /** The way player `id` is drawn facing now (turning smoothly), if they're drawn. */
  yawOf(id: PlayerId): number | undefined {
    return this.players.get(id)?.yaw;
  }

  /** Places and poses everyone; returns the players drawn (those with a position). */
  sync(view: RoundView, events: readonly GameEvent[], timeMs: number): ReadonlySet<PlayerId> {
    const { state } = view;
    const dt = this.lastMs === null ? 0 : Math.max(0, (timeMs - this.lastMs) / 1000);
    this.lastMs = timeMs;
    // Over, nobody walks: the last velocities stay frozen in the state.
    const over = state.result !== null;
    for (const event of events) {
      if (event.type === 'shoved' || event.type === 'managerBumped') {
        const person = this.players.get(event.target);
        if (person) person.shovedAtMs = timeMs;
      }
    }

    const seen = this.seen;
    seen.clear();
    for (const player of state.players) {
      const pos = view.renderPos(player.id);
      if (!pos) continue;
      seen.add(player.id);
      let person = this.players.get(player.id);
      const simYaw = facingYaw(player.facing);
      if (!person) {
        person = this.addDeveloper(player.id, simYaw);
        this.players.set(player.id, person);
      }
      const moving = noteMotion(person.motion, pos, timeMs) && !over;
      const speed = moving ? Math.hypot(player.vel.x, player.vel.y) : 0;
      const acting = isDashing(player) || player.throwCharge > 0;
      const yaw = shownYaw(person.facing, simYaw, speed, PLAYER_MAX_SPEED, acting, timeMs);
      this.place(person, gridToWorld(pos.x, pos.y), yaw, dt);
      applyPose(
        person.character,
        playerPose(this.poseInput(state, player, person, timeMs, dt, speed), timeMs),
      );
    }
    this.drop(this.players, seen);

    const seenManagers = this.seenManagers;
    seenManagers.clear();
    for (const manager of state.managers) {
      const pos = view.renderManagerPos(manager.id);
      if (!pos) continue;
      seenManagers.add(manager.id);
      let person = this.managers.get(manager.id);
      if (!person) {
        const yaw = facingYaw(manager.facing);
        person = this.addPerson(createManager(this.materials), null, manager.id, yaw);
        this.managers.set(manager.id, person);
      }
      this.place(person, gridToWorld(pos.x, pos.y), facingYaw(manager.facing), dt);
      const fullSpeed = MANAGER_SPEED * 1.6;
      const moving = noteMotion(person.motion, pos, timeMs) && !over;
      stepGait(person.gait, moving && manager.walking ? MANAGER_SPEED : 0, fullSpeed, dt);
      const input: PoseInput = {
        ...IDLE,
        speed: person.gait.speed,
        fullSpeed,
        phase: person.phase,
        stride: person.gait.stride,
      };
      const pose = playerPose(input, timeMs);
      // The coffee stays level in front: only the free hand swings.
      pose.rightHand = { x: 0.42, y: 0.55, z: 0.3 };
      applyPose(person.character, pose);
    }
    this.drop(this.managers, seenManagers);
    return seen;
  }

  destroy(): void {
    this.drop(this.players, new Set());
    this.drop(this.managers, new Set());
    this.ringGeometry.dispose();
  }

  private poseInput(
    state: GameState,
    player: Player,
    person: Person,
    timeMs: number,
    dt: number,
    /** Speed over the floor as drawn: 0 when they aren't moving on screen. */
    speed: number,
  ): PoseInput {
    const carrying = ticketCarriedBy(state, player.id) !== undefined;
    stepGait(person.gait, speed, PLAYER_MAX_SPEED, dt);
    // The step on the station they face: its progress tells whether they work it.
    const target = targetTile(state, player.id);
    const onTarget = carrying ? undefined : ticketOnTile(state, target.x, target.y);
    const step = onTarget && stationWorkStep(onTarget, getTile(state.level, target.x, target.y));
    const sample = onTarget && step ? { ticketId: onTarget.id, progress: step.progress } : null;
    return {
      speed: person.gait.speed,
      fullSpeed: PLAYER_MAX_SPEED,
      carrying,
      working: noteWork(person.work, sample, speed, timeMs),
      dashing: isDashing(player),
      windUp: carrying ? player.throwCharge / THROW_HOLD_TICKS : 0,
      shovedMs: person.shovedAtMs === null ? null : timeMs - person.shovedAtMs,
      phase: person.phase,
      stride: person.gait.stride,
    };
  }

  private place(person: Person, at: Vec3, yaw: number, dt: number): void {
    const root = person.character.root;
    root.position.set(at.x, at.y, at.z);
    person.yaw = dt === 0 ? yaw : turnToward(person.yaw, yaw, TURN_SPEED * dt);
    root.rotation.y = person.yaw;
    if (person.ring) person.ring.position.set(at.x, at.y + RING.lift, at.z);
  }

  private addDeveloper(id: PlayerId, yaw: number): Person {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: playerColor(id),
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
    this.world.add(ring);
    const person = this.addPerson(createDeveloper(id, this.materials), ring, id, yaw);
    person.materials.push(ringMaterial);
    return person;
  }

  private addPerson(
    character: Character,
    ring: THREE.Mesh | null,
    id: number,
    yaw: number,
  ): Person {
    this.world.add(character.root);
    return {
      character,
      // Facing the right way from the start, not spinning in.
      yaw,
      // Spread out so idle people don't breathe in step.
      phase: (id * 0.37) % 1,
      // Out of step with each other from the start too.
      gait: { speed: 0, stride: ((id * 0.37) % 1) * Math.PI * 2 },
      motion: createMotion(),
      facing: createFacingHold(),
      work: createWorkMemory(),
      shovedAtMs: null,
      ring,
      materials: [],
    };
  }

  private drop<K>(people: Map<K, Person>, seen: Set<K>): void {
    for (const [key, person] of people) {
      if (seen.has(key)) continue;
      this.world.remove(person.character.root);
      if (person.ring) this.world.remove(person.ring);
      for (const g of person.character.geometries) g.dispose();
      for (const m of person.materials) m.dispose();
      people.delete(key);
    }
  }
}

const IDLE: PoseInput = {
  speed: 0,
  fullSpeed: 1,
  carrying: false,
  working: false,
  dashing: false,
  windUp: 0,
  shovedMs: null,
  phase: 0,
  stride: 0,
};

/** What a player last saw of the step in front of them. */
export interface WorkMemory {
  ticketId: number | null;
  progress: number;
  workedAtMs: number;
}

export function createWorkMemory(): WorkMemory {
  return { ticketId: null, progress: 0, workedAtMs: -Infinity };
}

/** Faster than this and they're walking past, not working. */
const WORK_MAX_SPEED = 0.5;

/**
 * Whether a player looks like they're working: standing at a station whose
 * step on the same ticket moved since last frame (shown a moment longer,
 * so a tick without progress doesn't flicker). The sim doesn't say who
 * works a station, so two players at one station both look busy.
 */
export function noteWork(
  memory: WorkMemory,
  sample: { ticketId: number; progress: number } | null,
  speed: number,
  timeMs: number,
): boolean {
  if (!sample) {
    memory.ticketId = null;
  } else {
    const same = memory.ticketId === sample.ticketId;
    if (same && sample.progress > memory.progress && speed < WORK_MAX_SPEED) {
      memory.workedAtMs = timeMs;
    }
    memory.ticketId = sample.ticketId;
    memory.progress = sample.progress;
  }
  return timeMs - memory.workedAtMs < WORK_HOLD_MS;
}
