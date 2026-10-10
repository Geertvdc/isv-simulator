import { describe, expect, it } from 'vitest';
import { INCIDENT_EXPIRED_PENALTY, INCIDENT_POINTS, ORDER_SPEED_BONUS_MAX } from './balance';
import { INCIDENT_TITLES } from './content';
import type { IncidentSchedule } from './levels';
import { createOrder, openIncident, shipPoints } from './orders';
import { COL, cmd, holdWork, idle, newTestGame, press, standAt } from './testing';
import { tick } from './tick';
import { queuedTickets } from './tickets';

const INCIDENTS: IncidentSchedule = {
  firstTick: 100,
  intervalTicks: 1000,
  jitterTicks: 200,
  timeLimitTicks: 600,
};

/** A test game with incidents on and no feature orders unless asked. */
function incidentGame(incidents: IncidentSchedule = INCIDENTS): ReturnType<typeof newTestGame> {
  const state = newTestGame({ durationTicks: 100_000, incidents });
  state.nextIncidentTick = incidents.firstTick;
  return state;
}

describe('incident schedule', () => {
  it('opens a red incident order on firstTick with a hotfix in the bug queue', () => {
    const state = incidentGame();
    idle(state, INCIDENTS.firstTick);
    expect(openIncident(state)).toBeUndefined();
    idle(state, 1);
    const incident = openIncident(state);
    expect(incident).toMatchObject({
      kind: 'incident',
      steps: ['code', 'pipeline'],
      createdTick: INCIDENTS.firstTick,
      expiresTick: INCIDENTS.firstTick + INCIDENTS.timeLimitTicks,
    });
    const [hotfix] = queuedTickets(state, 'bug');
    expect(hotfix?.kind).toBe('incident');
    expect(INCIDENT_TITLES).toContain(hotfix?.title);
  });

  it('never opens without a schedule', () => {
    const state = newTestGame({ durationTicks: 100_000 });
    expect(state.nextIncidentTick).toBeNull();
    idle(state, 5000);
    expect(state.orders).toEqual([]);
  });

  it('opens at most one at a time, the next one interval give or take jitter later', () => {
    const state = incidentGame();
    const opened: number[] = [];
    for (let i = 0; i < 20_000; i++) {
      tick(state, []);
      for (const e of state.events) {
        if (e.type === 'orderCreated' && e.order.kind === 'incident') opened.push(state.tick - 1);
      }
      expect(state.orders.filter((o) => o.kind === 'incident').length).toBeLessThanOrEqual(1);
      // Clear it away right after it opens, so the next one isn't held back.
      state.orders = state.orders.filter((o) => o.kind !== 'incident');
    }
    expect(opened.length).toBeGreaterThan(10);
    const gaps = opened.slice(1).map((t, i) => t - (opened[i] ?? 0));
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(INCIDENTS.intervalTicks - INCIDENTS.jitterTicks);
      expect(gap).toBeLessThanOrEqual(INCIDENTS.intervalTicks + INCIDENTS.jitterTicks);
    }
  });

  it('waits while an incident is open', () => {
    const state = incidentGame({ ...INCIDENTS, intervalTicks: 50, jitterTicks: 0 });
    idle(state, INCIDENTS.firstTick + 400);
    expect(state.orders.filter((o) => o.kind === 'incident')).toHaveLength(1);
  });

  it('never opens with less than its time limit left in the level', () => {
    const state = incidentGame();
    state.settings.durationTicks = INCIDENTS.firstTick + INCIDENTS.timeLimitTicks - 1;
    idle(state, INCIDENTS.firstTick + 10);
    expect(openIncident(state)).toBeUndefined();
    expect(state.nextIncidentTick).toBeNull();
  });

  it('is deterministic per seed', () => {
    const run = (): unknown => {
      const state = incidentGame();
      idle(state, 3000);
      return state.orders;
    };
    expect(run()).toEqual(run());
  });
});

describe('an open incident', () => {
  it('blocks new feature orders until it is gone, then the due feature opens at once', () => {
    const state = incidentGame();
    state.nextOrderTick = INCIDENTS.firstTick + 50;
    idle(state, INCIDENTS.firstTick + 200);
    expect(state.orders.map((o) => o.kind)).toEqual(['incident']);
    state.orders = [];
    idle(state, 1);
    expect(state.orders.map((o) => o.kind)).toEqual(['feature']);
  });

  it('lets bugs land and open features keep ticking', () => {
    const state = incidentGame();
    createOrder(state, 'feature', 'Old feature');
    state.pendingBugs.push({ tick: INCIDENTS.firstTick + 10, title: 'Bug: x' });
    idle(state, INCIDENTS.firstTick + 20);
    expect(state.orders.map((o) => o.kind).sort()).toEqual(['bug', 'feature', 'incident']);
  });

  it('jumps the bug queue: the hotfix is handed out before older bugs', () => {
    const state = incidentGame();
    createOrder(state, 'bug', 'Bug: old');
    idle(state, INCIDENTS.firstTick + 1);
    standAt(state, 1, COL.bugQueue);
    press(state);
    const carried = state.tickets.find((t) => t.location.kind === 'player');
    expect(carried?.kind).toBe('incident');
  });

  it('expires with INCIDENT_EXPIRED_PENALTY and takes its waiting hotfix along', () => {
    const state = incidentGame();
    createOrder(state, 'bug', 'Bug: stays');
    state.score = 100;
    idle(state, INCIDENTS.firstTick + INCIDENTS.timeLimitTicks);
    const expired = state.events.find((e) => e.type === 'orderExpired');
    expect(expired).toMatchObject({ penalty: INCIDENT_EXPIRED_PENALTY });
    expect(state.score).toBe(100 - INCIDENT_EXPIRED_PENALTY);
    expect(queuedTickets(state, 'bug').map((t) => t.kind)).toEqual(['bug']);
  });
});

describe('hotfix', () => {
  it('is coded, built and shipped for incident points plus the speed bonus', () => {
    const state = incidentGame();
    idle(state, INCIDENTS.firstTick + 1);
    standAt(state, 1, COL.bugQueue);
    press(state);
    standAt(state, 1, COL.keyboard);
    press(state);
    holdWork(state, 200);
    press(state);
    standAt(state, 1, COL.pipeline);
    press(state);
    idle(state, 300);
    press(state);
    standAt(state, 1, COL.ship);
    tick(state, [cmd(state, 1, { interact: true })]);
    const shipped = state.events.find((e) => e.type === 'orderShipped');
    expect(shipped).toMatchObject({ order: { kind: 'incident' } });
    expect(openIncident(state)).toBeUndefined();
    expect(state.score).toBeGreaterThan(INCIDENT_POINTS);
  });

  it('scores INCIDENT_POINTS plus the speed bonus', () => {
    const state = incidentGame();
    const order = createOrder(state, 'incident', 'Prod is down');
    expect(shipPoints(order, order.createdTick)).toBe(INCIDENT_POINTS + ORDER_SPEED_BONUS_MAX);
    expect(shipPoints(order, order.expiresTick)).toBe(INCIDENT_POINTS);
  });
});
