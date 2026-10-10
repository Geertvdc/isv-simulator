import { describe, expect, it } from 'vitest';
import { type Flow, createFlow } from '../flow/flow';
import { MUSIC_HURRY_RATE, MUSIC_HURRY_TICKS, MUSIC_PAUSE_DUCK } from '../sim/balance';
import { CHAPTERS } from '../sim/levels';
import { MUSIC_TRACKS, musicCue, musicRate } from './music';

function flowAt(screen: Flow['screen'], extra: Partial<Flow> = {}): Flow {
  return { ...createFlow(), awake: true, screen, ...extra };
}

const noRound = { chapterId: null, ticksLeft: null };

describe('musicCue', () => {
  it('stays silent on the title until someone presses a button', () => {
    expect(musicCue(createFlow(), noRound).track).toBeNull();
    expect(musicCue(flowAt('title'), noRound).track).toBe('menu');
  });

  it('plays the menu track around rounds and on the results', () => {
    for (const screen of ['lobby', 'levelSelect', 'credits', 'results', 'settings'] as const) {
      expect(musicCue(flowAt(screen), { chapterId: 'startup', ticksLeft: 100 })).toEqual({
        track: 'menu',
        rate: 1,
        duck: 1,
      });
    }
  });

  it('plays a track of its own per chapter, from the intro card to the end of the round', () => {
    const tracks = CHAPTERS.map((c) =>
      musicCue(flowAt('playing'), { ...noRound, chapterId: c.id }),
    );
    expect(tracks.map((t) => t.track)).toEqual(['garage', 'startup', 'scale-up', 'enterprise']);
    for (const t of tracks) expect(MUSIC_TRACKS).toContain(t.track);
    for (const screen of ['intro', 'countdown'] as const) {
      expect(musicCue(flowAt(screen), { ...noRound, chapterId: 'enterprise' })).toEqual({
        track: 'enterprise',
        rate: 1,
        duck: 1,
      });
    }
    expect(musicCue(flowAt('playing'), { ...noRound, chapterId: 'nope' }).track).toBe('garage');
  });

  it('ducks while paused, also in the settings opened from the pause menu', () => {
    const ctx = { chapterId: 'garage', ticksLeft: 5000 };
    expect(musicCue(flowAt('paused'), ctx)).toEqual({
      track: 'garage',
      rate: 1,
      duck: MUSIC_PAUSE_DUCK,
    });
    expect(musicCue(flowAt('settings', { settingsFrom: 'paused' }), ctx).duck).toBe(
      MUSIC_PAUSE_DUCK,
    );
    expect(musicCue(flowAt('settings', { settingsFrom: 'title' }), ctx).track).toBe('menu');
  });

  it('speeds up in the last 30 seconds of a round only', () => {
    expect(MUSIC_HURRY_TICKS).toBe(30 * 60);
    expect(musicRate(null)).toBe(1);
    expect(musicRate(MUSIC_HURRY_TICKS + 1)).toBe(1);
    expect(musicRate(MUSIC_HURRY_TICKS)).toBe(MUSIC_HURRY_RATE);
    expect(musicRate(0)).toBe(MUSIC_HURRY_RATE);
    const late = { chapterId: 'garage', ticksLeft: 10 };
    expect(musicCue(flowAt('playing'), late).rate).toBe(MUSIC_HURRY_RATE);
    expect(musicCue(flowAt('results'), late).rate).toBe(1);
  });
});
