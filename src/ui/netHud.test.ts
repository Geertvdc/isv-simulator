import { describe, expect, it } from 'vitest';
import { netStatsText } from './netHud';

describe('ping corner', () => {
  it('shows the round trip, and says so while waiting for snapshots', () => {
    expect(netStatsText({ rttMs: null, status: null, lag: null })).toBe('Ping …');
    expect(netStatsText({ rttMs: 41.6, status: 'interpolating', lag: null })).toBe('Ping 42 ms');
    expect(netStatsText({ rttMs: 230, status: 'waiting', lag: { lagMs: 100, jitterMs: 20 } })).toBe(
      'Ping 230 ms · waiting for the server · simulated lag 100±20 ms',
    );
  });
});
