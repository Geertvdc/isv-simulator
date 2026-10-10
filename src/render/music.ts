/**
 * Which music plays when, how fast and how loud. Phaser-free so it can be
 * tested; `MusicPlayer` does the playing.
 */

import type { Flow } from '../flow/flow';
import { MUSIC_HURRY_RATE, MUSIC_HURRY_TICKS, MUSIC_PAUSE_DUCK } from '../sim/balance';

/** Every music track, by key; the file is `assets/music/<key>.ogg`. */
export const MUSIC_TRACKS = ['menu', 'garage', 'startup', 'scale-up', 'enterprise'] as const;

export type MusicTrack = (typeof MUSIC_TRACKS)[number];

export function musicUrl(track: MusicTrack): string {
  return `assets/music/${track}.ogg`;
}

/** Phaser cache key of a track, apart from the sound effect keys. */
export function musicKey(track: MusicTrack): string {
  return `music-${track}`;
}

/** The level track per chapter id; chapters not listed play the Garage's. */
const CHAPTER_TRACKS: Readonly<Record<string, MusicTrack>> = {
  garage: 'garage',
  startup: 'startup',
  'scale-up': 'scale-up',
  enterprise: 'enterprise',
};

/** How loud each track plays at full music volume, 0 to 1; evens out the files. */
const TRACK_VOLUME: Readonly<Record<MusicTrack, number>> = {
  menu: 0.55,
  garage: 0.5,
  startup: 0.45,
  'scale-up': 0.55,
  enterprise: 0.55,
};

export function trackVolume(track: MusicTrack): number {
  return TRACK_VOLUME[track];
}

/** What should be playing. */
export interface MusicCue {
  /** `null`: silence. */
  track: MusicTrack | null;
  /** Playback rate: 1, or faster near the end of a round. */
  rate: number;
  /** Share of the volume: lower while paused. */
  duck: number;
}

/** What the music reads from the game besides the flow. */
export interface MusicContext {
  /** Chapter of the level being played or picked, if any. */
  chapterId: string | null;
  /** Ticks left in the round on screen, or `null` without a round. */
  ticksLeft: number | null;
}

/** Whether the screen belongs to a round in progress. */
function inRound(flow: Flow): boolean {
  switch (flow.screen) {
    case 'intro':
    case 'countdown':
    case 'playing':
    case 'paused':
      return true;
    case 'settings':
      return flow.settingsFrom === 'paused';
    default:
      return false;
  }
}

/** Speeds up in the last `MUSIC_HURRY_TICKS` of a round. */
export function musicRate(ticksLeft: number | null): number {
  return ticksLeft !== null && ticksLeft <= MUSIC_HURRY_TICKS ? MUSIC_HURRY_RATE : 1;
}

/**
 * The music for this moment: silence on the title until someone presses a
 * button (browsers only allow audio after a gesture), the chapter's track
 * from the intro card to the end of the round, the menu track elsewhere,
 * including the results.
 */
export function musicCue(flow: Flow, ctx: MusicContext): MusicCue {
  if (flow.screen === 'title' && !flow.awake) return { track: null, rate: 1, duck: 1 };
  if (!inRound(flow)) return { track: 'menu', rate: 1, duck: 1 };
  const track = CHAPTER_TRACKS[ctx.chapterId ?? ''] ?? 'garage';
  const paused =
    flow.screen !== 'intro' && flow.screen !== 'countdown' && flow.screen !== 'playing';
  return { track, rate: musicRate(ctx.ticksLeft), duck: paused ? MUSIC_PAUSE_DUCK : 1 };
}
