import { playerCssColor, playerShape, shapePoints } from '../render/playerColors';
import type { PlayerId } from '../sim/state';

const OUTLINE = '#1a1d24';
const SIZE = 20;

/** Player `id`'s hat shape on their color, as a small inline SVG, for the menus and HUD. */
export function playerBadge(id: PlayerId): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`);
  svg.setAttribute('class', 'player-badge');
  svg.setAttribute('aria-hidden', 'true');
  const ns = 'http://www.w3.org/2000/svg';
  const back = document.createElementNS(ns, 'circle');
  back.setAttribute('r', String(SIZE / 2 - 1));
  back.setAttribute('fill', playerCssColor(id));
  back.setAttribute('stroke', OUTLINE);
  back.setAttribute('stroke-width', '1.5');
  svg.append(back);
  const shape = playerShape(id);
  const hat =
    shape === 'circle'
      ? document.createElementNS(ns, 'circle')
      : document.createElementNS(ns, 'polygon');
  if (shape === 'circle') hat.setAttribute('r', String(SIZE * 0.22));
  else {
    const points = shapePoints(shape, SIZE * 0.5);
    hat.setAttribute('points', points.map((p) => `${p.x},${p.y}`).join(' '));
  }
  hat.setAttribute('fill', '#fdfdf6');
  hat.setAttribute('stroke', OUTLINE);
  hat.setAttribute('stroke-width', '1.5');
  svg.append(hat);
  return svg;
}
