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
import { type PoseInput, playerPose, turnToward } from './pose';

/** The ring on the floor around each player, in their color. */
const RING = { inner: PLAYER_RADIUS * 0.95, outer: PLAYER_RADIUS * 1.25, lift: 0.006 };
/** How fast characters turn to face a new way, radians per second. */
const TURN_SPEED = 14;
/** Working shows for this long after the last bit of progress, so a tick without any doesn't flicker. */
const WORK_HOLD_MS = 200;

interface Person {
  character: Character;
  /** The way they face on screen now, turning toward where the sim says. */
  yaw: number;
  phase: number;
  /** Visual-only memory: the progress of the step they work on, and when it last moved. */
  progress: number;
  workedAtMs: number;
  shovedAtMs: number | null;
  ring: THREE.Mesh | null;
  materials: THREE.Material[];
}

/**
 * The developers and managers in the 3D world, keyed by id like the 2D
 * renderers: placed where the view says, turned smoothly, and posed from
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

  constructor(
    private readonly world: THREE.Scene,
    private readonly materials: KitMaterials,
  ) {}

  sync(view: RoundView, events: readonly GameEvent[], timeMs: number): void {
    const { state } = view;
    const dt = this.lastMs === null ? 0 : Math.max(0, (timeMs - this.lastMs) / 1000);
    this.lastMs = timeMs;
    for (const event of events) {
      if (event.type === 'shoved' || event.type === 'managerBumped') {
        const person = this.players.get(event.target);
        if (person) person.shovedAtMs = timeMs;
      }
    }

    const seen = new Set<PlayerId>();
    for (const player of state.players) {
      const pos = view.renderPos(player.id);
      if (!pos) continue;
      seen.add(player.id);
      let person = this.players.get(player.id);
      if (!person) {
        person = this.addDeveloper(player.id);
        this.players.set(player.id, person);
      }
      this.place(person, gridToWorld(pos.x, pos.y), facingYaw(player.facing), dt);
      applyPose(
        person.character,
        playerPose(this.poseInput(state, player, person, timeMs), timeMs),
      );
    }
    this.drop(this.players, seen);

    const seenManagers = new Set<number>();
    for (const manager of state.managers) {
      const pos = view.renderManagerPos(manager.id);
      if (!pos) continue;
      seenManagers.add(manager.id);
      let person = this.managers.get(manager.id);
      if (!person) {
        person = this.addPerson(createManager(this.materials), null, manager.id);
        this.managers.set(manager.id, person);
      }
      this.place(person, gridToWorld(pos.x, pos.y), facingYaw(manager.facing), dt);
      const input: PoseInput = {
        ...IDLE,
        speed: manager.walking ? MANAGER_SPEED : 0,
        fullSpeed: MANAGER_SPEED * 1.6,
        phase: person.phase,
      };
      const pose = playerPose(input, timeMs);
      // The coffee stays level in front: only the free hand swings.
      pose.rightHand = { x: 0.24, y: 0.5, z: 0.2 };
      applyPose(person.character, pose);
    }
    this.drop(this.managers, seenManagers);
  }

  destroy(): void {
    this.drop(this.players, new Set());
    this.drop(this.managers, new Set());
    this.ringGeometry.dispose();
  }

  private poseInput(state: GameState, player: Player, person: Person, timeMs: number): PoseInput {
    const carrying = ticketCarriedBy(state, player.id) !== undefined;
    // Working: the step on the station they face moved since last frame.
    const target = targetTile(state, player.id);
    const onTarget = carrying ? undefined : ticketOnTile(state, target.x, target.y);
    const step = onTarget && stationWorkStep(onTarget, getTile(state.level, target.x, target.y));
    const progress = step ? step.progress : -1;
    if (progress > person.progress && person.progress >= 0) person.workedAtMs = timeMs;
    person.progress = progress;
    return {
      speed: Math.hypot(player.vel.x, player.vel.y),
      fullSpeed: PLAYER_MAX_SPEED,
      carrying,
      working: timeMs - person.workedAtMs < WORK_HOLD_MS,
      dashing: isDashing(player),
      windUp: carrying ? player.throwCharge / THROW_HOLD_TICKS : 0,
      shovedMs: person.shovedAtMs === null ? null : timeMs - person.shovedAtMs,
      phase: person.phase,
    };
  }

  private place(person: Person, at: Vec3, yaw: number, dt: number): void {
    const root = person.character.root;
    root.position.set(at.x, at.y, at.z);
    person.yaw = dt === 0 ? yaw : turnToward(person.yaw, yaw, TURN_SPEED * dt);
    root.rotation.y = person.yaw;
    if (person.ring) person.ring.position.set(at.x, at.y + RING.lift, at.z);
  }

  private addDeveloper(id: PlayerId): Person {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: playerColor(id),
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
    this.world.add(ring);
    const person = this.addPerson(createDeveloper(id, this.materials), ring, id);
    person.materials.push(ringMaterial);
    return person;
  }

  private addPerson(character: Character, ring: THREE.Mesh | null, id: number): Person {
    this.world.add(character.root);
    return {
      character,
      yaw: 0,
      // Spread out so idle people don't breathe in step.
      phase: (id * 0.37) % 1,
      progress: -1,
      workedAtMs: -Infinity,
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
};
