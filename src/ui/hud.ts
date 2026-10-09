import type { Tile } from '../sim/level';

export const VERSION = 'v0';

export interface HoverInfo {
  x: number;
  y: number;
  tile: Tile;
}

export interface Hud {
  /** Shows the hovered tile, or hides the readout for `null`. */
  setHover: (info: HoverInfo | null) => void;
}

export function mountHud(root: HTMLElement): Hud {
  const version = document.createElement('div');
  version.className = 'hud-version';
  version.textContent = VERSION;

  const hover = document.createElement('div');
  hover.className = 'hud-hover';
  hover.hidden = true;

  root.append(version, hover);

  return {
    setHover: (info) => {
      hover.hidden = info === null;
      hover.textContent = info ? `${info.x}, ${info.y}, ${info.tile}` : '';
    },
  };
}
