/**
 * The little pictures on the intro cards, drawn as inline SVG from simple
 * shapes in the game's colors (placeholders until the art pass).
 */

import { tileColor } from '../render/mapLook';
import { playerCssColor } from '../render/playerColors';
import { GLYPH_SIZE, GLYPH_STROKE, type GlyphId } from '../render/stepLook';
import type { IntroPicture } from '../sim/content';
import { glyphMarkup } from './stepTiles';

const OUTLINE = '#1a1d24';
/** The step tiles' background, `--window-bar`. */
const TILE_FILL = '#222a3f';
const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** A developer: a capsule with its feet at (x, y). */
function dev(x: number, y: number, color: string): string {
  return `<rect x="${x - 9}" y="${y - 30}" width="18" height="30" rx="9" fill="${color}" stroke="${OUTLINE}" stroke-width="2"/>`;
}

/** A plain block: a counter, no station. */
function block(x: number, y: number, tile: Parameters<typeof tileColor>[0]): string {
  return `<rect x="${x - 14}" y="${y - 14}" width="28" height="28" rx="4" fill="${css(tileColor(tile))}" stroke="${OUTLINE}" stroke-width="2"/>`;
}

/** A station as the step tile on the order cards: its glyph in its color on a dark tile. */
function station(
  x: number,
  y: number,
  tile: Parameters<typeof tileColor>[0],
  glyph: GlyphId,
): string {
  const color = css(tileColor(tile));
  const g = 20;
  return (
    `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="5" fill="${TILE_FILL}" stroke="${color}" stroke-width="2"/>` +
    `<g transform="translate(${x - g / 2} ${y - g / 2}) scale(${g / GLYPH_SIZE})" color="${color}" fill="none" stroke="currentColor" stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round">${glyphMarkup(glyph)}</g>`
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
      station(20, 45, 'inbox', 'inbox'),
      arrow(36, 54, 45),
      station(70, 45, 'keyboard', 'code'),
      arrow(86, 104, 45),
      station(120, 45, 'testBench', 'test'),
      arrow(136, 154, 45),
      station(170, 45, 'pipeline', 'pipeline'),
      arrow(186, 204, 45),
      station(220, 45, 'ship', 'ship'),
    ].join(''),
  // One developer throws a ticket over a counter wall to another.
  throw: () =>
    [
      dev(40, 75, playerCssColor(1)),
      block(120, 61, 'counter'),
      dev(200, 75, playerCssColor(2)),
      `<path d="M 52 40 Q 120 -10 188 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="6 5"/>`,
      ticket(120, 16),
    ].join(''),
  // Two developers on one review station.
  review: () =>
    [
      dev(80, 80, playerCssColor(1)),
      station(120, 45, 'review', 'review'),
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
  // A ticket thrown across a gap in the floor.
  atrium: () =>
    [
      `<rect x="0" y="66" width="88" height="24" fill="#c9b79c" stroke="${OUTLINE}" stroke-width="2"/>`,
      `<rect x="152" y="66" width="88" height="24" fill="#c9b79c" stroke="${OUTLINE}" stroke-width="2"/>`,
      `<rect x="88" y="66" width="64" height="24" fill="#20242c"/>`,
      dev(50, 70, playerCssColor(1)),
      dev(190, 70, playerCssColor(2)),
      `<path d="M 62 40 Q 120 -6 178 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="6 5"/>`,
      ticket(120, 18),
    ].join(''),
  // Whiteboard first, then the keyboard codes it faster.
  design: () =>
    [
      station(40, 45, 'whiteboard', 'design'),
      arrow(60, 96, 45),
      station(120, 45, 'keyboard', 'code'),
      `<text x="120" y="22" text-anchor="middle" font-size="12" font-weight="800" fill="currentColor">faster</text>`,
      arrow(140, 176, 45),
      ticket(200, 45),
    ].join(''),
  // A front end and a back end meet at the merge station.
  merge: () =>
    [
      ticket(30, 45, '#7ab8f0'),
      arrow(44, 100, 45),
      station(120, 45, 'merge', 'merge'),
      arrow(196, 140, 45),
      ticket(210, 45, '#6cbf7a'),
      `<text x="30" y="76" text-anchor="middle" font-size="11" font-weight="800" fill="currentColor">FE</text>`,
      `<text x="210" y="76" text-anchor="middle" font-size="11" font-weight="800" fill="currentColor">BE</text>`,
    ].join(''),
  // A belt carrying tickets round to the counter at its end.
  carousel: () =>
    [
      `<rect x="20" y="36" width="160" height="18" rx="9" fill="${css(tileColor('conveyor'))}" stroke="${OUTLINE}" stroke-width="2"/>`,
      `<path d="M 60 45 l 6 -5 v 10 Z M 100 45 l 6 -5 v 10 Z M 140 45 l 6 -5 v 10 Z" transform="rotate(180 103 45)" fill="${OUTLINE}" opacity="0.5"/>`,
      ticket(50, 34),
      ticket(120, 34),
      block(210, 45, 'counter'),
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
