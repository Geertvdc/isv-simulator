/// <reference types="node" />

/**
 * Renders level maps as top-down SVG sketches for the level redesign doc
 * (phase 23): the current map and its draft side by side, same scale.
 *
 *   npm run sketch -- <level-id>         current + draft  -> docs/plan/images/level-redesign/<id>.svg
 *                                        (a draft with reorg phases gets a panel per phase)
 *   npm run sketch -- --drafts           every level with a draft in maps/drafts/
 *   npm run sketch -- --all              every campaign level (draft side empty if there is none)
 *   npm run sketch -- <file.txt> [out]   one map file, to out (default: next to it, .svg)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDraftMap } from './mapTools/mapChars';
import {
  LEVEL_IDS,
  SKETCH_DIR,
  currentMapPath,
  draftIds,
  draftMapPath,
  draftPhases,
  levelLabel,
  readText,
} from './mapTools/mapFiles';
import { phaseProblems } from './mapTools/phases';
import { type SketchPanel, renderSketchSvg } from './mapTools/sketch';

/** A panel for a map file; the note says why it doesn't parse yet, if it doesn't. */
function panel(kind: string, path: string | null): SketchPanel {
  const text = path === null ? null : readText(path);
  if (text === null) return { title: `${kind}: none yet`, text: null };
  let note: string | undefined;
  let size = '';
  try {
    const map = parseDraftMap(text);
    size = ` (${map.width}×${map.height})`;
  } catch (e) {
    note = `does not parse: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { title: `${kind}: ${path ?? ''}${size}`, text, ...(note ? { note } : {}) };
}

/** One panel per reorg phase of the draft, or a single `Draft` panel. */
function draftPanels(id: string): SketchPanel[] {
  const phases = draftPhases(id);
  if (phases.length <= 1) return [panel('Draft', draftMapPath(id))];
  const first = readText(draftMapPath(id)) ?? '';
  return phases.map(({ phase, path }) => {
    const result = panel(`Draft phase ${phase}`, path);
    const problems = phase > 1 ? phaseProblems(first, readText(path) ?? '') : [];
    if (result.note || problems.length === 0) return result;
    return { ...result, note: `not a reorg of phase 1: ${problems.slice(0, 3).join('; ')}` };
  });
}

function sketchLevel(id: string): string {
  if (!LEVEL_IDS.includes(id)) throw new Error(`Unknown level id '${id}'`);
  const svg = renderSketchSvg(
    [panel('Current', currentMapPath(id)), ...draftPanels(id)],
    `${levelLabel(id)} (${id})`,
  );
  mkdirSync(SKETCH_DIR, { recursive: true });
  const out = join(SKETCH_DIR, `${id}.svg`);
  writeFileSync(out, svg);
  return out;
}

const args = process.argv.slice(2);
const outputs: string[] = [];
if (args.includes('--all')) {
  for (const id of LEVEL_IDS) outputs.push(sketchLevel(id));
} else if (args.includes('--drafts')) {
  for (const id of draftIds()) outputs.push(sketchLevel(id));
} else if (args[0]?.endsWith('.txt')) {
  const out = args[1] ?? args[0].replace(/\.txt$/, '.svg');
  writeFileSync(out, renderSketchSvg([panel('Map', args[0])]));
  outputs.push(out);
} else if (args[0]) {
  outputs.push(sketchLevel(args[0]));
} else {
  console.log('Usage: npm run sketch -- <level-id> | --drafts | --all | <map.txt> [out.svg]');
  console.log(`Level ids: ${LEVEL_IDS.join(', ')}`);
  process.exitCode = 1;
}
for (const out of outputs) console.log(`wrote ${out}`);
