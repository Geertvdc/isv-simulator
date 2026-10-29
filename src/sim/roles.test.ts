import { describe, expect, it } from 'vitest';
import {
  DESIGN_RATE,
  PAIR_RATE,
  PAIR_WORKER_FACTOR,
  REPAIR_TICKS,
  ROLE_CODE_RATES,
  ROLE_REPAIR_RATES,
  ROLE_TEST_RATES,
  WORK_RATE,
} from './balance';
import { parseLevelMap } from './level';
import { levelWithMap } from './levels';
import { roleWorkRate, ROLE_IDS, TICKET_DOMAINS } from './roles';
import { type GameState, type InputCommand, createGame, getPlayer } from './state';
import { COL, addTicket, newTestGame, standAt } from './testing';
import { tick } from './tick';
import { type Ticket, ticketOnTile } from './tickets';

function input(
  state: GameState,
  playerId: number,
  buttons: Partial<InputCommand> = {},
): InputCommand {
  return {
    playerId,
    tick: state.tick,
    move: { x: 0, y: 0 },
    interact: false,
    work: false,
    dash: false,
    ...buttons,
  };
}

function progress(ticket: Ticket, kind: 'code' | 'test'): number {
  return ticket.steps.find((step) => step.kind === kind)?.progress ?? 0;
}

describe('role work rates', () => {
  it('raises specialist strengths while preserving every neutral speed and off-role penalty', () => {
    expect(ROLE_CODE_RATES).toEqual({
      generalist: { general: 1, frontend: 1, backend: 1, infra: 1, mixed: 1 },
      frontend: { general: 0.85, frontend: 2, backend: 0.85, infra: 0.85, mixed: 1 },
      backend: { general: 0.85, frontend: 0.85, backend: 2, infra: 0.85, mixed: 1 },
      qa: { general: 0.8, frontend: 0.8, backend: 0.8, infra: 0.8, mixed: 0.8 },
      platform: { general: 0.85, frontend: 0.85, backend: 0.85, infra: 2, mixed: 1 },
    });
    expect(ROLE_TEST_RATES).toEqual({
      generalist: 1,
      frontend: 0.9,
      backend: 0.9,
      qa: 2,
      platform: 0.9,
    });
    expect(ROLE_REPAIR_RATES).toEqual({
      generalist: 1,
      frontend: 1,
      backend: 1,
      qa: 1,
      platform: 1.5,
    });
  });

  it.each(ROLE_IDS.flatMap((role) => TICKET_DOMAINS.map((domain) => [role, domain] as const)))(
    '%s completes %s coding at the configured 60 Hz rate',
    (role, domain) => {
      const state = newTestGame();
      const player = getPlayer(state, 1);
      if (!player) throw new Error('Missing test player');
      player.roleId = role;
      const ticket = addTicket(state, COL.keyboard);
      ticket.domain = domain;
      standAt(state, 1, COL.keyboard);
      const rate = WORK_RATE * roleWorkRate(role, 'code', domain);
      const ticks = Math.ceil(1 / rate - 1e-10);
      for (let i = 0; i < ticks - 1; i++) tick(state, [input(state, 1, { work: true })]);
      expect(progress(ticket, 'code')).toBeLessThan(1);
      tick(state, [input(state, 1, { work: true })]);
      expect(progress(ticket, 'code')).toBe(1);
    },
  );

  it.each(ROLE_IDS.flatMap((role) => TICKET_DOMAINS.map((domain) => [role, domain] as const)))(
    '%s completes %s testing at the configured 60 Hz rate',
    (role, domain) => {
      const state = newTestGame();
      const player = getPlayer(state, 1);
      if (!player) throw new Error('Missing test player');
      player.roleId = role;
      const ticket = addTicket(state, COL.testBench, { done: 1 });
      ticket.domain = domain;
      standAt(state, 1, COL.testBench);
      const rate = WORK_RATE * roleWorkRate(role, 'test', domain);
      const ticks = Math.ceil(1 / rate - 1e-10);
      for (let i = 0; i < ticks - 1; i++) tick(state, [input(state, 1, { work: true })]);
      expect(progress(ticket, 'test')).toBeLessThan(1);
      tick(state, [input(state, 1, { work: true })]);
      expect(progress(ticket, 'test')).toBe(1);
    },
  );

  it('keeps design and review rates outside the role matrix', () => {
    expect(roleWorkRate('qa', 'design', 'frontend')).toBe(1);
    expect(roleWorkRate('platform', 'review', 'infra')).toBe(1);
    expect(DESIGN_RATE).toBe(WORK_RATE);
  });

  it('applies the design multiplier once and keeps two generalists at 1.9x', () => {
    const state = newTestGame();
    state.settings.pairing = true;
    const ticket = addTicket(state, COL.keyboard);
    const design = ticket.steps.find((step) => step.kind === 'design');
    if (!design) ticket.steps.unshift({ kind: 'design', progress: 1 });
    else design.progress = 1;
    ticket.domain = 'frontend';
    standAt(state, 1, COL.keyboard);
    const second = getPlayer(state, 2);
    if (!second) throw new Error('Missing second player');
    second.pos = { x: COL.keyboard + 1, y: 2 };
    second.facing = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    const before = progress(ticket, 'code');
    tick(state, [input(state, 1, { work: true }), input(state, 2, { work: true })]);
    expect(progress(ticket, 'code') - before).toBeCloseTo(PAIR_RATE * 1.6);
    expect(PAIR_WORKER_FACTOR * 2).toBeCloseTo(1.9);
  });

  it('selects the strongest two paired coders, independent of input order', () => {
    const state = createGame(
      levelWithMap(
        parseLevelMap(
          '##############\n#IKTCCXPSR#.B#\n#............#\n#1234........#\n##############',
        ),
      ),
      1,
      [1, 2, 3],
    );
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    state.settings.pairing = true;
    const ticket = addTicket(state, COL.keyboard);
    ticket.domain = 'frontend';
    const p1 = getPlayer(state, 1);
    const p2 = getPlayer(state, 2);
    const p3 = getPlayer(state, 3);
    if (!p1 || !p2 || !p3) throw new Error('Missing test player');
    p1.roleId = 'frontend';
    p2.roleId = 'generalist';
    p3.roleId = 'backend';
    standAt(state, 1, COL.keyboard);
    p2.pos = { x: 3, y: 2 };
    p2.facing = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    p3.pos = { x: 1, y: 2 };
    p3.facing = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    const delta = PAIR_WORKER_FACTOR * WORK_RATE * (2 + 1);
    const reversed = structuredClone(state);
    reversed.players.reverse();
    tick(state, [
      input(state, 3, { work: true }),
      input(state, 1, { work: true }),
      input(state, 2, { work: true }),
    ]);
    tick(reversed, [
      input(reversed, 2, { work: true }),
      input(reversed, 1, { work: true }),
      input(reversed, 3, { work: true }),
    ]);
    expect(progress(ticket, 'code')).toBeCloseTo(delta);
    expect(state.pairing).toEqual([{ x: COL.keyboard, y: 1 }]);
    const reversedTicket = reversed.tickets[0];
    if (!reversedTicket) throw new Error('Reversed work simulation lost the ticket');
    expect(progress(reversedTicket, 'code')).toBeCloseTo(delta);
    expect(reversed.pairing).toEqual(state.pairing);
  });

  it('uses the best active tester at a non-pair station', () => {
    const state = newTestGame();
    const ticket = addTicket(state, COL.testBench, { done: 1 });
    ticket.domain = 'backend';
    const qa = getPlayer(state, 2);
    if (!qa) throw new Error('Missing second player');
    qa.roleId = 'qa';
    standAt(state, 1, COL.testBench);
    qa.pos = { x: COL.testBench + 1, y: 2 };
    qa.facing = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    tick(state, [input(state, 1, { work: true }), input(state, 2, { work: true })]);
    expect(progress(ticket, 'test')).toBeCloseTo(WORK_RATE * 2);
  });

  it('uses platform repair speed once even when several workers repair together', () => {
    const state = newTestGame();
    const pipeline = state.pipelines.find((candidate) => candidate.x === COL.pipeline);
    if (!pipeline) throw new Error('Missing test pipeline');
    pipeline.broken = true;
    const platform = getPlayer(state, 2);
    if (!platform) throw new Error('Missing second player');
    platform.roleId = 'platform';
    standAt(state, 1, COL.pipeline);
    platform.pos = { x: COL.pipeline + 1, y: 2 };
    platform.facing = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    tick(state, [input(state, 1, { work: true }), input(state, 2, { work: true })]);
    expect(pipeline.repair).toBeCloseTo(1.5 / REPAIR_TICKS);
    expect(ticketOnTile(state, COL.pipeline, 1)).toBeUndefined();
  });

  it.each([false, true])(
    'does not apply collected work to a replacement ticket on the same station (pairing=%s)',
    (pairing) => {
      const state = createGame(
        levelWithMap(
          parseLevelMap(
            '##############\n#IKTCCXPSR#.B#\n#............#\n#1234........#\n##############',
          ),
        ),
        1,
        [1, 2, 3],
      );
      state.settings.pairing = pairing;
      state.nextOrderTick = Number.MAX_SAFE_INTEGER;
      const old = addTicket(state, COL.keyboard);
      const replacement = addTicket(state, COL.counter);
      old.domain = 'frontend';
      replacement.location = { kind: 'player', playerId: 3 };
      standAt(state, 1, COL.keyboard);
      const worker = getPlayer(state, 1);
      const picker = getPlayer(state, 2);
      const carrier = getPlayer(state, 3);
      if (!worker || !picker || !carrier) throw new Error('Missing test player');
      worker.roleId = 'frontend';
      picker.pos = { x: 3, y: 2 };
      picker.facing = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
      carrier.pos = { x: 1, y: 2 };
      carrier.facing = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
      tick(state, [
        input(state, 1, { work: true }),
        input(state, 2, { interact: true }),
        input(state, 3, { interact: true, work: true }),
      ]);
      expect(old.location).toEqual({ kind: 'player', playerId: 2 });
      expect(progress(old, 'code')).toBe(WORK_RATE * 2);
      expect(replacement.location).toEqual({ kind: 'tile', x: COL.keyboard, y: 1 });
      expect(progress(replacement, 'code')).toBe(0);
    },
  );
});
