import { describe, expect, it } from 'vitest';
import { MODELED_HAT_TOP } from './Characters';
import { HAT_TOP } from './layout';
import { createWorkMemory, noteWork } from './People';

describe('noteWork', () => {
  it('shows working while the step in front moves, a moment longer, then stops', () => {
    const m = createWorkMemory();
    expect(noteWork(m, { ticketId: 1, progress: 0.1 }, 0, 0)).toBe(false);
    expect(noteWork(m, { ticketId: 1, progress: 0.2 }, 0, 16)).toBe(true);
    // No progress this frame: still working for a moment.
    expect(noteWork(m, { ticketId: 1, progress: 0.2 }, 0, 100)).toBe(true);
    expect(noteWork(m, { ticketId: 1, progress: 0.2 }, 0, 400)).toBe(false);
  });

  it('does not count turning to another ticket with more progress', () => {
    const m = createWorkMemory();
    noteWork(m, { ticketId: 1, progress: 0.1 }, 0, 0);
    expect(noteWork(m, { ticketId: 2, progress: 0.8 }, 0, 16)).toBe(false);
  });

  it('does not count walking past a station someone else works', () => {
    const m = createWorkMemory();
    noteWork(m, { ticketId: 1, progress: 0.1 }, 4, 0);
    expect(noteWork(m, { ticketId: 1, progress: 0.2 }, 4, 16)).toBe(false);
  });

  it('forgets the ticket when nothing is in front', () => {
    const m = createWorkMemory();
    noteWork(m, { ticketId: 1, progress: 0.1 }, 0, 0);
    noteWork(m, null, 0, 16);
    expect(noteWork(m, { ticketId: 1, progress: 0.3 }, 0, 32)).toBe(false);
  });
});

describe('character heights', () => {
  it('keeps the layout hat top (overlays start above it) in step with the models', () => {
    expect(Math.abs(MODELED_HAT_TOP - HAT_TOP)).toBeLessThan(0.03);
  });
});
