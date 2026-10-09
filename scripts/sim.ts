/// <reference types="node" />

/**
 * Headless tuning run: bots play a level with fixed seeds and we print how it
 * went. Usage: npm run sim -- [bots=2] [runs=5] [firstSeed=1] [--skip-tests] [--level=garage]
 */

import { runBots } from '../src/sim/bot';
import { LEVELS, levelById } from '../src/sim/levels';

const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const levelId = args.find((a) => a.startsWith('--level='))?.slice('--level='.length) ?? 'garage';
const [bots = 2, runs = 5, firstSeed = 1] = args.filter((a) => !a.startsWith('--')).map(Number);
const level = levelById(levelId);
if (!level) throw new Error(`No level '${levelId}'; try ${LEVELS.map((l) => l.id).join(', ')}`);

console.log(
  `${level.name}: ${bots} bot(s)${skipTests ? ' skipping tests' : ''}, ${runs} run(s), ` +
    `stars at ${level.starThresholds.join(' / ')}`,
);
console.log('seed  shipped (bugs, untested, reviewed)  expired (bugs)  score  stars');
let total = 0;
for (let seed = firstSeed; seed < firstSeed + runs; seed++) {
  const r = runBots(level, seed, bots, { skipTests });
  total += r.result.score;
  console.log(
    [
      String(seed).padEnd(4),
      `${r.shipped} (${r.shippedBugs}, ${r.shippedUntested}, ${r.shippedReviewed})`.padEnd(34),
      `${r.expired} (${r.expiredBugs})`.padEnd(14),
      String(r.result.score).padEnd(5),
      '★'.repeat(r.result.stars) + '☆'.repeat(3 - r.result.stars),
    ].join('  '),
  );
}
console.log(`average score: ${Math.round(total / runs)}`);
