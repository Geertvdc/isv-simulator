# Phase 11: Campaign

**Goal:** enough levels and variety to play a whole evening, following a company from garage to enterprise.

## Structure

- Chapters, each a stage of the company and 3 levels long: **Garage** (the three levels we have), **Startup**, **Scale-Up**, **Enterprise**. About 12 levels in total
- Each chapter brings in one new mechanic: its first level teaches it on a calm layout, the other two combine it with what came before
- Level select becomes a chapter view: chapters left/right, levels up/down. A chapter opens with a total number of stars (`CHAPTER_STAR_GATES` in `balance.ts`), on top of the per-level unlock from phase 10
- Level names, blurbs and chapter names in `src/sim/content.ts`; the current `scale-up` level may need a new id or chapter once the chapter exists

## New mechanics (chosen)

Three picked from the candidate list (production incident, meetings, wandering manager); flaky tests, merge conflicts and coffee stay on the shelf. Global numbers live in `balance.ts`, per-level schedules in `levels.ts` next to the order schedule, text in `content.ts`.

### Startup: production incident

- A level may have an `incidents` schedule: `{ firstTick, intervalTicks, jitterTicks, timeLimitTicks }`, `null` on levels without incidents (no RNG rolls then, so older levels keep their order sequence).
- When an incident is due and none is open, an **incident order** opens (red card, "INCIDENT") with a short timer, and its hotfix ticket lands in the **bug queue** (`B`), where it is handed out before any bug. No new map letter needed.
- Hotfix steps: `code` then `pipeline` (no time to test). Ships like any order: `INCIDENT_POINTS` (20) plus the usual speed bonus; running out costs `INCIDENT_EXPIRED_PENALTY` (30). Shipping a hotfix rolls for a bug like any other ticket.
- While an incident order is open **no new feature orders open** (the feature timer waits; open orders keep ticking, bugs still land). The HUD shows a "features on hold" banner.
- An incident never opens with less than its time limit left in the level. One schedule for any number of players.

### Scale-Up: wandering manager

- Map letter `M`: a floor tile where a manager starts. Levels may have any number.
- A manager picks a random floor tile (seeded RNG), walks there tile by tile (BFS over floor, `MANAGER_SPEED` 2 tiles/s), stands still for 1 to 3 s (`MANAGER_PAUSE_MIN_TICKS`..`MAX`), picks the next one.
- The manager is a circle (`MANAGER_RADIUS`) that players can't push: players are pushed out of it (and back out of walls). When it walks into a player it **shoves** them (`MANAGER_SHOVE_SPEED`, at most once per `MANAGER_BUMP_COOLDOWN_TICKS`), with a `managerBumped` event and a "Got a minute?" popup. Dashing into it stops the dash.
- A player pinned between a wall and the manager stops it; after `MANAGER_STUCK_TICKS` of not moving it picks another target.
- State: `managers: Manager[]` with position, path, wait and cooldown ticks. Plain JSON.

### Enterprise: meetings

- Map letter `m`: a meeting room floor tile (walkable, drawn as a rug). `LevelMap.meetingTiles` lists them; in `tiles` they are plain floor so movement and throwing don't change.
- A level may have a `meetings` schedule: `{ firstTick, intervalTicks, jitterTicks, timeLimitTicks, attendTicks }`. The interval scales with the order rate for the number of players.
- When due, a **calendar invite** goes to a random player (seeded) who has none. They must stand on a meeting tile for `attendTicks` (4 s) in total before the invite expires (20 s). Stepping out keeps the time already sat. Done: `meetingAttended` event, no points. Missed: `MEETING_MISSED_PENALTY` (15) and a `meetingMissed` event.
- Shown in the HUD (a card per invite in the player's color with time left and a progress bar) and in the world (a calendar icon over the invited player, meeting tiles highlighted while someone is invited).

### Bots

- Take incident tickets first (then bugs, then features).
- Plan paths around managers (tiles a manager stands on or walks to next are blocked for planning).
- An invited bot drops what it's doing (keeps carrying) and walks to the nearest meeting tile until the invite is done.

## Levels

About 14x10 like the Garage levels, each with its own wall/floor look (`LEVEL_LOOKS` in `GameScene`).

| Chapter    | Level id                          | Name                                        | Mechanics                                                          |
| ---------- | --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Garage     | `garage`, `open-plan`, `scale-up` | The Garage, Open Plan Office, Down the Hall | as before (the old "The Scale-Up" keeps its id for saves, renamed) |
| Startup    | `seed-round`                      | Seed Round                                  | teaches incidents, calm layout                                     |
|            | `demo-day`                        | Demo Day                                    | incidents + throwing over a counter wall + reviews                 |
|            | `on-call`                         | On Call                                     | incidents + reviews + long walks                                   |
| Scale-Up   | `middle-management`               | Middle Management                           | teaches the manager, calm layout                                   |
|            | `hypergrowth`                     | Hypergrowth                                 | manager + incidents                                                |
|            | `hot-desking`                     | Hot Desking                                 | two managers + incidents + reviews                                 |
| Enterprise | `back-to-back`                    | Back to Back                                | teaches meetings, calm layout                                      |
|            | `synergy`                         | Synergy                                     | meetings + manager + incidents                                     |
|            | `the-reorg`                       | The Reorg                                   | everything                                                         |

Chapter gates (`CHAPTER_STAR_GATES`, total best stars): Garage 0, Startup 4, Scale-Up 9, Enterprise 13. Reachable with 1 to 2 stars per level. Star thresholds tuned with `npm run sim`.

## Chapter view

- Level select shows four chapter columns with their levels stacked. Left/right moves to the same row of the next chapter, up/down within a chapter. The cursor can rest on locked levels and chapters to read what opens them.
- A level is open when the per-level rule holds (previous level has 1 star, across chapters too) and its chapter's gate is met. "Next level" on the results follows the same rule; the results say "Chapter unlocked!" when the round opened a new chapter.
- `FlowContext.chapters` carries the chapter structure into the flow; `isUnlocked` checks gates.

## Steps

1. Plan (this section).
2. Incidents: sim, tests, HUD card and banner.
3. Manager: sim, tests, renderer.
4. Meetings: sim, tests, HUD and renderer.
5. Bots learn all three.
6. Chapters, gates and the new levels with maps, looks, content; Garage rename.
7. Chapter view in flow and level select.
8. Tuning with `npm run sim`, determinism tests, browser checks, review notes.

## Online-ready rule

Everything new follows the architecture rules, so phase 13 (online) stays possible: no new randomness outside `rng.ts`, nothing outside the per-tick input commands and `applyCommand`, and `GameState` stays plain JSON.

## Tests

- Each new mechanic, like earlier phases
- Every level parses and the bot run gets at least 1 star on it (bots learn the new mechanics where needed)
- Determinism: for every level, two runs with the same seed and inputs end in the same state, and that state survives `JSON.parse(JSON.stringify(state))`
- Chapter gates and the chapter view's cursor

## Done when

- [x] All chapters playable from the level select, each new mechanic taught by its first level
- [ ] A group of 3 to 4 colleagues plays through a chapter and wants to keep going
- [x] `npm run check` passes
