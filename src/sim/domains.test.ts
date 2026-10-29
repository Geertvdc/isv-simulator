import { describe, expect, it } from 'vitest';
import { TICKET_TITLES } from './content';
import { levelById } from './levels';
import { createOrder, expireOrders, orderOf, updateOrders, shipTicket } from './orders';
import * as rng from './rng';
import { type TicketDomain, TICKET_DOMAINS } from './roles';
import { createGame } from './state';
import { loseTicket, mergeParts, queuedTickets } from './tickets';

function labGame(seed = 7) {
  const level = levelById('lab-roles');
  if (!level) throw new Error('Missing role lab level');
  return createGame(level, seed, [1]);
}

describe('ticket domains', () => {
  it('creates exact seeded domain counts and respects the configured drought over batch boundaries', () => {
    const state = labGame(173);
    state.settings = {
      ...state.settings,
      reviewShare: 0,
      designShare: 0,
      fullstackShare: 0,
      incidents: null,
      orderSchedule: {
        ...state.settings.orderSchedule,
        intervalTicks: 1,
        jitterTicks: 0,
        maxOpenOrders: 100,
      },
    };
    state.nextOrderTick = 0;
    const domains: TicketDomain[] = [];
    for (let i = 0; i < 50; i++) {
      updateOrders(state);
      const order = state.orders[0];
      if (!order) throw new Error('Expected one scheduled order');
      domains.push(order.domain);
      state.orders = [];
      state.tickets = [];
      state.tick++;
    }

    const schedule = state.settings.domainSchedule;
    if (!schedule) throw new Error('Role lab has no domain schedule');
    for (let start = 0; start < domains.length; start += 10) {
      const batch = domains.slice(start, start + 10);
      for (const domain of TICKET_DOMAINS) {
        expect(batch.filter((candidate) => candidate === domain)).toHaveLength(2);
      }
    }
    const drought = Object.fromEntries(TICKET_DOMAINS.map((domain) => [domain, 0])) as Record<
      TicketDomain,
      number
    >;
    for (const domain of domains) {
      for (const candidate of TICKET_DOMAINS) {
        drought[candidate] = domain === candidate ? 0 : drought[candidate] + 1;
        expect(drought[candidate]).toBeLessThanOrEqual(schedule.maxDrought);
      }
    }
  });

  it('replays the same domain batch for the same seed', () => {
    function sequence(seed: number): TicketDomain[] {
      const state = labGame(seed);
      state.settings = {
        ...state.settings,
        reviewShare: 0,
        designShare: 0,
        fullstackShare: 0,
        incidents: null,
        orderSchedule: { ...state.settings.orderSchedule, intervalTicks: 1, jitterTicks: 0 },
      };
      state.nextOrderTick = 0;
      const result: TicketDomain[] = [];
      for (let i = 0; i < 20; i++) {
        updateOrders(state);
        const order = state.orders[0];
        if (!order) throw new Error('Expected one scheduled order');
        result.push(order.domain);
        state.orders = [];
        state.tickets = [];
        state.tick++;
      }
      return result;
    }
    expect(sequence(51)).toEqual(sequence(51));
    expect(sequence(52)).not.toEqual(sequence(51));
  });

  it('does not consume any extra random draws on classic levels', () => {
    const state = labGame(91);
    state.settings = {
      ...state.settings,
      domainSchedule: undefined,
      reviewShare: 0,
      designShare: 0,
      fullstackShare: 0,
    };
    state.nextOrderTick = 0;
    const [, titleState] = rng.pick(state.rngState, TICKET_TITLES);
    const [, expectedState] = rng.int(
      titleState,
      -state.settings.orderSchedule.jitterTicks,
      state.settings.orderSchedule.jitterTicks,
    );
    updateOrders(state);
    expect(state.rngState).toBe(expectedState);
    expect(state.domainBatch).toEqual([]);
    expect(state.domainBatchIndex).toBe(0);
    expect(state.domainDrought).toEqual({
      general: 0,
      frontend: 0,
      backend: 0,
      infra: 0,
      mixed: 0,
    });
  });

  it('fails explicitly when configured counts cannot meet the drought bound', () => {
    const state = labGame();
    state.settings.domainSchedule = {
      counts: { general: 1, frontend: 1, backend: 0, infra: 0, mixed: 0 },
      maxDrought: 0,
    };
    state.nextOrderTick = 0;
    expect(() => {
      updateOrders(state);
    }).toThrow(/cannot satisfy/);
  });

  it('matches and expires only tickets from the same domain on an opted-in level', () => {
    const state = labGame();
    const frontend = createOrder(state, 'feature', 'Frontend work', undefined, 'frontend');
    const backend = createOrder(state, 'feature', 'Backend work', undefined, 'backend');
    const frontendTicket = queuedTickets(state, 'feature').find(
      (ticket) => ticket.domain === 'frontend',
    );
    const backendTicket = queuedTickets(state, 'feature').find(
      (ticket) => ticket.domain === 'backend',
    );
    if (!frontendTicket || !backendTicket) throw new Error('Missing domain-specific tickets');
    expect(orderOf(state, frontendTicket)).toBe(frontend);
    expect(orderOf(state, backendTicket)).toBe(backend);

    frontend.expiresTick = state.tick;
    expireOrders(state);
    expect(state.orders).toEqual([backend]);
    expect(state.tickets).toEqual([backendTicket]);
  });

  it('keeps merge ingredients, merged tickets, and delayed bugs in their work domains', () => {
    const state = labGame();
    const order = createOrder(state, 'fullstack', 'Checkout');
    const frontend = queuedTickets(state, 'feature').find((ticket) => ticket.kind === 'frontend');
    const backend = queuedTickets(state, 'feature').find((ticket) => ticket.kind === 'backend');
    if (!frontend || !backend) throw new Error('Missing full-stack ingredients');
    expect(order.domain).toBe('mixed');
    expect(frontend.domain).toBe('frontend');
    expect(backend.domain).toBe('backend');
    const frontendStep = frontend.steps[0];
    const backendStep = backend.steps[0];
    if (!frontendStep || !backendStep) throw new Error('Missing merge ingredient steps');
    frontendStep.progress = 1;
    backendStep.progress = 1;
    frontend.location = { kind: 'tile', x: 2, y: 1 };
    backend.location = { kind: 'tile', x: 3, y: 1 };
    const merged = mergeParts(state, frontend, backend, 4, 1);
    expect(merged.domain).toBe('mixed');
    loseTicket(state, merged, { x: 4, y: 1 });
    expect(merged.domain).toBe('mixed');

    state.orders = [];
    state.tickets = [];
    state.pendingBugs.push({ tick: state.tick, title: 'Bug: checkout', domain: 'backend' });
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    updateOrders(state);
    expect(state.orders[0]?.kind).toBe('bug');
    expect(state.orders[0]?.domain).toBe('backend');
    expect(state.tickets[0]?.domain).toBe('backend');
  });

  it('uses the incident schedule domain rather than assuming infrastructure', () => {
    const state = labGame();
    state.settings.incidents = {
      firstTick: 0,
      intervalTicks: 1000,
      jitterTicks: 0,
      timeLimitTicks: 100,
      domain: 'frontend',
    };
    state.nextIncidentTick = 0;
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    updateOrders(state);
    expect(state.orders[0]?.kind).toBe('incident');
    expect(state.orders[0]?.domain).toBe('frontend');
    expect(state.tickets[0]?.domain).toBe('frontend');
  });

  it('retains the ticket domain on a bug scheduled by shipping', () => {
    const state = labGame();
    const order = createOrder(state, 'feature', 'Cross-cutting change', undefined, 'mixed');
    const ticket = state.tickets[0];
    if (!ticket) throw new Error('Missing feature ticket');
    ticket.steps.forEach((step) => (step.progress = 1));
    ticket.location = { kind: 'player', playerId: 1 };
    state.orders = [order];
    let seed = 0;
    while (seed < 10_000 && rng.next(seed)[0] >= 0.25) seed++;
    if (seed === 10_000) throw new Error('Could not find a deterministic bug roll seed');
    state.rngState = seed;
    expect(shipTicket(state, 1, ticket)).toBe(true);
    const pending = state.pendingBugs[0];
    expect(pending?.domain).toBe('mixed');
  });
});
