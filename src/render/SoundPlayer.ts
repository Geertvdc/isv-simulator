import Phaser from 'phaser';
import type { GameEvent } from '../sim/orders';
import type { GameState } from '../sim/state';
import { SOUND_KEYS, type SoundKey, handWork, soundUrl, soundsFor } from './sounds';

const VOLUME = 0.5;
/** Quieter for sounds that repeat a lot. */
const VOLUME_BY_KEY: Partial<Record<SoundKey, number>> = { work: 0.25, 'put-down': 0.4 };
/** While anyone works, the work tick plays this often at most. */
const WORK_SOUND_MS = 220;

/** Plays sound effects for sim events, and a ticking while players work. */
export class SoundPlayer {
  private lastHandWork = 0;
  private lastWorkSound = -Infinity;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Queues every sound file; call from the scene's `preload`. */
  static preload(scene: Phaser.Scene): void {
    for (const key of SOUND_KEYS) scene.load.audio(key, soundUrl(key));
  }

  /** Plays the sounds for this frame. `time` is scene time in ms. */
  play(state: GameState, events: readonly GameEvent[], time: number): void {
    for (const key of soundsFor(events)) this.sound(key);
    const work = handWork(state);
    if (work > this.lastHandWork && time - this.lastWorkSound >= WORK_SOUND_MS) {
      this.lastWorkSound = time;
      this.sound('work');
    }
    this.lastHandWork = work;
  }

  private sound(key: SoundKey): void {
    // Missing files (e.g. a failed load) shouldn't stop the game.
    if (!this.scene.cache.audio.exists(key)) return;
    this.scene.sound.play(key, { volume: VOLUME_BY_KEY[key] ?? VOLUME });
  }
}
