/// <reference types="node" />

/**
 * Headless tuning run: bots play a level with fixed seeds and we print how it
 * went. Usage: npm run sim -- [bots=2] [runs=5] [firstSeed=1]
 */

import { runBots } from '../src/sim/bot';
import { GARAGE } from '../src/sim/levels';

const [bots = 2, runs = 5, firstSeed = 1] = process.argv.slice(2).map(Number);
const level = GARAGE;

console.log(
  `${level.name}: ${bots} bot(s), ${runs} run(s), stars at ${level.starThresholds.join(' / ')}`,
);
console.log('seed  shipped (bugs)  expired (bugs)  score  stars');
let total = 0;
for (let seed = firstSeed; seed < firstSeed + runs; seed++) {
  const r = runBots(level, seed, bots);
  total += r.result.score;
  console.log(
    [
      String(seed).padEnd(4),
      `${r.shipped} (${r.shippedBugs})`.padEnd(14),
      `${r.expired} (${r.expiredBugs})`.padEnd(14),
      String(r.result.score).padEnd(5),
      '★'.repeat(r.result.stars) + '☆'.repeat(3 - r.result.stars),
    ].join('  '),
  );
}
console.log(`average score: ${Math.round(total / runs)}`);
