import Phaser from 'phaser';
import type { Flow } from '../../flow/flow';
import { type SaveData, type StorageLike, writeSave } from '../../flow/save';
import { RESULTS_STAR_DELAY_MS, RESULTS_STAR_INTERVAL_MS, SFX_VOLUME_MAX } from '../../sim/balance';
import type { GameEvent } from '../../sim/orders';
import type { GameState } from '../../sim/state';
import { MusicPlayer } from '../MusicPlayer';
import { musicCue } from '../music';
import { SoundPlayer } from '../SoundPlayer';

/**
 * The game's sound: the music (kept for the whole game, so it plays on
 * across scene restarts), the sound effects of the scene on screen, the
 * mute and volume settings, and pausing while the page is hidden.
 */
export class AudioController {
  private music: MusicPlayer | null = null;
  private sounds: SoundPlayer | null = null;
  private scene: Phaser.Scene | null = null;

  constructor(
    private readonly save: SaveData,
    private readonly storage: StorageLike | null,
    /** The chapter of level `index`, for the music. */
    private readonly chapterIdOf: (levelIndex: number) => string | null,
  ) {}

  /** Queues every sound and track; call from the scene's `preload`. */
  static preload(scene: Phaser.Scene): void {
    SoundPlayer.preload(scene);
    MusicPlayer.preload(scene);
  }

  /** Call from the scene's `create`, every time: the sound effects belong to the scene. */
  attach(scene: Phaser.Scene): void {
    this.scene = scene;
    const { game } = scene;
    if (!this.music) {
      this.music = new MusicPlayer(game);
      // Phaser pauses sound whenever the window loses focus (e.g. after Tab or a click
      // in the address bar) and waits for a click to bring it back. Only pause while
      // the page is actually hidden, which also stops the game loop.
      game.sound.pauseOnBlur = false;
      game.events.on(Phaser.Core.Events.HIDDEN, () => {
        game.sound.pauseAll();
      });
      game.events.on(Phaser.Core.Events.VISIBLE, () => {
        game.sound.resumeAll();
      });
    }
    this.sounds = new SoundPlayer(scene);
  }

  /**
   * The music for `flow` (this browser's, or the online room's) and the
   * round on screen. Returns the track playing.
   */
  updateMusic(deltaMs: number, flow: Flow, state: GameState | null): string | null {
    if (!this.music) return null;
    const cue = musicCue(flow, {
      chapterId: this.chapterIdOf(flow.levelIndex),
      ticksLeft: state ? state.settings.durationTicks - state.tick : null,
    });
    this.music.update(cue, deltaMs);
    return cue.track;
  }

  /** The sound effects for this frame's events. */
  play(state: GameState, events: readonly GameEvent[], timeMs: number): void {
    this.sounds?.play(state, events, timeMs);
  }

  /** A chime for each star as the results screen fills them in. */
  countStars(stars: number): void {
    const scene = this.scene;
    if (!scene) return;
    for (let i = 0; i < stars; i++) {
      scene.time.delayedCall(RESULTS_STAR_DELAY_MS + i * RESULTS_STAR_INTERVAL_MS, () => {
        this.sounds?.sound('ship');
      });
    }
  }

  /** Flips mute in the save and remembers it; `applySettings` makes it heard. */
  toggleMute(): void {
    const { settings } = this.save;
    settings.muted = !settings.muted;
    writeSave(this.storage, this.save);
  }

  /** Mute and volumes from the save, applied right away. */
  applySettings(): void {
    const { sfxVolume, musicVolume, muted } = this.save.settings;
    if (this.scene) this.scene.game.sound.mute = muted;
    if (this.sounds) this.sounds.volume = sfxVolume / SFX_VOLUME_MAX;
    if (this.music) this.music.volume = musicVolume / SFX_VOLUME_MAX;
  }
}
