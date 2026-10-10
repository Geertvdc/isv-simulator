/**
 * The little pictures on the intro cards, drawn as inline SVG from simple
 * shapes in the game's colors (placeholders until the art pass).
 */

import { tileColor } from '../render/MapRenderer';
import { playerCssColor } from '../render/playerColors';
import type { IntroPicture } from '../sim/content';

const OUTLINE = '#1a1d24';
const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** A developer: a capsule with its feet at (x, y). */
function dev(x: number, y: number, color: string): string {
  return `<rect x="${x - 9}" y="${y - 30}" width="18" height="30" rx="9" fill="${color}" stroke="${OUTLINE}" stroke-width="2"/>`;
}

/** A station block with its letter. */
function block(
  x: number,
  y: number,
  tile: Parameters<typeof tileColor>[0],
  letter: string,
): string {
  return (
    `<rect x="${x - 14}" y="${y - 14}" width="28" height="28" rx="4" fill="${css(tileColor(tile))}" stroke="${OUTLINE}" stroke-width="2"/>` +
    `<text x="${x}" y="${y + 6}" text-anchor="middle" font-size="16" font-weight="800" fill="${OUTLINE}">${letter}</text>`
  );
}

/** A ticket: a small card. */
function ticket(x: number, y: number, color = '#fdfdf6'): string {
  return `<rect x="${x - 8}" y="${y - 10}" width="16" height="20" rx="2" fill="${color}" stroke="${OUTLINE}" stroke-width="2"/><line x1="${x - 4}" y1="${y - 3}" x2="${x + 4}" y2="${y - 3}" stroke="${OUTLINE}" stroke-width="1.5"/><line x1="${x - 4}" y1="${y + 2}" x2="${x + 4}" y2="${y + 2}" stroke="${OUTLINE}" stroke-width="1.5"/>`;
}

function arrow(x1: number, x2: number, y: number): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2 - 4}" y2="${y}" stroke="currentColor" stroke-width="3"/><polygon points="${x2},${y} ${x2 - 7},${y - 5} ${x2 - 7},${y + 5}" fill="currentColor"/>`;
}

const PICTURES: Readonly<Record<IntroPicture, () => string>> = {
  // Inbox → keyboard → test bench → pipeline → ship.
  basics: () =>
    [
      block(20, 45, 'inbox', 'I'),
      arrow(36, 54, 45),
      block(70, 45, 'keyboard', 'K'),
      arrow(86, 104, 45),
      block(120, 45, 'testBench', 'T'),
      arrow(136, 154, 45),
      block(170, 45, 'pipeline', 'P'),
      arrow(186, 204, 45),
      block(220, 45, 'ship', 'S'),
    ].join(''),
  // One developer throws a ticket over a counter wall to another.
  throw: () =>
    [
      dev(40, 75, playerCssColor(1)),
      block(120, 61, 'counter', ''),
      dev(200, 75, playerCssColor(2)),
      `<path d="M 52 40 Q 120 -10 188 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="6 5"/>`,
      ticket(120, 16),
    ].join(''),
  // Two developers on one review station.
  review: () =>
    [
      dev(80, 80, playerCssColor(1)),
      block(120, 45, 'review', 'R'),
      dev(160, 80, playerCssColor(2)),
    ].join(''),
  // A red hotfix ticket and an alarm.
  incident: () =>
    [
      ticket(120, 50, '#ff5252'),
      `<text x="120" y="24" text-anchor="middle" font-size="22" font-weight="900" fill="#ff5252">!</text>`,
      `<path d="M 70 70 L 78 48 L 86 70 Z M 154 70 L 162 48 L 170 70 Z" fill="#ff9f43" stroke="${OUTLINE}" stroke-width="1.5"/>`,
    ].join(''),
  // A manager in a suit and tie walking into a developer.
  manager: () =>
    [
      dev(90, 80, '#5b6170'),
      `<polygon points="90,54 86,62 90,74 94,62" fill="#e53935" stroke="${OUTLINE}" stroke-width="1"/>`,
      `<rect x="104" y="14" width="96" height="24" rx="8" fill="#fdfdf6" stroke="${OUTLINE}" stroke-width="2"/>`,
      `<text x="152" y="31" text-anchor="middle" font-size="12" font-weight="700" fill="${OUTLINE}">Got a minute?</text>`,
      dev(150, 80, playerCssColor(3)),
    ].join(''),
  // A calendar invite and a developer heading to the meeting room.
  meeting: () =>
    [
      `<rect x="60" y="14" width="60" height="56" rx="6" fill="#fdfdf6" stroke="${OUTLINE}" stroke-width="2"/>`,
      `<rect x="60" y="14" width="60" height="16" rx="6" fill="#7e57c2" stroke="${OUTLINE}" stroke-width="2"/>`,
      `<text x="90" y="60" text-anchor="middle" font-size="22" font-weight="800" fill="${OUTLINE}">2</text>`,
      arrow(130, 160, 50),
      `<ellipse cx="190" cy="74" rx="26" ry="9" fill="#7e57c2" opacity="0.6"/>`,
      dev(190, 76, playerCssColor(4)),
    ].join(''),
};

/** The picture for an intro card, as an SVG element. */
export function introPicture(picture: IntroPicture): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 240 90');
  svg.setAttribute('class', 'intro-picture');
  svg.setAttribute('aria-hidden', 'true');
  // Built from our own constants only, never from user text.
  svg.innerHTML = PICTURES[picture]();
  return svg;
}
