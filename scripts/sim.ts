/// <reference types="node" />

/**
 * Headless tuning run: bots play a level with fixed seeds and we print how it
 * went. Use `--role-lab --players=4 [runs=30] [firstSeed=1]` for paired role trials.
 * `--level=all` runs every campaign level and prints one line per level.
 */

import { runBots, type BotAssignmentPolicy, type BotRunSummary } from '../src/sim/bot';
import { type Level, LEVELS, levelById, settingsForPlayers } from '../src/sim/levels';
import { isRoleId, type RoleId } from '../src/sim/roles';

const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const roleLab = args.includes('--role-lab');
const levelId = args.find((a) => a.startsWith('--level='))?.slice('--level='.length) ?? 'garage';
const policyArg = args.find((a) => a.startsWith('--policy='))?.slice('--policy='.length);
if (policyArg !== undefined && policyArg !== 'role-neutral' && policyArg !== 'role-aware') {
  throw new Error(`Unknown assignment policy '${policyArg}'`);
}
const assignmentPolicy: BotAssignmentPolicy = policyArg ?? 'role-neutral';
const rolesArg = args.find((a) => a.startsWith('--roles='))?.slice('--roles='.length);
const roles = rolesArg?.split(',').map((role) => {
  if (!isRoleId(role)) throw new Error(`Unknown role '${role}'`);
  return role;
});
const roleLabPlayers = Number(
  args.find((a) => a.startsWith('--players='))?.slice('--players='.length) ?? 4,
);
const positional = args.filter((a) => !a.startsWith('--')).map(Number);
const [bots = 2, runs = 5, firstSeed = 1] = positional;

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
    if (roles || policyArg) {
      console.log(
        'domain ships (G/FE/BE/IF/MX)  domain expired  station work (code/test/design/review/repair)  ' +
          'travel/idle ticks  handovers  max queues (feature/bug)',
      );
    }
  }
  let total = 0;
  let minStars = 3;
  for (let seed = firstSeed; seed < firstSeed + runs; seed++) {
    const r = runBots(level, seed, bots, {
      skipTests,
      roles,
      assignmentPolicy,
    });
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
    if (roles || policyArg) {
      console.log(
        `  ${Object.values(r.shippedByDomain).join('/')}  ${Object.values(r.expiredByDomain).join('/')}  ` +
          `${Object.values(r.stationWorkTicks).join('/')}  ${r.travelTicks}/${r.idleTicks}  ${r.handovers}  ` +
          `${r.maxQueueLength.feature}/${r.maxQueueLength.bug}`,
      );
    }
  }
  const average = Math.round(total / runs);
  if (verbose) console.log(`average score: ${average}`);
  else {
    console.log(
      `${level.id.padEnd(18)} avg ${String(average).padEnd(5)} stars at ${thresholds.join('/').padEnd(12)} worst ${stars(minStars)}`,
    );
  }
}

function roleLabTeams(players: number): { name: string; roles: readonly RoleId[] }[] {
  if (players === 2) {
    return [
      { name: 'generalist', roles: ['generalist', 'generalist'] },
      { name: 'mixed', roles: ['frontend', 'qa'] },
      { name: 'specialist', roles: ['frontend', 'backend'] },
    ];
  }
  if (players === 3) {
    return [
      { name: 'generalist', roles: ['generalist', 'generalist', 'generalist'] },
      { name: 'mixed', roles: ['generalist', 'frontend', 'qa'] },
      { name: 'specialist', roles: ['frontend', 'backend', 'platform'] },
    ];
  }
  if (players === 4) {
    return [
      { name: 'generalist', roles: ['generalist', 'generalist', 'generalist', 'generalist'] },
      { name: 'mixed', roles: ['generalist', 'frontend', 'backend', 'qa'] },
      { name: 'specialist', roles: ['frontend', 'backend', 'qa', 'platform'] },
    ];
  }
  throw new Error('--players must be 2, 3 or 4');
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function pairedScoreDelta(
  results: readonly BotRunSummary[],
  baseline: readonly BotRunSummary[],
): { mean: number; low: number; high: number; perSeed: number[] } {
  if (results.length !== baseline.length || results.length === 0) {
    throw new Error('Paired role trials need equally sized, non-empty seed sets');
  }
  const perSeed = results.map((result, index) => {
    const baselineResult = baseline[index];
    if (!baselineResult) throw new Error(`Missing paired baseline at index ${index}`);
    return result.result.score - baselineResult.result.score;
  });
  const mean = average(perSeed);
  const variance = average(perSeed.map((delta) => (delta - mean) ** 2));
  const margin = 1.96 * Math.sqrt(variance / Math.max(1, perSeed.length - 1));
  return { mean, low: mean - margin, high: mean + margin, perSeed };
}

function runRoleLab(): void {
  const level = levelById('lab-roles');
  if (!level) throw new Error('The role lab level is missing');
  const seedCount = positional[0] ?? 30;
  const seedStart = positional[1] ?? 1;
  if (!Number.isInteger(seedCount) || seedCount <= 0 || !Number.isInteger(seedStart)) {
    throw new Error('Role lab needs a positive seed count and an integer first seed');
  }
  const teams = roleLabTeams(roleLabPlayers);
  console.log(
    `Role lab: ${level.name}, ${roleLabPlayers} players, ${seedCount} shared seeds from ${seedStart}; ` +
      'paired score deltas vs same-policy generalists (95% normal-approx interval).',
  );
  for (const policy of ['role-neutral', 'role-aware'] as const) {
    const measured = new Map<string, BotRunSummary[]>();
    for (const team of teams) {
      const results: BotRunSummary[] = [];
      for (let seed = seedStart; seed < seedStart + seedCount; seed++) {
        results.push(
          runBots(level, seed, roleLabPlayers, { roles: team.roles, assignmentPolicy: policy }),
        );
      }
      measured.set(team.name, results);
      const baseline = measured.get('generalist');
      const delta = baseline
        ? pairedScoreDelta(results, baseline)
        : { mean: 0, low: 0, high: 0, perSeed: results.map(() => 0) };
      const shipped = average(results.map((result) => result.shipped));
      const expired = average(results.map((result) => result.expired));
      const score = average(results.map((result) => result.result.score));
      const stars = average(results.map((result) => result.result.stars));
      const domains = ['general', 'frontend', 'backend', 'infra', 'mixed'] as const;
      const shippedDomains = domains
        .map((domain) =>
          average(results.map((result) => result.shippedByDomain[domain])).toFixed(1),
        )
        .join('/');
      const work = ['code', 'test', 'design', 'review', 'repair'] as const;
      const workTicks = work
        .map((task) => average(results.map((result) => result.stationWorkTicks[task])).toFixed(0))
        .join('/');
      const travel = average(results.map((result) => result.travelTicks)).toFixed(0);
      const idle = average(results.map((result) => result.idleTicks)).toFixed(0);
      const handovers = average(results.map((result) => result.handovers)).toFixed(1);
      const queueMax =
        `${average(results.map((result) => result.maxQueueLength.feature)).toFixed(1)}/` +
        average(results.map((result) => result.maxQueueLength.bug)).toFixed(1);
      const recipeDomains = [
        ...new Set(results.flatMap((result) => Object.keys(result.ordersByRecipeDomain))),
      ]
        .sort()
        .map(
          (key) =>
            `${key}=${average(
              results.map((result) => result.ordersByRecipeDomain[key] ?? 0),
            ).toFixed(1)}`,
        )
        .join(',');
      console.log(
        `${policy.padEnd(12)} ${team.name.padEnd(11)} ` +
          `score ${score.toFixed(1)} (Δ ${delta.mean.toFixed(1)}, 95% normal ${delta.low.toFixed(1)}..${delta.high.toFixed(1)}) ` +
          `paired Δ/seed[${delta.perSeed.join(',')}] ` +
          `shipped ${shipped.toFixed(1)} expired ${expired.toFixed(1)} stars ${stars.toFixed(2)} ` +
          `domains[G/FE/BE/IF/MX] ${shippedDomains} work[code/test/design/review/repair] ${workTicks} ` +
          `travel/idle ${travel}/${idle} handovers ${handovers} max queues ${queueMax} ` +
          `recipe-domain counts[ship/expire] ${recipeDomains}`,
      );
    }
  }
}

if (roleLab) {
  runRoleLab();
} else if (levelId === 'all') {
  console.log(`${bots} bot(s), ${runs} run(s) per level`);
  for (const level of LEVELS) runLevel(level, false);
} else {
  const level = levelById(levelId);
  if (!level) throw new Error(`No level '${levelId}'; try ${LEVELS.map((l) => l.id).join(', ')}`);
  runLevel(level, true);
}
