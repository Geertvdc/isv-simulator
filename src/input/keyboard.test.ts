import { describe, expect, it } from 'vitest';
import { KeyboardController, KeyboardState, LEFT_KEYS, RIGHT_KEYS, readKeyboard } from './keyboard';

function held(...codes: string[]): KeyboardState {
  const keys = new KeyboardState();
  for (const c of codes) keys.press(c);
  return keys;
}

describe('readKeyboard', () => {
  it.each([
    [LEFT_KEYS, 'KeyW', { x: 0, y: -1 }],
    [LEFT_KEYS, 'KeyS', { x: 0, y: 1 }],
    [LEFT_KEYS, 'KeyA', { x: -1, y: 0 }],
    [LEFT_KEYS, 'KeyD', { x: 1, y: 0 }],
    [RIGHT_KEYS, 'ArrowUp', { x: 0, y: -1 }],
    [RIGHT_KEYS, 'ArrowDown', { x: 0, y: 1 }],
    [RIGHT_KEYS, 'ArrowLeft', { x: -1, y: 0 }],
    [RIGHT_KEYS, 'ArrowRight', { x: 1, y: 0 }],
  ])('%#: %s moves screen-relative', (scheme, code, move) => {
    expect(readKeyboard(held(code), scheme).move).toEqual(move);
  });

  it('combines keys into diagonals and cancels opposites', () => {
    expect(readKeyboard(held('KeyW', 'KeyD'), LEFT_KEYS).move).toEqual({ x: 1, y: -1 });
    expect(readKeyboard(held('KeyA', 'KeyD'), LEFT_KEYS).move).toEqual({ x: 0, y: 0 });
  });

  it.each([
    [LEFT_KEYS, 'KeyE', 'KeyQ'],
    [RIGHT_KEYS, 'ShiftRight', 'Slash'],
  ])('%#: maps interact and work', (scheme, interact, work) => {
    expect(readKeyboard(held(interact), scheme)).toMatchObject({ interact: true, work: false });
    expect(readKeyboard(held(work), scheme)).toMatchObject({ interact: false, work: true });
  });

  it('keeps the two schemes apart', () => {
    const keys = held('KeyW', 'KeyE', 'KeyQ');
    expect(readKeyboard(keys, RIGHT_KEYS)).toEqual({
      move: { x: 0, y: 0 },
      interact: false,
      work: false,
      join: false,
    });
    const arrows = held('ArrowLeft', 'ShiftRight', 'Slash');
    expect(readKeyboard(arrows, LEFT_KEYS)).toEqual({
      move: { x: 0, y: 0 },
      interact: false,
      work: false,
      join: false,
    });
  });

  it('ignores the left Shift and Ctrl for the right scheme', () => {
    const state = readKeyboard(held('ShiftLeft', 'ControlLeft'), RIGHT_KEYS);
    expect(state).toMatchObject({ interact: false, work: false });
  });

  it('reports Enter as join for both schemes', () => {
    expect(readKeyboard(held('Enter'), LEFT_KEYS).join).toBe(true);
    expect(readKeyboard(held('NumpadEnter'), RIGHT_KEYS).join).toBe(true);
  });

  it('forgets released keys and everything on clear', () => {
    const keys = held('KeyW', 'KeyD');
    keys.release('KeyW');
    expect(readKeyboard(keys, LEFT_KEYS).move).toEqual({ x: 1, y: 0 });
    keys.clear();
    expect(readKeyboard(keys, LEFT_KEYS).move).toEqual({ x: 0, y: 0 });
  });
});

describe('KeyboardController', () => {
  it('reads its own scheme from shared key state', () => {
    const keys = held('ArrowUp');
    const left = new KeyboardController(keys, LEFT_KEYS);
    const right = new KeyboardController(keys, RIGHT_KEYS);
    expect(left.deviceId).toBe('kb-left');
    expect(right.deviceId).toBe('kb-right');
    expect(left.joinGroup).toBe(right.joinGroup);
    expect(left.read().move).toEqual({ x: 0, y: 0 });
    expect(right.read().move).toEqual({ x: 0, y: -1 });
  });
});
