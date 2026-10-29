/** Every scene, by id: one per level plus the hand-built moments for the docs screenshots. */

import { PIPELINE_FAIL_TICKS, PIPELINE_WARN_TICKS } from './balance';
import { type Level, LEVELS, settingsForPlayers } from './levels';
import { type GameEvent } from './orders';
import { pipelineAt } from './pipeline';
import { type GameState } from './state';
import type { RoleId } from './roles';
import {
  type Scene,
  command,
  fullstackParts,
  give,
  holdWork,
  invite,
  openOrder,
  pressOnce,
  putOn,
  stand,
  standBeside,
  tileAt,
  workOn,
} from './scenes';

// ---- Levels: everyone on their spawn, a few orders in ----

function levelScene(level: Level): Scene {
  return {
    id: `level-${level.id}`,
    levelId: level.id,
    players: 4,
    setup(state) {
      const first = openOrder(state, 'feature', 'Make the logo bigger', { left: 0.6 });
      openOrder(state, 'feature', 'Add dark mode', { left: 0.9 });
      const settings = settingsForPlayers(level, 4);
      if (settings.reviewShare > 0) {
        openOrder(state, 'feature', 'Add AI to it', { review: true, left: 0.95 });
      }
      // Big Tech's orders show what's new there.
      if ((settings.designShare ?? 0) > 0) {
        openOrder(state, 'feature', 'Rethink onboarding', { design: true, left: 0.95 });
      }
      if ((settings.fullstackShare ?? 0) > 0) {
        openOrder(state, 'fullstack', 'Add a checkout', { left: 0.9 });
      }
      give(workOn(first, 1), 1);
    },
    ticks: 1,
  };
}

const has = (type: GameEvent['type']) => (_: GameState, events: readonly GameEvent[]) =>
  events.some((e) => e.type === type);

/** Actual gameplay cast review, including HUD, tickets and the unmodified sim throw. */
function castScene(
  id: string,
  roles: readonly [RoleId, RoleId, RoleId, RoleId],
  moment: 'carry' | 'windup' | 'release' = 'carry',
): Scene {
  return {
    id,
    levelId: 'monorepo',
    players: 4,
    roleByPlayer: { 1: roles[0], 2: roles[1], 3: roles[2], 4: roles[3] },
    setup(state) {
      stand(state, 1, { x: 4, y: 7 }, { x: 0, y: 1 });
      stand(state, 2, { x: 11, y: 7 }, { x: 0, y: 1 });
      stand(state, 3, { x: 2, y: 4 }, { x: 0, y: 1 });
      stand(state, 4, { x: 13, y: 4 }, { x: 0, y: 1 });
      give(workOn(openOrder(state, 'feature', 'Center a div'), 1), 1);
      give(workOn(openOrder(state, 'feature', 'Deploy before lunch'), 1), 2);
      if (moment !== 'carry') {
        stand(state, 1, { x: 6, y: 6 }, { x: 1, y: 0 });
      }
    },
    input: moment === 'carry' ? undefined : (state) => [command(state, 1, { interact: true })],
    ...(moment === 'release'
      ? {
          until: (state: GameState) =>
            state.tickets.some((t) => t.location.kind === 'flying' && t.location.pos.x > 8),
        }
      : { ticks: moment === 'windup' ? 12 : 1 }),
  };
}

// ---- Every scene ----

export const SCENES: readonly Scene[] = [
  ...LEVELS.map(levelScene),
  castScene('cast-mixed', ['generalist', 'frontend', 'backend', 'qa']),
  castScene('cast-platform', ['platform', 'qa', 'frontend', 'backend']),
  castScene('cast-duplicates', ['generalist', 'generalist', 'generalist', 'generalist']),
  castScene('cast-windup', ['platform', 'qa', 'frontend', 'backend'], 'windup'),
  castScene('cast-release', ['platform', 'qa', 'frontend', 'backend'], 'release'),
  {
    id: 'roles-work',
    levelId: 'lab-roles',
    players: 4,
    roleByPlayer: { 1: 'frontend', 2: 'frontend', 3: 'qa', 4: 'platform' },
    setup(state) {
      const keyboard = tileAt(state, 'keyboard', 2);
      putOn(
        workOn(
          openOrder(state, 'feature', 'Center a div', { design: true, domain: 'frontend' }),
          1,
          0.1,
        ),
        keyboard,
      );
      standBeside(state, 1, keyboard, 'above');
      standBeside(state, 2, keyboard, 'below');
      const test = tileAt(state, 'testBench');
      putOn(
        workOn(openOrder(state, 'feature', 'Verify the API', { domain: 'backend' }), 1, 0.1),
        test,
      );
      standBeside(state, 3, test, 'left');
      const at = tileAt(state, 'pipeline');
      const pipeline = pipelineAt(state, at.x, at.y);
      if (!pipeline) throw new Error('Missing role review pipeline');
      pipeline.broken = true;
      standBeside(state, 4, at, 'left');
    },
    input: holdWork(1, 2, 3, 4),
    ticks: 15,
  },

  {
    // The order bar with one of everything, an incident open and an invite out.
    id: 'orders',
    levelId: 'the-reorg',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Center a div', { left: 0.35 });
      openOrder(state, 'feature', 'Add AI to it', { review: true, left: 0.7 });
      openOrder(state, 'bug', 'Bug: Fix login button', { left: 0.55 });
      openOrder(state, 'feature', 'Make it pop', { left: 0.95 });
      openOrder(state, 'incident', "It's DNS", { left: 0.85 });
      invite(state, 2, 'Synergy workshop', 0.7);
    },
    ticks: 1,
  },
  {
    id: 'work-code',
    levelId: 'garage',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Fix typo in README');
      const keyboard = tileAt(state, 'keyboard');
      putOn(workOn(openOrder(state, 'feature', 'Center a div'), 0, 0.3), keyboard);
      standBeside(state, 1, keyboard);
    },
    input: holdWork(1),
    ticks: 30,
  },
  {
    id: 'work-test',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const bench = tileAt(state, 'testBench');
      putOn(workOn(openOrder(state, 'feature', 'Add dark mode'), 1, 0.3), bench);
      standBeside(state, 2, bench);
    },
    input: holdWork(2),
    ticks: 30,
  },
  {
    id: 'pipeline-build',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const pipeline = tileAt(state, 'pipeline');
      putOn(workOn(openOrder(state, 'feature', 'Bump dependencies'), 2, 0.55), pipeline);
      stand(state, 1, { x: pipeline.x - 3, y: pipeline.y }, { x: -1, y: 0 });
    },
    ticks: 1,
  },
  {
    // Two players hold work at the review station at the end of the hall.
    id: 'review',
    levelId: 'scale-up',
    players: 2,
    setup(state) {
      const review = tileAt(state, 'review');
      const ticket = openOrder(state, 'feature', 'Add AI to it', { review: true });
      putOn(workOn(ticket, 1, 0.3), review);
      standBeside(state, 1, review, 'left');
      standBeside(state, 2, review, 'right');
    },
    input: holdWork(1, 2),
    ticks: 30,
  },
  {
    // A finished build two seconds into its warning.
    id: 'pipeline-warning',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const at = tileAt(state, 'pipeline');
      putOn(workOn(openOrder(state, 'feature', 'Support Internet Explorer'), 3), at);
      const pipeline = pipelineAt(state, at.x, at.y);
      if (pipeline) pipeline.doneTicks = PIPELINE_FAIL_TICKS - PIPELINE_WARN_TICKS + 90;
    },
    ticks: 30,
  },
  {
    id: 'pipeline-broken',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const at = tileAt(state, 'pipeline');
      putOn(workOn(openOrder(state, 'feature', 'Support Internet Explorer'), 3), at);
      const pipeline = pipelineAt(state, at.x, at.y);
      if (pipeline) pipeline.doneTicks = PIPELINE_FAIL_TICKS - 5;
    },
    until: has('pipelineBroke'),
  },
  {
    // The build is out; a player holds work at the empty broken pipeline.
    id: 'pipeline-repair',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const at = tileAt(state, 'pipeline');
      const pipeline = pipelineAt(state, at.x, at.y);
      if (pipeline) {
        pipeline.broken = true;
        pipeline.repair = 0.2;
      }
      standBeside(state, 2, at);
      const ticket = workOn(openOrder(state, 'feature', 'Support Internet Explorer'), 3);
      give(ticket, 1);
      stand(state, 1, { x: at.x - 2, y: at.y + 1 }, { x: 1, y: 0 });
    },
    input: holdWork(2),
    until: (state) => state.pipelines.some((p) => p.broken && p.repair >= 0.5),
  },
  {
    id: 'ship',
    levelId: 'garage',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Add dark mode', { left: 0.4 });
      const ticket = workOn(openOrder(state, 'feature', 'Center a div', { left: 0.9 }), 3);
      give(ticket, 1);
      standBeside(state, 1, tileAt(state, 'ship'));
    },
    input: pressOnce(1),
    until: has('orderShipped'),
  },
  {
    // Tests skipped: code and pipeline done, the test never touched.
    id: 'yolo',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const ticket = openOrder(state, 'feature', 'Make it pop', { left: 0.9 });
      ticket.steps.forEach((s) => (s.progress = s.kind === 'test' ? 0 : 1));
      give(ticket, 1);
      standBeside(state, 1, tileAt(state, 'ship'));
    },
    input: pressOnce(1),
    until: has('orderShipped'),
  },
  {
    id: 'bug-queue',
    levelId: 'garage',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Rename variable x', { left: 0.5 });
      openOrder(state, 'bug', 'Bug: Make it pop', { left: 0.6 });
      openOrder(state, 'bug', 'Bug: Center a div', { left: 0.95 });
      stand(state, 1, { x: 6, y: 2 }, { x: 1, y: -1 });
    },
    ticks: 1,
  },
  {
    // Reproducing a bug: its first step is a test.
    id: 'bug-reproduce',
    levelId: 'garage',
    players: 2,
    setup(state) {
      const bench = tileAt(state, 'testBench');
      putOn(workOn(openOrder(state, 'bug', 'Bug: Fix login button'), 0, 0.3), bench);
      standBeside(state, 1, bench);
    },
    input: holdWork(1),
    ticks: 30,
  },
  {
    id: 'incident',
    levelId: 'seed-round',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Upgrade to YAML 2', { left: 0.6 });
      openOrder(state, 'incident', 'Prod is down', { left: 0.9 });
    },
    ticks: 1,
  },
  {
    id: 'hotfix',
    levelId: 'seed-round',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Upgrade to YAML 2', { left: 0.5 });
      const keyboard = tileAt(state, 'keyboard');
      putOn(
        workOn(openOrder(state, 'incident', 'Database on fire', { left: 0.7 }), 0, 0.3),
        keyboard,
      );
      standBeside(state, 1, keyboard);
    },
    input: holdWork(1),
    ticks: 30,
  },
  {
    // The counter in the wall is full, so the ticket sails over it to player 2.
    id: 'throw',
    levelId: 'open-plan',
    players: 2,
    setup(state) {
      const y = 3;
      putOn(openOrder(state, 'feature', 'Fix flaky test'), { x: 6, y });
      give(workOn(openOrder(state, 'feature', 'Add dark mode'), 1), 1);
      stand(state, 1, { x: 4, y }, { x: 1, y: 0 });
      stand(state, 2, { x: 8, y }, { x: -1, y: 0 });
    },
    input: (state) => [command(state, 1, { interact: true })],
    until: (state) =>
      state.tickets.some((t) => t.location.kind === 'flying' && t.location.pos.x > 6.6),
  },
  {
    // Sketching the feature at the whiteboard before anyone codes it.
    id: 'design',
    levelId: 'lab-dev',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Onboarding wizard', { design: true, left: 0.7 });
      const board = tileAt(state, 'whiteboard');
      putOn(workOn(openOrder(state, 'feature', 'Settings page', { design: true }), 0, 0.3), board);
      standBeside(state, 1, board);
    },
    input: holdWork(1),
    ticks: 40,
  },
  {
    // The back end lands on the merge station next to its front end: one full-stack ticket.
    id: 'merge',
    levelId: 'lab-dev',
    players: 2,
    setup(state) {
      openOrder(state, 'fullstack', 'Checkout flow', { left: 0.75 });
      const [front, back] = fullstackParts(state);
      const merge = tileAt(state, 'merge');
      putOn(workOn(front, 1), merge);
      give(workOn(back, 1), 1);
      stand(state, 1, { x: merge.x, y: merge.y - 1 }, { x: 0, y: 1 });
      stand(state, 2, { x: merge.x + 2, y: merge.y + 1 }, { x: -1, y: 0 });
    },
    input: pressOnce(1),
    until: has('merged'),
  },
  {
    // Two players at one keyboard, pair programming: it codes faster.
    id: 'pairing',
    levelId: 'lab-dev',
    players: 2,
    setup(state) {
      const keyboard = tileAt(state, 'keyboard', 2);
      putOn(workOn(openOrder(state, 'feature', 'Rewrite it in Rust'), 0, 0.2), keyboard);
      stand(state, 1, { x: keyboard.x, y: keyboard.y - 1 }, { x: 0, y: 1 });
      stand(state, 2, { x: keyboard.x, y: keyboard.y + 1 }, { x: 0, y: -1 });
    },
    input: holdWork(1, 2),
    ticks: 40,
  },
  {
    // The test benches are across the atrium: player 1 throws the coded ticket over the gap.
    id: 'gap-throw',
    levelId: 'lab-shapes',
    players: 2,
    setup(state) {
      give(workOn(openOrder(state, 'feature', 'Ship the new onboarding'), 1), 1);
      stand(state, 1, { x: 10, y: 5 }, { x: 1, y: 0 });
      stand(state, 2, { x: 14, y: 5 }, { x: -1, y: 0 });
    },
    input: (state) => [command(state, 1, { interact: true })],
    until: (state) =>
      state.tickets.some((t) => t.location.kind === 'flying' && t.location.pos.x > 12),
  },
  {
    // The conveyor bridge carries tickets across the atrium to the test side.
    id: 'conveyor',
    levelId: 'lab-shapes',
    players: 2,
    setup(state) {
      putOn(workOn(openOrder(state, 'feature', 'Add SSO'), 1), { x: 7, y: 3 });
      putOn(workOn(openOrder(state, 'feature', 'Dark mode, again'), 1), { x: 10, y: 3 });
      stand(state, 1, { x: 6, y: 2 }, { x: 0, y: 1 });
      stand(state, 2, { x: 14, y: 3 }, { x: -1, y: 0 });
    },
    ticks: 50,
  },
  {
    // The manager walks along the row, straight into player 1.
    id: 'manager',
    levelId: 'middle-management',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Remove console.log');
      const manager = state.managers[0];
      if (!manager) throw new Error('No manager');
      manager.pos = { x: 8, y: 7 };
      manager.facing = { x: -1, y: 0 };
      manager.waitTicks = 0;
      manager.path = [6, 5, 4, 3, 2].map((x) => ({ x, y: 7 }));
      give(workOn(openOrder(state, 'feature', 'Undo the last fix'), 1), 1);
      stand(state, 1, { x: 4, y: 7 }, { x: 1, y: 0 });
    },
    until: has('managerBumped'),
  },
  {
    id: 'meeting-invite',
    levelId: 'back-to-back',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Update copyright year');
      invite(state, 1, 'Mandatory fun', 0.9);
      stand(state, 1, { x: 6, y: 6 }, { x: 1, y: 0 });
    },
    input: (state) => [command(state, 1, { move: { x: 1, y: 0 } })],
    ticks: 12,
  },
  {
    // Halfway through the meeting, still holding a ticket.
    id: 'meeting-room',
    levelId: 'back-to-back',
    players: 2,
    setup(state) {
      openOrder(state, 'feature', 'Update copyright year');
      const room = state.level.meetingTiles[2];
      if (!room) throw new Error('No meeting room');
      invite(state, 1, 'Roadmap brainstorm', 0.6).attendedTicks = 100;
      give(workOn(openOrder(state, 'feature', 'Migrate to the cloud'), 1), 1);
      stand(state, 1, room, { x: 0, y: 1 });
    },
    ticks: 20,
  },
  {
    // The last ticks of a good round: the results screen follows.
    id: 'results',
    levelId: 'garage',
    players: 2,
    setup(state) {
      state.tick = state.settings.durationTicks - 2;
      state.score = 312;
    },
    until: (state) => state.result !== null,
  },
];

export function sceneById(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}
