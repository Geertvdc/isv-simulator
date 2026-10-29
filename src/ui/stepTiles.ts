/** Step tiles in the DOM: the HUD order cards and the intro recipes. */

import { STEP_NAMES, STEP_STATE_NAMES } from '../sim/content';
import type { StepKind, TicketKind } from '../sim/tickets';
import {
  GLYPHS,
  GLYPH_SIZE,
  GLYPH_STROKE,
  type GlyphId,
  type StepTile,
  cssHex,
  recipeStepTiles,
  stepColor,
} from '../render/stepLook';
import { el } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A glyph from `../render/stepLook` as an inline SVG in the current text color. */
export function glyphSvg(id: GlyphId, className = 'glyph'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', `0 0 ${GLYPH_SIZE} ${GLYPH_SIZE}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(GLYPH_STROKE));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('fill', 'none');
  for (const shape of GLYPHS[id]) {
    let node: SVGElement;
    if (shape.type === 'rect') {
      node = document.createElementNS(SVG_NS, 'rect');
      node.setAttribute('x', String(shape.x));
      node.setAttribute('y', String(shape.y));
      node.setAttribute('width', String(shape.w));
      node.setAttribute('height', String(shape.h));
      node.setAttribute('rx', '1.5');
    } else if (shape.type === 'circle') {
      node = document.createElementNS(SVG_NS, 'circle');
      node.setAttribute('cx', String(shape.cx));
      node.setAttribute('cy', String(shape.cy));
      node.setAttribute('r', String(shape.r));
    } else {
      node = document.createElementNS(SVG_NS, shape.type === 'poly' ? 'polygon' : 'polyline');
      node.setAttribute('points', shape.points.join(' '));
    }
    if (shape.type !== 'line' && shape.fill) node.setAttribute('fill', 'currentColor');
    svg.append(node);
  }
  return svg;
}

/** A glyph's shapes as SVG markup, for pictures built as strings. */
export function glyphMarkup(id: GlyphId): string {
  return GLYPHS[id]
    .map((shape) => {
      const fill = shape.type !== 'line' && shape.fill ? ' fill="currentColor"' : '';
      if (shape.type === 'rect')
        return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="1.5"${fill}/>`;
      if (shape.type === 'circle')
        return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"${fill}/>`;
      const tag = shape.type === 'poly' ? 'polygon' : 'polyline';
      return `<${tag} points="${shape.points.join(' ')}"${fill}/>`;
    })
    .join('');
}

/** One step tile; `update` sets its live state. */
export interface StepTileView {
  node: HTMLElement;
  update: (tile: StepTile) => void;
}

/**
 * A tile with the step's station glyph in the station's color, a corner mark
 * for passed (check) and skipped (a bug: it may come back), and a fill bar
 * while running. Full-stack code tiles carry an FE / BE mark.
 */
export function stepTileView(kind: StepKind, part: TicketKind | null): StepTileView {
  const node = el('span', part ? `step-tile step-part step-part-${part}` : 'step-tile');
  node.style.setProperty('--step-color', cssHex(stepColor(kind)));
  const fill = el('span', 'step-fill');
  const check = glyphSvg('check', 'step-mark step-mark-done');
  const bug = glyphSvg('bug', 'step-mark step-mark-skipped');
  node.append(glyphSvg(kind), fill, check, bug);
  let drawn = '';
  return {
    node,
    update: (tile) => {
      const running = tile.state === 'current' && tile.progress > 0;
      const key = `${tile.state}|${running ? tile.progress.toFixed(2) : ''}`;
      if (key === drawn) return;
      drawn = key;
      node.dataset.state = tile.state;
      node.classList.toggle('running', running);
      fill.style.width = running ? `${(tile.progress * 100).toFixed(0)}%` : '0';
      node.title = `${STEP_NAMES[kind]}: ${STEP_STATE_NAMES[tile.state]}`;
    },
  };
}

/** A row of step tiles. */
export function stepRow(tiles: readonly StepTile[]): { row: HTMLElement; views: StepTileView[] } {
  const row = el('div', 'step-row');
  const views = tiles.map((t) => {
    const view = stepTileView(t.kind, t.part);
    view.update(t);
    row.append(view.node);
    return view;
  });
  return { row, views };
}

/** A recipe's steps as tiles in full color, like on the order cards. */
export function stepChips(steps: readonly StepKind[], kind?: TicketKind): HTMLElement {
  const { row } = stepRow(recipeStepTiles(steps, kind));
  row.classList.add('step-row-recipe');
  return row;
}
