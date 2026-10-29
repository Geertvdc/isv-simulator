import { afterEach, describe, expect, it, vi } from 'vitest';
import { button, createScope, keepActivationKeys, mountScreen } from './dom';

/** Tests run without a DOM: a bare EventTarget stands in for an element. */
function fakeElement(remove = vi.fn()): HTMLElement {
  return Object.assign(new EventTarget(), { remove }) as unknown as HTMLElement;
}

function keyEvent(type: string, key: string): Event {
  return Object.assign(new Event(type), { key });
}

describe('createScope', () => {
  it('listens until disposed', () => {
    const scope = createScope();
    const target = new EventTarget();
    const handler = vi.fn();
    scope.listen(target, 'ping', handler);
    target.dispatchEvent(new Event('ping'));
    expect(handler).toHaveBeenCalledTimes(1);
    scope.dispose();
    target.dispatchEvent(new Event('ping'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps listeners in the order they were added', () => {
    const scope = createScope();
    const target = new EventTarget();
    const calls: string[] = [];
    scope.listen(target, 'ping', () => calls.push('first'));
    scope.listen(target, 'ping', () => calls.push('second'));
    target.dispatchEvent(new Event('ping'));
    expect(calls).toEqual(['first', 'second']);
  });

  it('runs clean-ups newest first, once', () => {
    const scope = createScope();
    const calls: number[] = [];
    scope.add(() => calls.push(1));
    scope.add(() => calls.push(2));
    scope.dispose();
    scope.dispose();
    expect(calls).toEqual([2, 1]);
  });

  it('can be used again after disposing', () => {
    const scope = createScope();
    const target = new EventTarget();
    scope.dispose();
    const handler = vi.fn();
    scope.listen(target, 'ping', handler);
    target.dispatchEvent(new Event('ping'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('mountScreen', () => {
  it('appends the nodes, and unmount removes them and their listeners', () => {
    const append = vi.fn();
    const removeScreen = vi.fn();
    const removeOverlay = vi.fn();
    const screen = fakeElement(removeScreen);
    const overlay = fakeElement(removeOverlay);
    const mounted = mountScreen({ append } as unknown as HTMLElement, screen, overlay);
    expect(append).toHaveBeenCalledWith(screen, overlay);
    const handler = vi.fn();
    mounted.scope.listen(screen, 'ping', handler);
    mounted.unmount();
    screen.dispatchEvent(new Event('ping'));
    expect(handler).not.toHaveBeenCalled();
    expect(removeScreen).toHaveBeenCalledTimes(1);
    expect(removeOverlay).toHaveBeenCalledTimes(1);
  });
});

describe('button', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a styled button that clicks until its scope is disposed', () => {
    vi.stubGlobal('document', { createElement: () => fakeElement() });
    const scope = createScope();
    const onClick = vi.fn();
    const plain = button(scope, 'OK', onClick);
    const extra = button(scope, 'Copy', onClick, 'online-copy');
    expect(plain.type).toBe('button');
    expect(plain.textContent).toBe('OK');
    expect(plain.className).toBe('profile-button');
    expect(extra.className).toBe('profile-button online-copy');
    plain.dispatchEvent(new Event('click'));
    expect(onClick).toHaveBeenCalledTimes(1);
    scope.dispose();
    plain.dispatchEvent(new Event('click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('keepActivationKeys', () => {
  it('stops Enter and Space, on keydown and keyup, and nothing else', () => {
    const scope = createScope();
    const node = fakeElement();
    keepActivationKeys(scope, node);
    const stopped = (type: string, key: string): boolean => {
      const event = keyEvent(type, key);
      const stop = vi.spyOn(event, 'stopPropagation');
      node.dispatchEvent(event);
      return stop.mock.calls.length > 0;
    };
    expect(stopped('keydown', 'Enter')).toBe(true);
    expect(stopped('keyup', ' ')).toBe(true);
    expect(stopped('keydown', 'e')).toBe(false);
    scope.dispose();
    expect(stopped('keydown', 'Enter')).toBe(false);
  });
});
