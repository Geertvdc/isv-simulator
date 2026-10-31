/// <reference types="node" />

/**
 * Prints numbers for level maps, for the level redesign doc (phase 23): size,
 * stations, reachability from every spawn, solo run and loop length, and
 * chokepoints. Ends with a markdown table to paste into the doc.
 *
 *   npm run level-report -- <level-id>    current map and its draft (if any)
 *   npm run level-report -- --all         every current campaign map
 *   npm run level-report -- --drafts      every draft in maps/drafts/
 *   npm run level-report -- <file.txt>    one map file
 *   add --table to print only the markdown table
 */

import { parseDraftMap } from './mapTools/mapChars';
import {
  LEVEL_IDS,
  currentMapPath,
  draftIds,
  draftMapPath,
  levelLabel,
  readText,
} from './mapTools/mapFiles';
import { REPORT_TABLE_HEADER, analyzeMap, formatReport, reportTableRow } from './mapTools/report';

interface Target {
  name: string;
  path: string | null;
}

const args = process.argv.slice(2);
const tableOnly = args.includes('--table');
const positional = args.filter((a) => !a.startsWith('--'));

function targets(): Target[] {
  if (args.includes('--all')) {
    return LEVEL_IDS.map((id) => ({ name: levelLabel(id), path: currentMapPath(id) }));
  }
  if (args.includes('--drafts')) {
    return draftIds().map((id) => ({ name: `${levelLabel(id)} (draft)`, path: draftMapPath(id) }));
  }
  const first = positional[0];
  if (first?.endsWith('.txt')) return [{ name: first, path: first }];
  if (first) {
    if (!LEVEL_IDS.includes(first)) throw new Error(`Unknown level id '${first}'`);
    const result: Target[] = [
      { name: `${levelLabel(first)} (current)`, path: currentMapPath(first) },
    ];
    if (readText(draftMapPath(first)) !== null) {
      result.push({ name: `${levelLabel(first)} (draft)`, path: draftMapPath(first) });
    }
    return result;
  }
  return [];
}

const list = targets();
if (list.length === 0) {
  console.log('Usage: npm run level-report -- <level-id> | --all | --drafts | <map.txt> [--table]');
  console.log(`Level ids: ${LEVEL_IDS.join(', ')}`);
  process.exitCode = 1;
}

const rows: string[] = [];
for (const { name, path } of list) {
  const text = path === null ? null : readText(path);
  if (text === null) {
    console.error(`${name}: no map file`);
    process.exitCode = 1;
    continue;
  }
  let report;
  try {
    report = analyzeMap(parseDraftMap(text));
  } catch (e) {
    console.error(`${name}: does not parse: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    continue;
  }
  if (!tableOnly) console.log(`${formatReport(`${name}: ${path ?? ''}`, report)}\n`);
  rows.push(reportTableRow(name, report));
}

if (rows.length > 0) console.log([REPORT_TABLE_HEADER, ...rows].join('\n'));
