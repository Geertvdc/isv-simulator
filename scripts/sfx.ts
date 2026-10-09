/// <reference types="node" />

/**
 * Sound effect tooling. Usage:
 *   npm run sfx -- fetch               download the packs into sfx-candidates/ (git-ignored)
 *   npm run sfx -- apply <choices.json> copy picked sounds into public/assets/sfx, update CREDITS.md
 * Pick sounds with the dev server at /tools/sound-picker/; it gives you the choices JSON.
 */

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { SOUND_PACKS, type SoundSources } from './sfxPacks';

const ROOT = join(import.meta.dirname, '..');
const CANDIDATES = join(ROOT, 'sfx-candidates');
const SFX = join(ROOT, 'public/assets/sfx');
const SOURCES = join(ROOT, 'scripts/sfxSources.json');
const CREDITS = join(ROOT, 'CREDITS.md');

function fetchPacks(): void {
  for (const pack of SOUND_PACKS) {
    const dir = join(CANDIDATES, pack.id);
    if (existsSync(dir)) {
      console.log(`${pack.name}: already there`);
      continue;
    }
    mkdirSync(dir, { recursive: true });
    const zip = join(CANDIDATES, `${pack.id}.zip`);
    console.log(`${pack.name}: downloading`);
    execFileSync('curl', ['-sSfL', '-o', zip, pack.zip]);
    execFileSync('unzip', ['-qo', zip, '-d', dir]);
  }
}

/** Path of `file` inside an unzipped pack (the packs keep their sounds in a subfolder). */
function findInPack(packId: string, file: string): string {
  const search = (dir: string): string | null => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = search(path);
        if (found) return found;
      } else if (entry.name === file) {
        return path;
      }
    }
    return null;
  };
  const dir = join(CANDIDATES, packId);
  const found = existsSync(dir) ? search(dir) : null;
  if (!found) throw new Error(`${file} not found in ${dir}; run: npm run sfx -- fetch`);
  return found;
}

function creditsSection(sources: SoundSources): string {
  const rows = Object.entries(sources).map(([key, { pack, file }]) => {
    const p = SOUND_PACKS.find((s) => s.id === pack);
    if (!p) throw new Error(`Unknown pack ${pack}`);
    return `| \`${key}.ogg\` | [${p.name}](${p.page}) | \`${file}\` |`;
  });
  return [
    '## Sound effects',
    '',
    "All in `public/assets/sfx/`, renamed after what they're for. Made by [Kenney](https://www.kenney.nl), licensed [CC0 1.0](http://creativecommons.org/publicdomain/zero/1.0/).",
    '',
    '| File | Pack | Original file |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function apply(choicesPath: string): void {
  const sources = JSON.parse(readFileSync(SOURCES, 'utf8')) as SoundSources;
  const choices = JSON.parse(readFileSync(choicesPath, 'utf8')) as SoundSources;
  for (const [key, choice] of Object.entries(choices)) {
    if (!(key in sources)) throw new Error(`Unknown sound '${key}'`);
    copyFileSync(findInPack(choice.pack, choice.file), join(SFX, `${key}.ogg`));
    sources[key] = choice;
    console.log(`${key}: ${choice.pack}/${choice.file}`);
  }
  writeFileSync(SOURCES, `${JSON.stringify(sources, null, 2)}\n`);
  const credits = readFileSync(CREDITS, 'utf8');
  const updated = credits.replace(/## Sound effects\n[\s\S]*?(?=\n## |$)/, creditsSection(sources));
  writeFileSync(CREDITS, updated);
}

const [command, arg] = process.argv.slice(2);
if (command === 'fetch') fetchPacks();
else if (command === 'apply' && arg) apply(arg);
else console.log('Usage: npm run sfx -- fetch | apply <choices.json>');
