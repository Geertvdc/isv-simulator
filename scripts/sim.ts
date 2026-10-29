/// <reference types="node" />

import { writeFileSync } from 'node:fs';

/**
 * Headless tuning run: bots play a level with fixed seeds and we print how it
 * went. Use `--role-lab --players=4 [runs=30] [firstSeed=1]` for paired role trials,
 * or `--role-bench [runs=30] [firstSeed=1] [--json=/path/to/results.json]`.
 * `--level=all` runs every campaign level and prints one line per level.
 */

import { PIPELINE_BUILD_TICKS, TICKS_PER_SECOND, WORK_RATE } from '../src/sim/balance';
import { runBots, type BotAssignmentPolicy, type BotRunSummary } from '../src/sim/bot';
import { type Level, LEVELS, levelById, settingsForPlayers } from '../src/sim/levels';
import { isRoleId, roleWorkRate, type RoleId } from '../src/sim/roles';

const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const roleLab = args.includes('--role-lab');
const roleBench = args.includes('--role-bench');
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

interface Estimate {
  mean: number;
  low: number | null;
  high: number | null;
}

function pairedEstimate(values: readonly number[], baseline: readonly number[]): Estimate {
  if (values.length !== baseline.length || values.length === 0) {
    throw new Error('Paired trials need equally sized, non-empty seed sets');
  }
  const deltas = values.map((value, index) => {
    const baselineValue = baseline[index];
    if (baselineValue === undefined) throw new Error(`Missing paired baseline at index ${index}`);
    return value - baselineValue;
  });
  const mean = average(deltas);
  if (deltas.length < 2) return { mean, low: null, high: null };
  const variance =
    deltas.reduce((sum, delta) => sum + (delta - mean) ** 2, 0) / (deltas.length - 1);
  const margin = 1.96 * Math.sqrt(variance / deltas.length);
  return { mean, low: mean - margin, high: mean + margin };
}

function pairedScoreDelta(
  results: readonly BotRunSummary[],
  baseline: readonly BotRunSummary[],
): Estimate & { perSeed: number[] } {
  const perSeed = results.map((result, index) => {
    const baselineResult = baseline[index];
    if (!baselineResult) throw new Error(`Missing paired baseline at index ${index}`);
    return result.result.score - baselineResult.result.score;
  });
  return {
    ...pairedEstimate(
      perSeed,
      perSeed.map(() => 0),
    ),
    perSeed,
  };
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
      if (!baseline) throw new Error('Missing role-lab generalist baseline');
      const delta = pairedScoreDelta(results, baseline);
      const shippedDelta = pairedEstimate(
        results.map((result) => result.shipped),
        baseline.map((result) => result.shipped),
      );
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
          `score ${score.toFixed(1)} (Δ ${formatEstimate(delta, 1)}) ` +
          `shipped ${shipped.toFixed(1)} (Δ ${formatEstimate(shippedDelta)}) ` +
          `paired Δ/seed[${delta.perSeed.join(',')}] ` +
          `expired ${expired.toFixed(1)} stars ${stars.toFixed(2)} ` +
          `domains[G/FE/BE/IF/MX] ${shippedDomains} work[code/test/design/review/repair] ${workTicks} ` +
          `travel/idle ${travel}/${idle} queue-wait ${average(results.map((result) => result.queueWaitTicks)).toFixed(0)} ` +
          `handovers ${handovers} max queues ${queueMax} ` +
          `recipe-domain counts[created/ship/expire] ${recipeDomains}`,
      );
    }
  }
}

const ROLE_IDS: readonly RoleId[] = ['generalist', 'frontend', 'backend', 'qa', 'platform'];

interface BenchTeam {
  roles: readonly RoleId[];
  name: string;
}

interface BenchScenario {
  id: string;
  level: Level;
  sweepAllCompositions: boolean;
}

interface RawBenchRun {
  scenario: string;
  policy: BotAssignmentPolicy;
  roles: readonly RoleId[];
  seed: number;
  summary: BotRunSummary;
}

function benchmarkScenarios(): BenchScenario[] {
  const lab = levelById('lab-roles');
  if (!lab) throw new Error('The role lab level is missing');
  const domains = {
    counts: { general: 2, frontend: 2, backend: 2, infra: 2, mixed: 2 },
    maxDrought: 8,
  } as const;
  const balancedLab: Level = {
    ...lab,
    id: 'benchmark-balanced-lab',
    name: 'Benchmark: balanced lab (90 seconds)',
    durationTicks: 90 * TICKS_PER_SECOND,
  };
  const campaign = (sourceId: string): Level => {
    const source = levelById(sourceId);
    if (!source) throw new Error(`Missing campaign benchmark level '${sourceId}'`);
    return {
      ...source,
      id: `benchmark-${source.id}`,
      name: `Benchmark: ${source.name}`,
      domainSchedule: domains,
    };
  };
  return [
    { id: 'balanced-lab', level: balancedLab, sweepAllCompositions: true },
    {
      id: 'frontend-skew',
      level: {
        ...lab,
        id: 'benchmark-frontend-skew',
        name: 'Benchmark: frontend-only',
        designShare: 0,
        fullstackShare: 0,
        incidents: null,
        domainSchedule: {
          counts: { general: 0, frontend: 1, backend: 0, infra: 0, mixed: 0 },
          maxDrought: 0,
        },
      },
      sweepAllCompositions: false,
    },
    {
      id: 'infra-incidents',
      level: {
        ...lab,
        id: 'benchmark-infra-incidents',
        name: 'Benchmark: infra incidents',
        designShare: 0,
        fullstackShare: 0,
        incidents: {
          firstTick: 15 * TICKS_PER_SECOND,
          intervalTicks: 45 * TICKS_PER_SECOND,
          jitterTicks: 0,
          timeLimitTicks: 35 * TICKS_PER_SECOND,
          domain: 'infra',
        },
        domainSchedule: {
          counts: { general: 0, frontend: 0, backend: 0, infra: 1, mixed: 0 },
          maxDrought: 0,
        },
      },
      sweepAllCompositions: false,
    },
    { id: 'design-pairing', level: campaign('design-sprint'), sweepAllCompositions: false },
    { id: 'conveyor-gap', level: campaign('monorepo'), sweepAllCompositions: false },
    { id: 'meetings-incidents', level: campaign('the-reorg'), sweepAllCompositions: false },
  ];
}

function teamKey(roles: readonly RoleId[]): string {
  return [...roles].sort((a, b) => ROLE_IDS.indexOf(a) - ROLE_IDS.indexOf(b)).join('+');
}

function allCompositions(players: number): BenchTeam[] {
  const teams: BenchTeam[] = [];
  function extend(start: number, roles: RoleId[]): void {
    if (roles.length === players) {
      teams.push({ roles: [...roles], name: teamKey(roles) });
      return;
    }
    for (let index = start; index < ROLE_IDS.length; index++) {
      const role = ROLE_IDS[index];
      if (!role) continue;
      roles.push(role);
      extend(index, roles);
      roles.pop();
    }
  }
  extend(0, []);
  return teams;
}

function benchTeams(players: number, fullSweep: boolean): BenchTeam[] {
  if (fullSweep) {
    return players === 1
      ? [{ name: 'generalist', roles: ['generalist'] }]
      : allCompositions(players);
  }
  return roleLabTeams(players).map(({ name, roles }) => ({ name, roles }));
}

function rotateForSeed(roles: readonly RoleId[], offset: number): RoleId[] {
  if (roles.length < 2) return [...roles];
  const rotation = offset % roles.length;
  return [...roles.slice(rotation), ...roles.slice(0, rotation)];
}

function meanOf(
  results: readonly BotRunSummary[],
  select: (result: BotRunSummary) => number,
): number {
  return average(results.map(select));
}

function formatEstimate(estimate: Estimate, digits = 2): string {
  if (estimate.low === null || estimate.high === null) {
    return `${estimate.mean.toFixed(digits)} [95% CI unavailable (n<2)]`;
  }
  return `${estimate.mean.toFixed(digits)} [${estimate.low.toFixed(digits)}, ${estimate.high.toFixed(digits)}]`;
}

function printNoTravelChecks(): void {
  const baseWorkSeconds = 1 / WORK_RATE / TICKS_PER_SECOND;
  const buildSeconds = PIPELINE_BUILD_TICKS / TICKS_PER_SECOND;
  const codeSeconds = (role: RoleId): number =>
    baseWorkSeconds / roleWorkRate(role, 'code', 'frontend');
  const testSeconds = (role: RoleId): number =>
    baseWorkSeconds / roleWorkRate(role, 'test', 'frontend');
  const plans = [
    {
      name: 'generalist code/test',
      code: codeSeconds('generalist'),
      test: testSeconds('generalist'),
    },
    { name: 'frontend hands to QA', code: codeSeconds('frontend'), test: testSeconds('qa') },
    { name: 'QA does both', code: codeSeconds('qa'), test: testSeconds('qa') },
    { name: 'frontend does both', code: codeSeconds('frontend'), test: testSeconds('frontend') },
  ];
  console.log(
    `No-travel single frontend feature theoretical time (code + test + ${buildSeconds.toFixed(2)} s build):`,
  );
  for (const plan of plans) {
    console.log(
      `  ${plan.name.padEnd(24)} ${plan.code.toFixed(2)} + ${plan.test.toFixed(2)} + ${buildSeconds.toFixed(2)} = ${(plan.code + plan.test + buildSeconds).toFixed(2)} s`,
    );
  }
}

function runRoleBench(): void {
  const seedCount = positional[0] ?? 30;
  const seedStart = positional[1] ?? 1;
  if (!Number.isInteger(seedCount) || seedCount <= 0 || !Number.isInteger(seedStart)) {
    throw new Error('Role benchmarks need a positive seed count and an integer first seed');
  }
  const jsonPath = args.find((argument) => argument.startsWith('--json='))?.slice('--json='.length);
  const scenarios = benchmarkScenarios();
  const policies = ['role-neutral', 'role-aware'] as const;
  const rawRuns: RawBenchRun[] = [];
  console.log(
    `Role benchmarks: ${seedCount} shared seeds from ${seedStart}; role-neutral vs role-aware; ` +
      'paired 95% normal intervals. Balanced lab: generalist-only solo plus all 15/35/70 unordered ' +
      'compositions for 2/3/4 players; other scenarios: generalist, mixed and specialist candidates.',
  );
  printNoTravelChecks();

  for (const scenario of scenarios) {
    console.log(
      `\n${scenario.id}: ${scenario.level.map.width}x${scenario.level.map.height}, ` +
        `${scenario.level.durationTicks / TICKS_PER_SECOND}s; ` +
        `orders every ${scenario.level.orderSchedule.intervalTicks / TICKS_PER_SECOND}s, ` +
        `max open ${scenario.level.orderSchedule.maxOpenOrders}; ` +
        `design ${scenario.level.designShare ?? 0}, fullstack ${scenario.level.fullstackShare ?? 0}, ` +
        `pairing ${scenario.level.pairing ?? false}, incidents ${scenario.level.incidents ? 'yes' : 'no'}, ` +
        `meetings ${scenario.level.meetings ? 'yes' : 'no'}, domains ${scenario.level.domainSchedule ? 'enabled' : 'classic'}.`,
    );
    const teamsByPlayers = new Map<number, BenchTeam[]>();
    for (const players of scenario.sweepAllCompositions ? [1, 2, 3, 4] : [2, 3, 4]) {
      teamsByPlayers.set(players, benchTeams(players, scenario.sweepAllCompositions));
    }
    const groups = new Map<string, BotRunSummary[]>();

    for (const [players, teams] of teamsByPlayers) {
      for (let teamIndex = 0; teamIndex < teams.length; teamIndex++) {
        const team = teams[teamIndex];
        if (!team) throw new Error(`Missing benchmark team ${teamIndex}`);
        for (const policy of policies) {
          const results: BotRunSummary[] = [];
          for (let seed = seedStart; seed < seedStart + seedCount; seed++) {
            const roles = rotateForSeed(team.roles, seed - seedStart + teamIndex);
            const summary = runBots(scenario.level, seed, players, {
              roles,
              assignmentPolicy: policy,
            });
            results.push(summary);
            rawRuns.push({ scenario: scenario.id, policy, roles, seed, summary });
          }
          groups.set(`${players}|${teamKey(team.roles)}|${policy}`, results);
        }
      }
    }

    for (const [players, teams] of teamsByPlayers) {
      const generalistRoles: RoleId[] = Array.from({ length: players }, () => 'generalist');
      const baselineKey = `${players}|${teamKey(generalistRoles)}`;
      for (const team of teams) {
        const roleKey = `${players}|${teamKey(team.roles)}`;
        for (const policy of policies) {
          const results = groups.get(`${roleKey}|${policy}`);
          const generalists = groups.get(`${baselineKey}|${policy}`);
          const neutral = groups.get(`${roleKey}|role-neutral`);
          const aware = groups.get(`${roleKey}|role-aware`);
          if (!results || !generalists || !neutral || !aware) {
            throw new Error(`Missing paired results for ${scenario.id}/${roleKey}/${policy}`);
          }
          const shipDelta = pairedEstimate(
            results.map((result) => result.shipped),
            generalists.map((result) => result.shipped),
          );
          const scoreDelta = pairedEstimate(
            results.map((result) => result.result.score),
            generalists.map((result) => result.result.score),
          );
          const policyShipDelta = pairedEstimate(
            aware.map((result) => result.shipped),
            neutral.map((result) => result.shipped),
          );
          const policyScoreDelta = pairedEstimate(
            aware.map((result) => result.result.score),
            neutral.map((result) => result.result.score),
          );
          const work = ['code', 'test', 'design', 'review', 'repair'] as const;
          const workTicks = work
            .map((task) => meanOf(results, (result) => result.stationWorkTicks[task]).toFixed(0))
            .join('/');
          const utilization = work
            .map((task) => meanOf(results, (result) => result.stationUtilization[task]).toFixed(1))
            .join('/');
          const domainShipExpire = (['general', 'frontend', 'backend', 'infra', 'mixed'] as const)
            .map(
              (domain) =>
                `${meanOf(results, (result) => result.shippedByDomain[domain]).toFixed(1)}/` +
                meanOf(results, (result) => result.expiredByDomain[domain]).toFixed(1),
            )
            .join(',');
          const maxQueue =
            `${meanOf(results, (result) => result.maxQueueLength.feature).toFixed(1)}/` +
            meanOf(results, (result) => result.maxQueueLength.bug).toFixed(1);
          const label = team.name.replaceAll('+', '/');
          console.log(
            `  ${String(players)}p ${label.padEnd(21)} ${policy.padEnd(12)} ` +
              `ship ${meanOf(results, (result) => result.shipped).toFixed(1)} ΔG ${formatEstimate(shipDelta)} ` +
              `score ${meanOf(results, (result) => result.result.score).toFixed(1)} ΔG ${formatEstimate(scoreDelta, 1)} ` +
              `policyΔ ship/score ${formatEstimate(policyShipDelta)}/${formatEstimate(policyScoreDelta, 1)} ` +
              `expired ${meanOf(results, (result) => result.expired).toFixed(1)} ` +
              `(inc ${meanOf(results, (result) => result.expiredIncidents).toFixed(1)}) ` +
              `domain ship/expire[G/FE/BE/IF/MX] ${domainShipExpire} ` +
              `stars ${meanOf(results, (result) => result.result.stars).toFixed(2)} ` +
              `meetings attended/missed ` +
              `${meanOf(results, (result) => result.meetingsAttended).toFixed(1)}/` +
              `${meanOf(results, (result) => result.meetingsMissed).toFixed(1)} ` +
              `created/open ${meanOf(results, (result) => result.ordersCreated).toFixed(1)}/` +
              `${meanOf(results, (result) => result.openOrdersAtEnd).toFixed(1)} ` +
              `work[code/test/design/review/repair] ${workTicks} ` +
              `station-util%[code/test/design/review/repair] ${utilization} travel/idle/queue-wait ` +
              `${meanOf(results, (result) => result.travelTicks).toFixed(0)}/` +
              `${meanOf(results, (result) => result.idleTicks).toFixed(0)}/` +
              `${meanOf(results, (result) => result.queueWaitTicks).toFixed(0)} ` +
              `handovers ${meanOf(results, (result) => result.handovers).toFixed(1)} maxQ ${maxQueue}`,
          );
        }
      }
    }
  }
  if (jsonPath) {
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          seeds: { count: seedCount, first: seedStart },
          scenarios: scenarios.map(({ id, level }) => ({
            id,
            levelId: level.id,
            durationTicks: level.durationTicks,
            orderSchedule: level.orderSchedule,
            designShare: level.designShare ?? 0,
            fullstackShare: level.fullstackShare ?? 0,
            pairing: level.pairing ?? false,
            incidents: level.incidents,
            meetings: level.meetings,
            domainSchedule: level.domainSchedule,
          })),
          runs: rawRuns,
        },
        null,
        2,
      ),
    );
    console.log(`Raw per-seed runs written to ${jsonPath}`);
  }
}

if (roleBench) {
  runRoleBench();
} else if (roleLab) {
  runRoleLab();
} else if (levelId === 'all') {
  console.log(`${bots} bot(s), ${runs} run(s) per level`);
  for (const level of LEVELS) runLevel(level, false);
} else {
  const level = levelById(levelId);
  if (!level) throw new Error(`No level '${levelId}'; try ${LEVELS.map((l) => l.id).join(', ')}`);
  runLevel(level, true);
}
