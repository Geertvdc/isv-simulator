/// <reference types="node" />

/**
 * Headless tuning run: bots play a level with fixed seeds and we print how it
 * went. Usage: npm run sim -- [bots=2] [runs=5] [firstSeed=1] [--skip-tests] [--level=garage]
 * `--level=all` runs every level and prints one line per level.
 */

import { runBots } from '../src/sim/bot';
import { type Level, LEVELS, levelById, settingsForPlayers } from '../src/sim/levels';

const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const levelId = args.find((a) => a.startsWith('--level='))?.slice('--level='.length) ?? 'garage';
const [bots = 2, runs = 5, firstSeed = 1] = args.filter((a) => !a.startsWith('--')).map(Number);

function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

function runLevel(level: Level, verbose: boolean): void {
  const thresholds = settingsForPlayers(level, bots).starThresholds;
  if (verbose) {
    console.log(
      `${level.name}: ${bots} bot(s)${skipTests ? ' skipping tests' : ''}, ${runs} run(s), ` +
        `stars at ${thresholds.join(' / ')}`,
    );
    console.log(
      'seed  shipped (bugs, untested, reviewed, incidents)  expired (bugs, incidents)  ' +
        'meetings (sat, missed)  bumps  score  stars',
    );
  }
  let total = 0;
  let minStars = 3;
  for (let seed = firstSeed; seed < firstSeed + runs; seed++) {
    const r = runBots(level, seed, bots, { skipTests });
    total += r.result.score;
    minStars = Math.min(minStars, r.result.stars);
    if (!verbose) continue;
    console.log(
      [
        String(seed).padEnd(4),
        `${r.shipped} (${r.shippedBugs}, ${r.shippedUntested}, ${r.shippedReviewed}, ${r.shippedIncidents})`.padEnd(
          45,
        ),
        `${r.expired} (${r.expiredBugs}, ${r.expiredIncidents})`.padEnd(25),
        `${r.meetingsAttended}, ${r.meetingsMissed}`.padEnd(22),
        String(r.managerBumps).padEnd(5),
        String(r.result.score).padEnd(5),
        stars(r.result.stars),
      ].join('  '),
    );
  }
  const average = Math.round(total / runs);
  if (verbose) console.log(`average score: ${average}`);
  else {
    console.log(
      `${level.id.padEnd(18)} avg ${String(average).padEnd(5)} stars at ${thresholds.join('/').padEnd(12)} worst ${stars(minStars)}`,
    );
  }
}

if (levelId === 'all') {
  console.log(`${bots} bot(s), ${runs} run(s) per level`);
  for (const level of LEVELS) runLevel(level, false);
} else {
  const level = levelById(levelId);
  if (!level) throw new Error(`No level '${levelId}'; try ${LEVELS.map((l) => l.id).join(', ')}`);
  runLevel(level, true);
}
