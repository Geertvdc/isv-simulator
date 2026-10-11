import { describe, expect, it } from 'vitest';
import {
  NET_INTERP_DELAY_MS,
  NET_INTERP_SNAP_DISTANCE,
  NET_SNAPSHOT_BUFFER_SIZE,
  TICKS_PER_SECOND,
} from '../sim/balance';
import type { Vec } from '../sim/state';
import {
  type InterpolatableState,
  createSnapshotBuffer,
  pushSnapshot,
  renderTickFor,
  sampleAt,
} from './interpolation';

function state(
  tick: number,
  players: Record<number, Vec>,
  managers: Record<number, Vec> = {},
  levelId = 'garage',
): InterpolatableState {
  const list = (r: Record<number, Vec>) =>
    Object.entries(r).map(([id, pos]) => ({ id: Number(id), pos }));
  return { levelId, tick, players: list(players), managers: list(managers) };
}

function buffered(...snapshots: [serverTick: number, state: InterpolatableState][]) {
  const buffer = createSnapshotBuffer();
  for (const [serverTick, s] of snapshots) pushSnapshot(buffer, serverTick, s);
  return buffer;
}

describe('interpolation', () => {
  const a = state(100, { 1: { x: 2, y: 2 }, 2: { x: 5, y: 5 } }, { 1: { x: 0, y: 0 } });
  const b = state(103, { 1: { x: 3, y: 2 }, 2: { x: 5, y: 4 } }, { 1: { x: 0.5, y: 0 } });

  it('has nothing to show without snapshots', () => {
    expect(sampleAt(createSnapshotBuffer(), 10)).toBeNull();
  });

  it('gives the midpoint halfway between two snapshots', () => {
    const frame = sampleAt(buffered([200, a], [203, b]), 201.5);
    expect(frame).toMatchObject({ status: 'interpolating', serverTick: 200, alpha: 0.5 });
    expect(frame?.state).toBe(a);
    expect(frame?.players).toEqual({ 1: { x: 2.5, y: 2 }, 2: { x: 5, y: 4.5 } });
    expect(frame?.managers).toEqual({ 1: { x: 0.25, y: 0 } });
  });

  it('gives the positions of a snapshot exactly on it', () => {
    const buffer = buffered([200, a], [203, b]);
    expect(sampleAt(buffer, 200)?.players).toEqual({ 1: { x: 2, y: 2 }, 2: { x: 5, y: 5 } });
    const onNewest = sampleAt(buffer, 203);
    expect(onNewest).toMatchObject({ status: 'interpolating', state: b, alpha: 0 });
    expect(onNewest?.players).toEqual({ 1: { x: 3, y: 2 }, 2: { x: 5, y: 4 } });
  });

  it('holds the newest snapshot when render time runs past it', () => {
    const frame = sampleAt(buffered([200, a], [203, b]), 210);
    expect(frame).toMatchObject({ status: 'waiting', state: b, alpha: 0 });
    expect(frame?.players[1]).toEqual({ x: 3, y: 2 });
  });

  it('holds the oldest snapshot when render time is before it', () => {
    const frame = sampleAt(buffered([200, a], [203, b]), 150);
    expect(frame).toMatchObject({ status: 'behind', state: a });
    expect(frame?.players[1]).toEqual({ x: 2, y: 2 });
  });

  it('works with a single snapshot', () => {
    expect(sampleAt(buffered([200, a]), 200)).toMatchObject({ status: 'interpolating', state: a });
    expect(sampleAt(buffered([200, a]), 201)).toMatchObject({ status: 'waiting', state: a });
  });

  it('does not glide a player that only exists in the newer snapshot', () => {
    const joined = state(103, { 1: { x: 3, y: 2 }, 2: { x: 5, y: 4 }, 3: { x: 9, y: 9 } });
    const frame = sampleAt(buffered([200, a], [203, joined]), 201.5);
    expect(Object.keys(frame?.players ?? {})).toEqual(['1', '2']);
  });

  it('jumps instead of gliding when something moved too far', () => {
    const far = NET_INTERP_SNAP_DISTANCE + 0.5;
    const teleported = state(103, { 1: { x: 2 + far, y: 2 }, 2: { x: 5, y: 4 } });
    const frame = sampleAt(buffered([200, a], [203, teleported]), 201.5);
    expect(frame?.players[1]).toEqual({ x: 2, y: 2 });
    expect(frame?.players[2]).toEqual({ x: 5, y: 4.5 });
  });

  it('does not glide across rounds: another level or a restart', () => {
    const otherLevel = state(103, { 1: { x: 3, y: 2 } }, {}, 'open-plan');
    expect(sampleAt(buffered([200, a], [203, otherLevel]), 201.5)?.players[1]).toEqual({
      x: 2,
      y: 2,
    });
    const restarted = state(0, { 1: { x: 3, y: 2 } });
    expect(sampleAt(buffered([200, a], [203, restarted]), 201.5)?.players[1]).toEqual({
      x: 2,
      y: 2,
    });
  });

  it('ignores duplicate and out-of-order snapshots', () => {
    const buffer = createSnapshotBuffer();
    expect(pushSnapshot(buffer, 200, a)).toBe(true);
    expect(pushSnapshot(buffer, 203, b)).toBe(true);
    expect(pushSnapshot(buffer, 203, a)).toBe(false);
    expect(pushSnapshot(buffer, 201, a)).toBe(false);
    expect(buffer.entries.map((e) => e.serverTick)).toEqual([200, 203]);
  });

  it('picks the right pair among many snapshots', () => {
    const buffer = createSnapshotBuffer();
    for (let i = 0; i < 10; i++) pushSnapshot(buffer, i * 3, state(i * 3, { 1: { x: i, y: 0 } }));
    const frame = sampleAt(buffer, 13);
    expect(frame?.serverTick).toBe(12);
    expect(frame?.players[1]?.x).toBeCloseTo(4 + 1 / 3);
  });

  it('keeps at most NET_SNAPSHOT_BUFFER_SIZE snapshots', () => {
    const buffer = createSnapshotBuffer();
    for (let i = 0; i < NET_SNAPSHOT_BUFFER_SIZE * 3; i++) pushSnapshot(buffer, i, a);
    expect(buffer.entries).toHaveLength(NET_SNAPSHOT_BUFFER_SIZE);
    expect(buffer.entries[0]?.serverTick).toBe(NET_SNAPSHOT_BUFFER_SIZE * 2);
  });

  it('renders NET_INTERP_DELAY_MS behind the server', () => {
    expect(renderTickFor(1000)).toBeCloseTo(1000 - (NET_INTERP_DELAY_MS * TICKS_PER_SECOND) / 1000);
  });

  it('moves smoothly frame by frame through a stream of snapshots', () => {
    // A player walking right at 1 tile per 3 ticks, rendered at 60 fps behind the stream.
    const buffer = createSnapshotBuffer();
    for (let t = 0; t <= 60; t += 3) pushSnapshot(buffer, t, state(t, { 1: { x: t / 3, y: 0 } }));
    for (let now = 10; now <= 60; now += 0.5) {
      const frame = sampleAt(buffer, renderTickFor(now));
      if (renderTickFor(now) < 0) continue;
      expect(frame?.players[1]?.x).toBeCloseTo(renderTickFor(now) / 3);
    }
  });
});
