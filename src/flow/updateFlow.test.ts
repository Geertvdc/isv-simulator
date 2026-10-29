import { describe, expect, it } from 'vitest';
import { DEMO_IDLE_MS, DEMO_KIOSK_IDLE_MS, DEMO_RESULTS_MS } from '../sim/balance';
import { finishDemoRound, createFlow, isRoundRunning } from './flow';
import { updateFlow } from './updateFlow';
import { atLevelSelect, confirm, ctx, playing, press } from './flowTesting';
import { createSave } from './save';

describe('demo', () => {
  const demo = (kiosk = false) => ({ kiosk, levels: [2, 0] });

  it('starts on the title after a while without a button press, with nobody joined', () => {
    const flow = createFlow();
    updateFlow(flow, confirm(), ctx({ demo: demo(), nowMs: 1000 }));
    expect(
      updateFlow(flow, [], ctx({ demo: demo(), nowMs: 1000 + DEMO_IDLE_MS - 1 })).changed,
    ).toBe(false);
    const update = updateFlow(flow, [], ctx({ demo: demo(), nowMs: 1000 + DEMO_IDLE_MS }));
    expect(update.effects).toEqual([{ type: 'startLevel', levelIndex: 2 }]);
    expect(flow).toMatchObject({ screen: 'demo', levelIndex: 2, demoRounds: 1, demoEnd: null });
    expect(flow.lobby.players).toEqual([]);
    expect(isRoundRunning(flow)).toBe(true);
  });

  it('never starts without demo options (an online room)', () => {
    const flow = createFlow();
    updateFlow(flow, [], ctx({ nowMs: DEMO_IDLE_MS * 10 }));
    expect(flow.screen).toBe('title');
  });

  it('only leaves other menus for the demo in a kiosk', () => {
    const c = ctx({ demo: demo() });
    const flow = atLevelSelect(c);
    updateFlow(flow, [], { ...c, nowMs: DEMO_KIOSK_IDLE_MS * 2 });
    expect(flow.screen).toBe('levelSelect');
    updateFlow(flow, [], { ...c, demo: demo(true), nowMs: DEMO_KIOSK_IDLE_MS - 1 });
    expect(flow.screen).toBe('levelSelect');
    updateFlow(flow, [], { ...c, demo: demo(true), nowMs: DEMO_KIOSK_IDLE_MS });
    expect(flow.screen).toBe('demo');
  });

  it('does not interrupt a round being played, even in a kiosk', () => {
    const c = ctx({ demo: demo(true) });
    const flow = playing(c);
    updateFlow(flow, [], { ...c, nowMs: DEMO_KIOSK_IDLE_MS * 10 });
    expect(flow.screen).toBe('playing');
  });

  it('shows the score when a round ends, then plays the next demo level, in turn', () => {
    const flow = createFlow();
    const c = (nowMs: number) => ctx({ demo: demo(), nowMs });
    updateFlow(flow, [], c(DEMO_IDLE_MS));
    expect(finishDemoRound(flow, { score: 420, stars: 2 }, 5000).changed).toBe(true);
    expect(flow.demoEnd).toEqual({ score: 420, stars: 2, atMs: 5000 });
    expect(isRoundRunning(flow)).toBe(false);
    expect(updateFlow(flow, [], c(5000 + DEMO_RESULTS_MS - 1)).changed).toBe(false);
    expect(updateFlow(flow, [], c(5000 + DEMO_RESULTS_MS)).effects).toEqual([
      { type: 'startLevel', levelIndex: 0 },
    ]);
    expect(flow).toMatchObject({ screen: 'demo', levelIndex: 0, demoEnd: null });
    finishDemoRound(flow, { score: 1, stars: 0 }, 0);
    expect(updateFlow(flow, [], c(DEMO_RESULTS_MS)).effects).toEqual([
      { type: 'startLevel', levelIndex: 2 },
    ]);
  });

  it('ends on any button: the title with its menu up, the round dropped, nothing saved', () => {
    const c = ctx({ demo: demo(), nowMs: DEMO_IDLE_MS });
    const flow = createFlow();
    updateFlow(flow, [], c);
    finishDemoRound(flow, { score: 999, stars: 3 }, DEMO_IDLE_MS);
    const update = updateFlow(flow, [press('kb-left', { nav: { x: 1, y: 0 } })], c);
    expect(update.effects).toEqual([{ type: 'stopRound' }]);
    expect(flow).toMatchObject({ screen: 'title', awake: true, menuIndex: 0, demoEnd: null });
    expect(c.save.levels).toEqual(createSave().levels);
    // The idle clock starts over from that press.
    updateFlow(flow, [], { ...c, nowMs: DEMO_IDLE_MS * 2 - 1 });
    expect(flow.screen).toBe('title');
  });
});
