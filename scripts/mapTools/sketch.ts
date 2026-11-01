/**
 * ASCII map to a clean top-down SVG sketch, for the level redesign doc
 * (phase 23). Lenient on purpose: drafts in progress render even when they
 * don't parse yet, unknown chars show as a magenta `?`.
 */

import { PLAYER_COLORS } from '../../src/render/playerColors';
import { FUTURE_CHARS, mapRows } from './mapChars';

/** Pixels per map tile in the sketch. */
export const SKETCH_TILE = 32;

const MARGIN = 24;
const PANEL_GAP = 48;
const TITLE_HEIGHT = 44;
const LEGEND_SWATCH = 20;
const LEGEND_ROW = 28;
const LEGEND_COLUMN = 200;
const FONT = 'font-family="Helvetica, Arial, sans-serif"';

const FLOOR = '#f3ede2';
const GRID = '#ddd4c4';
const WALL = '#545866';
const INK = '#26282e';

type Look =
  | { kind: 'floor' }
  | { kind: 'wall' }
  | { kind: 'block'; fill: string; text: string; ink: string }
  | { kind: 'void' }
  | { kind: 'gap' }
  | { kind: 'belt'; dx: number; dy: number }
  | { kind: 'spawn'; player: number }
  | { kind: 'manager' }
  | { kind: 'meeting' }
  | { kind: 'wet' }
  | { kind: 'spillZone' }
  | { kind: 'robotRoute' }
  | { kind: 'lift'; express?: boolean }
  | { kind: 'partition' }
  | { kind: 'unknown' };

interface CharInfo {
  look: Look;
  /** Legend text. */
  name: string;
}

const block = (fill: string, text: string, ink = '#ffffff'): Look => ({
  kind: 'block',
  fill,
  text,
  ink,
});

/** Every known map char and how the sketch draws it. */
const CHARS: Readonly<Record<string, CharInfo>> = {
  '.': { look: { kind: 'floor' }, name: 'floor' },
  '#': { look: { kind: 'wall' }, name: 'wall' },
  ' ': { look: { kind: 'void' }, name: 'void (outside)' },
  '~': { look: { kind: 'gap' }, name: 'gap (drop, throw over)' },
  C: { look: block('#bc8f5a', 'C'), name: 'counter' },
  I: { look: block('#7e57c2', 'I'), name: 'inbox' },
  B: { look: block('#e53935', 'B'), name: 'bug queue' },
  K: { look: block('#1e88e5', 'K'), name: 'keyboard' },
  T: { look: block('#43a047', 'T'), name: 'test bench' },
  R: { look: block('#fb8c00', 'R'), name: 'review' },
  P: { look: block('#00897b', 'P'), name: 'pipeline' },
  S: { look: block('#fdd835', 'S', INK), name: 'ship' },
  X: { look: block('#3a3a3a', 'X'), name: 'bin' },
  W: { look: block('#eceff1', 'W', INK), name: 'whiteboard' },
  G: { look: block('#d81b60', 'G'), name: 'merge' },
  '>': { look: { kind: 'belt', dx: 1, dy: 0 }, name: 'conveyor belt' },
  '<': { look: { kind: 'belt', dx: -1, dy: 0 }, name: 'conveyor belt' },
  v: { look: { kind: 'belt', dx: 0, dy: 1 }, name: 'conveyor belt' },
  '^': { look: { kind: 'belt', dx: 0, dy: -1 }, name: 'conveyor belt' },
  '1': { look: { kind: 'spawn', player: 1 }, name: 'player spawn' },
  '2': { look: { kind: 'spawn', player: 2 }, name: 'player spawn' },
  '3': { look: { kind: 'spawn', player: 3 }, name: 'player spawn' },
  '4': { look: { kind: 'spawn', player: 4 }, name: 'player spawn' },
  M: { look: { kind: 'manager' }, name: 'manager start' },
  m: { look: { kind: 'meeting' }, name: 'meeting room floor' },
  _: { look: { kind: 'wet' }, name: `${FUTURE_CHARS._?.name ?? 'wet floor'} *` },
  // Startup
  o: { look: block('#8d5a2b', 'o'), name: `${FUTURE_CHARS.o?.name ?? 'leaky tap'} *` },
  '%': { look: { kind: 'spillZone' }, name: `${FUTURE_CHARS['%']?.name ?? 'spill zone'} *` },
  r: { look: { kind: 'robotRoute' }, name: `${FUTURE_CHARS.r?.name ?? 'mop robot route'} *` },
  L: { look: { kind: 'lift' }, name: `${FUTURE_CHARS.L?.name ?? 'lift'} *` },
  '=': { look: { kind: 'partition' }, name: `${FUTURE_CHARS['=']?.name ?? 'partition'} *` },
  // Scale-Up
  l: {
    look: { kind: 'lift', express: true },
    name: `${FUTURE_CHARS.l?.name ?? 'express lift'} *`,
  },
  H: { look: block('#6d4c41', 'H'), name: `${FUTURE_CHARS.H?.name ?? 'mail chute'} *` },
};

/** Legend order: `CHARS` keys can't give it, digit keys come first in an object. */
const LEGEND_ORDER = '.# ~CIBKTRPSXWG><v^1234Mm_o%rL=lH'.split('');

const UNKNOWN: CharInfo = { look: { kind: 'unknown' }, name: 'unknown char' };

function charInfo(c: string): CharInfo {
  return CHARS[c] ?? UNKNOWN;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function rect(x: number, y: number, w: number, h: number, attrs: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`;
}

function label(x: number, y: number, size: number, text: string, attrs = ''): string {
  return (
    `<text x="${x}" y="${y}" font-size="${size}" ${FONT} text-anchor="middle" ` +
    `dominant-baseline="central" ${attrs}>${escapeXml(text)}</text>`
  );
}

/** One cell's SVG at (x, y) with size `t`. */
function cellSvg(look: Look, x: number, y: number, t: number): string {
  const floor = rect(x, y, t, t, `fill="${FLOOR}" stroke="${GRID}" stroke-width="1"`);
  const cx = x + t / 2;
  const cy = y + t / 2;
  const inset = Math.max(1, Math.round(t * 0.08));
  switch (look.kind) {
    case 'floor':
      return floor;
    case 'wall':
      return rect(x, y, t, t, `fill="${WALL}"`);
    case 'void':
      return '';
    case 'gap': {
      const hatch = [0.25, 0.5, 0.75]
        .map((f) => {
          const o = f * t;
          return `<line x1="${x + o}" y1="${y + t}" x2="${x + t}" y2="${y + o}" stroke="#4a6580" stroke-width="1.5"/><line x1="${x}" y1="${y + t - o}" x2="${x + t - o}" y2="${y}" stroke="#4a6580" stroke-width="1.5"/>`;
        })
        .join('');
      return rect(x, y, t, t, 'fill="#1b2a3a"') + hatch;
    }
    case 'block':
      return (
        floor +
        rect(
          x + inset,
          y + inset,
          t - 2 * inset,
          t - 2 * inset,
          `rx="${inset * 1.5}" fill="${look.fill}" stroke="${INK}" stroke-opacity="0.35"`,
        ) +
        label(cx, cy, t * 0.5, look.text, `font-weight="bold" fill="${look.ink}"`)
      );
    case 'belt': {
      const h = t * 0.28;
      // An arrow pointing right, rotated to the belt's direction.
      const angle = (Math.atan2(look.dy, look.dx) * 180) / Math.PI;
      const arrow = `<polygon points="${cx - h},${cy - h} ${cx + h},${cy} ${cx - h},${cy + h}" fill="#ffffff" transform="rotate(${angle} ${cx} ${cy})"/>`;
      return (
        floor + rect(x + inset, y + inset, t - 2 * inset, t - 2 * inset, 'fill="#37474f"') + arrow
      );
    }
    case 'spawn': {
      const color = hex(PLAYER_COLORS[look.player - 1] ?? 0xffffff);
      return (
        floor +
        `<circle cx="${cx}" cy="${cy}" r="${t * 0.36}" fill="${color}" stroke="${INK}" stroke-width="1.5"/>` +
        label(cx, cy, t * 0.46, String(look.player), `font-weight="bold" fill="${INK}"`)
      );
    }
    case 'manager':
      return (
        floor +
        rect(x + t * 0.2, y + t * 0.2, t * 0.6, t * 0.6, `rx="${t * 0.1}" fill="#263238"`) +
        label(cx, cy, t * 0.4, 'M', 'font-weight="bold" fill="#ffffff"')
      );
    case 'meeting':
      return (
        rect(x, y, t, t, `fill="#cfe3f5" stroke="${GRID}" stroke-width="1"`) +
        label(cx, cy, t * 0.36, 'm', 'fill="#5c7a99"')
      );
    case 'wet':
      return (
        rect(x, y, t, t, `fill="#64b5f6" stroke="#90caf9" stroke-width="1"`) +
        `<ellipse cx="${x + t * 0.38}" cy="${y + t * 0.32}" rx="${t * 0.22}" ry="${t * 0.09}" fill="#ffffff" fill-opacity="0.75" transform="rotate(-25 ${x + t * 0.38} ${y + t * 0.32})"/>` +
        `<ellipse cx="${x + t * 0.66}" cy="${y + t * 0.7}" rx="${t * 0.1}" ry="${t * 0.05}" fill="#ffffff" fill-opacity="0.6"/>`
      );
    case 'spillZone':
      return (
        rect(x, y, t, t, `fill="#d6ecfb" stroke="${GRID}" stroke-width="1"`) +
        rect(
          x + inset * 2,
          y + inset * 2,
          t - 4 * inset,
          t - 4 * inset,
          `rx="${t * 0.25}" fill="none" stroke="#42a5f5" stroke-width="1.5" stroke-dasharray="${t * 0.12} ${t * 0.08}"`,
        )
      );
    case 'robotRoute':
      return (
        floor +
        `<circle cx="${cx}" cy="${cy}" r="${t * 0.14}" fill="#78909c"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${t * 0.3}" fill="none" stroke="#78909c" stroke-width="1.5"/>`
      );
    case 'lift':
      return (
        floor +
        rect(
          x + inset,
          y + inset,
          t - 2 * inset,
          t - 2 * inset,
          `fill="${look.express ? '#ffca28' : '#cfd8dc'}" stroke="#263238" stroke-width="${Math.max(2, t * 0.09)}"`,
        ) +
        label(cx, cy, t * 0.5, look.express ? 'E' : 'L', 'font-weight="bold" fill="#263238"')
      );
    case 'partition':
      return (
        floor +
        rect(
          x + inset,
          y + inset,
          t - 2 * inset,
          t - 2 * inset,
          `fill="#9aa0ab" stroke="${WALL}" stroke-width="2" stroke-dasharray="${t * 0.15} ${t * 0.1}"`,
        )
      );
    case 'unknown':
      return rect(x, y, t, t, 'fill="#ff00ff"') + label(cx, cy, t * 0.5, '?', 'fill="#ffffff"');
  }
}

/** A char's look at legend size; the void, drawn as nothing on the map, gets a dashed outline. */
function legendSwatch(char: string): string {
  const look = charInfo(char).look;
  if (look.kind !== 'void') return cellSvg(look, 0, 0, LEGEND_SWATCH);
  return rect(
    0.5,
    0.5,
    LEGEND_SWATCH - 1,
    LEGEND_SWATCH - 1,
    'fill="none" stroke="#bdbdbd" stroke-dasharray="3 2"',
  );
}

export interface MapDrawing {
  svg: string;
  width: number;
  height: number;
  /** Every char used in the map. */
  chars: Set<string>;
}

/** Draws a map's tiles with its top-left corner at (0, 0). */
export function drawMap(text: string, tile = SKETCH_TILE): MapDrawing {
  const rows = mapRows(text);
  const columns = Math.max(0, ...rows.map((r) => r.length));
  const parts: string[] = [];
  const chars = new Set<string>();
  rows.forEach((row, y) => {
    for (let x = 0; x < columns; x++) {
      const c = row.charAt(x) || ' ';
      chars.add(c);
      parts.push(cellSvg(charInfo(c).look, x * tile, y * tile, tile));
    }
  });
  return { svg: parts.join(''), width: columns * tile, height: rows.length * tile, chars };
}

export interface SketchPanel {
  /** Shown above the map. */
  title: string;
  /** The ASCII map, or `null` for an empty "no map yet" placeholder. */
  text: string | null;
  /** Shown under the title, in red: a parse error, say. */
  note?: string;
}

/** Legend entries for the chars used, in a fixed order, one per name. */
export function legendEntries(chars: Iterable<string>): { char: string; name: string }[] {
  const used = new Set(chars);
  const entries: { char: string; name: string }[] = [];
  const names = new Set<string>();
  for (const char of [...LEGEND_ORDER, ...[...used].filter((c) => !LEGEND_ORDER.includes(c))]) {
    if (!used.has(char)) continue;
    const name = charInfo(char).name;
    if (names.has(name)) continue;
    names.add(name);
    entries.push({ char, name });
  }
  return entries;
}

/**
 * Maps side by side at the same scale (current left, draft right), each with
 * a title, and a legend of every char used underneath.
 */
export function renderSketchSvg(panels: readonly SketchPanel[], heading = ''): string {
  const drawings = panels.map((p) => (p.text === null ? null : drawMap(p.text)));
  const placeholder = drawings.find((d) => d !== null) ?? {
    width: 10 * SKETCH_TILE,
    height: 7 * SKETCH_TILE,
  };
  const sizes = drawings.map((d) => d ?? placeholder);
  const top = MARGIN + (heading ? 32 : 0);
  const mapsHeight = Math.max(0, ...sizes.map((s) => s.height));
  const mapsWidth =
    sizes.reduce((sum, s) => sum + s.width, 0) + PANEL_GAP * Math.max(0, sizes.length - 1);

  const parts: string[] = [];
  if (heading) {
    parts.push(
      `<text x="${MARGIN}" y="${MARGIN + 10}" font-size="20" font-weight="bold" ${FONT} fill="${INK}">${escapeXml(heading)}</text>`,
    );
  }
  let x = MARGIN;
  const used = new Set<string>();
  panels.forEach((panel, i) => {
    const drawing = drawings[i] ?? null;
    const size = sizes[i] ?? placeholder;
    parts.push(
      `<text x="${x}" y="${top + 14}" font-size="15" font-weight="bold" ${FONT} fill="${INK}">${escapeXml(panel.title)}</text>`,
    );
    if (panel.note) {
      parts.push(
        `<text x="${x}" y="${top + 33}" font-size="12" ${FONT} fill="#c62828">${escapeXml(panel.note)}</text>`,
      );
    }
    const mapTop = top + TITLE_HEIGHT;
    if (drawing) {
      drawing.chars.forEach((c) => used.add(c));
      parts.push(`<g transform="translate(${x} ${mapTop})">${drawing.svg}</g>`);
    } else {
      parts.push(
        rect(
          x,
          mapTop,
          size.width,
          size.height,
          `fill="none" stroke="#9e9e9e" stroke-width="2" stroke-dasharray="8 6"`,
        ) + label(x + size.width / 2, mapTop + size.height / 2, 16, 'no map yet', 'fill="#9e9e9e"'),
      );
    }
    x += size.width + PANEL_GAP;
  });

  const legend = legendEntries(used);
  const legendTop = top + TITLE_HEIGHT + mapsHeight + 28;
  const columns = Math.max(1, Math.floor(Math.max(mapsWidth, LEGEND_COLUMN) / LEGEND_COLUMN));
  legend.forEach((entry, i) => {
    const lx = MARGIN + (i % columns) * LEGEND_COLUMN;
    const ly = legendTop + Math.floor(i / columns) * LEGEND_ROW;
    parts.push(
      `<g transform="translate(${lx} ${ly})">${legendSwatch(entry.char)}</g>`,
      `<text x="${lx + LEGEND_SWATCH + 8}" y="${ly + LEGEND_SWATCH / 2}" font-size="13" ${FONT} dominant-baseline="central" fill="${INK}">${escapeXml(entry.name)}</text>`,
    );
  });
  const legendRows = Math.ceil(legend.length / columns);
  const hasFuture = legend.some((e) => FUTURE_CHARS[e.char]);
  const footnoteTop = legendTop + legendRows * LEGEND_ROW + 6;
  if (hasFuture) {
    const standIns = legend
      .flatMap((e) => {
        const future = FUTURE_CHARS[e.char];
        if (!future) return [];
        return [`${future.name.replace(/ \(.*\)$/, '')} as ${charInfo(future.standIn).name}`];
      })
      .join(', ');
    parts.push(
      `<text x="${MARGIN}" y="${footnoteTop + 6}" font-size="12" ${FONT} fill="#616161">${escapeXml(`* not in the game yet, the tools read: ${standIns}`)}</text>`,
    );
  }

  const width = MARGIN * 2 + Math.max(mapsWidth, columns * LEGEND_COLUMN);
  const height = footnoteTop + (hasFuture ? 24 : 0) + MARGIN;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    rect(0, 0, width, height, 'fill="#ffffff"') +
    parts.join('') +
    '</svg>\n'
  );
}
