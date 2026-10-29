import { describe, expect, it } from 'vitest';
import { type Flow, onlineEnded, createFlow, menuItems } from './flow';
import {
  cancelJoinCode,
  editJoinCode,
  joinFailed,
  joinSucceeded,
  submitJoinCode,
} from './joinFlow';
import { updateFlow } from './updateFlow';
import { back, confirm, ctx, down, left, menu, pick, press, right } from './flowTesting';

describe('online: hosting and joining', () => {
  function title(c = ctx()): Flow {
    const flow = createFlow();
    updateFlow(flow, confirm(), c);
    return flow;
  }

  function joinScreen(c = ctx()): Flow {
    const flow = title(c);
    pick(flow, 'joinOnline', c);
    expect(flow.screen).toBe('joinCode');
    return flow;
  }

  it('Host online hands the screens to the online session', () => {
    const c = ctx();
    const flow = title(c);
    expect(pick(flow, 'hostOnline', c).effects).toEqual([{ type: 'hostOnline' }]);
    expect(flow.screen).toBe('online');
    // The local flow waits: presses do nothing until the session ends.
    expect(updateFlow(flow, [...confirm(), ...back(), ...menu()], c)).toEqual({
      changed: false,
      effects: [],
    });
    onlineEnded(flow);
    expect(flow).toMatchObject({ screen: 'title', awake: true });
    expect(menuItems(flow)[flow.menuIndex]).toBe('hostOnline');
  });

  it('takes typed codes in any case, keeping code letters only', () => {
    const flow = joinScreen();
    expect(editJoinCode(flow, 'ab')).toBe(true);
    expect(flow.joinCode).toMatchObject({ text: 'AB', cursor: 2, error: null });
    // I and O aren't code letters; spaces, dashes and digits go too; at most 4.
    editJoinCode(flow, ' x-io1yzwv ');
    expect(flow.joinCode).toMatchObject({ text: 'XYZW', cursor: 3 });
    expect(editJoinCode(flow, 'xyzw')).toBe(false);
  });

  it('says a short code is not a code, and joins with a whole one', () => {
    const flow = joinScreen();
    editJoinCode(flow, 'abc');
    expect(submitJoinCode(flow).effects).toEqual([]);
    expect(flow.joinCode.error).toBe('badCode');
    editJoinCode(flow, 'abcd');
    expect(flow.joinCode.error).toBe(null);
    expect(submitJoinCode(flow).effects).toEqual([{ type: 'joinOnline', code: 'ABCD' }]);
    expect(flow.joinCode.busy).toBe(true);
    // While the join is out, typing and joining again do nothing.
    expect(editJoinCode(flow, 'zz')).toBe(false);
    expect(submitJoinCode(flow).effects).toEqual([]);
  });

  it('shows why a join failed and lets them try again', () => {
    const flow = joinScreen();
    editJoinCode(flow, 'abcd');
    submitJoinCode(flow);
    joinFailed(flow, 'wrongCode');
    expect(flow.joinCode).toMatchObject({ busy: false, error: 'wrongCode', text: 'ABCD' });
    expect(submitJoinCode(flow).effects).toEqual([{ type: 'joinOnline', code: 'ABCD' }]);
    joinSucceeded(flow);
    expect(flow.screen).toBe('online');
    onlineEnded(flow, 'joinOnline');
    expect(menuItems(flow)[flow.menuIndex]).toBe('joinOnline');
  });

  it('turns letters with a gamepad: up and down change, left and right move', () => {
    const c = ctx();
    const flow = joinScreen(c);
    updateFlow(flow, down(), c);
    expect(flow.joinCode.text).toBe('A');
    updateFlow(flow, down(), c);
    expect(flow.joinCode.text).toBe('B');
    updateFlow(flow, [press('pad-0', { nav: { x: 0, y: -1 } })], c);
    updateFlow(flow, [press('pad-0', { nav: { x: 0, y: -1 } })], c);
    // Wraps around the alphabet.
    expect(flow.joinCode.text).toBe('Z');
    // The cursor can't skip past the end of what's there.
    updateFlow(flow, right(), c);
    updateFlow(flow, right(), c);
    expect(flow.joinCode.cursor).toBe(1);
    for (let i = 0; i < 3; i++) {
      updateFlow(flow, down(), c);
      updateFlow(flow, right(), c);
    }
    expect(flow.joinCode).toMatchObject({ text: 'ZAAA', cursor: 3 });
    updateFlow(flow, left(), c);
    updateFlow(flow, down(), c);
    expect(flow.joinCode.text).toBe('ZABA');
    expect(updateFlow(flow, confirm(), c).effects).toEqual([{ type: 'joinOnline', code: 'ZABA' }]);
  });

  it('goes back to the title, dropping a join that is out', () => {
    const c = ctx();
    const flow = joinScreen(c);
    expect(updateFlow(flow, back(), c).effects).toEqual([]);
    expect(flow.screen).toBe('title');
    expect(menuItems(flow)[flow.menuIndex]).toBe('joinOnline');
    pick(flow, 'joinOnline', c);
    editJoinCode(flow, 'abcd');
    submitJoinCode(flow);
    expect(updateFlow(flow, menu(), c).effects).toEqual([{ type: 'cancelJoin' }]);
    pick(flow, 'joinOnline', c);
    // A fresh screen every time.
    expect(flow.joinCode).toEqual({ text: '', cursor: 0, error: null, busy: false });
    editJoinCode(flow, 'abcd');
    submitJoinCode(flow);
    expect(cancelJoinCode(flow).effects).toEqual([{ type: 'cancelJoin' }]);
    expect(flow.screen).toBe('title');
  });
});
