import Phaser from 'phaser';
import { MUSIC_FADE_MS } from '../sim/balance';
import {
  MUSIC_TRACKS,
  type MusicCue,
  type MusicTrack,
  musicKey,
  musicUrl,
  trackVolume,
} from './music';

type Sound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;

interface Playing {
  track: MusicTrack;
  sound: Sound;
}

/**
 * Plays the music cue on the game's sound manager: loops the track, fades
 * from one track to the next, glides volume changes (pause, settings) and
 * sets the playback rate. Lives on the game, not a scene, so the music
 * carries on across scene restarts.
 */
export class MusicPlayer {
  private current: Playing | null = null;
  /** Tracks fading out after a switch. */
  private fading: Sound[] = [];
  /** 0 to 1, from the settings. */
  volume = 1;

  constructor(private readonly game: Phaser.Game) {}

  /** Queues every track; call from the scene's `preload`. */
  static preload(scene: Phaser.Scene): void {
    for (const track of MUSIC_TRACKS) scene.load.audio(musicKey(track), musicUrl(track));
  }

  /** Moves towards `cue`; call every frame with the frame's length in ms. */
  update(cue: MusicCue, deltaMs: number): void {
    const step = Math.min(1, deltaMs / MUSIC_FADE_MS);
    if (cue.track !== (this.current?.track ?? null)) this.switchTo(cue.track);

    for (const sound of this.fading) sound.setVolume(Math.max(0, sound.volume - step));
    this.fading = this.fading.filter((sound) => {
      if (sound.volume > 0) return true;
      sound.destroy();
      return false;
    });

    const playing = this.current;
    if (!playing) return;
    const target = trackVolume(playing.track) * this.volume * cue.duck;
    const volume = playing.sound.volume;
    const next =
      volume < target ? Math.min(target, volume + step) : Math.max(target, volume - step);
    if (next !== volume) playing.sound.setVolume(next);
    if (playing.sound.rate !== cue.rate) playing.sound.setRate(cue.rate);
  }

  private switchTo(track: MusicTrack | null): void {
    if (this.current) this.fading.push(this.current.sound);
    this.current = null;
    if (!track) return;
    const key = musicKey(track);
    // A track that failed to load just doesn't play.
    if (!this.game.cache.audio.exists(key)) return;
    const sound = this.game.sound.add(key, { loop: true, volume: 0 });
    sound.play();
    this.current = { track, sound };
  }
}
