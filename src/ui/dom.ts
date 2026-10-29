/** A new element with a class and optional text. */
export function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/**
 * The event listeners (and other clean-up) of one screen, undone together by
 * `dispose`. Screens add their handlers through `listen` instead of calling
 * `addEventListener` themselves, so nothing is left behind when they go.
 */
export interface Scope {
  /** Adds `handler` for `type` events on `target` until the scope is disposed. */
  listen: Listen;
  /** Runs `dispose` when the scope is disposed. */
  add: (dispose: () => void) => void;
  /** Runs every clean-up, newest first. Later calls do nothing. */
  dispose: () => void;
}

interface Listen {
  <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ): void;
  (target: EventTarget, type: string, handler: (event: Event) => void): void;
}

export function createScope(): Scope {
  let disposers: (() => void)[] = [];
  return {
    listen: (target: EventTarget, type: string, handler: (event: Event) => void): void => {
      target.addEventListener(type, handler);
      disposers.push(() => {
        target.removeEventListener(type, handler);
      });
    },
    add: (dispose) => {
      disposers.push(dispose);
    },
    dispose: () => {
      const pending = disposers;
      disposers = [];
      for (let i = pending.length - 1; i >= 0; i--) pending[i]?.();
    },
  };
}

/** A screen on the page that can be taken off again. */
export interface Mounted {
  /** Removes the screen's nodes and all its listeners. */
  unmount: () => void;
}

/**
 * Puts `nodes` (a screen and any overlays) in `parent` and answers the scope
 * for their listeners. `unmount` removes the nodes and disposes the scope.
 */
export function mountScreen(
  parent: HTMLElement,
  ...nodes: HTMLElement[]
): Mounted & { scope: Scope } {
  const scope = createScope();
  parent.append(...nodes);
  return {
    scope,
    unmount: () => {
      scope.dispose();
      for (const node of nodes) node.remove();
    },
  };
}

/** A button with `profile-button` (plus `className`) styling that runs `onClick`. */
export function button(
  scope: Scope,
  text: string,
  onClick: () => void,
  className = '',
): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className ? `profile-button ${className}` : 'profile-button';
  node.textContent = text;
  scope.listen(node, 'click', onClick);
  return node;
}

/**
 * Keeps Enter and Space on a focused button from also reaching the game,
 * where they are game keys (keydown and keyup both).
 */
export function keepActivationKeys(scope: Scope, node: HTMLElement): void {
  for (const type of ['keydown', 'keyup'] as const) {
    scope.listen(node, type, (event) => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    });
  }
}
