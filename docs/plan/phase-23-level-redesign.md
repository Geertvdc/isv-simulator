# Phase 23: Level redesign

**Status:** in progress. Layer 1 (this file, `maps/drafts/`, the sketch and report tools) is in; the draft maps come chapter by chapter in the next layers, Garage first. Nothing in the game changes until the greybox step.

**Goal:** levels that differ in size and shape (small rooms, big halls, two rooms joined by a hallway where people bump into each other) and a layout play element per chapter, not only furniture placement. Today all 16 campaign maps are the same 14×10 rectangle (Big Tech 16×10) with furniture moved around. Every level must work from 1 to 4 players on one map.

## Confirmed decisions

- Redraw all 16 maps **in place**: same level ids, names, chapter order and what each chapter teaches. Saves keep their stars; star thresholds are retuned.
- **One signature layout gimmick per chapter**, Overcooked style. Per chapter: x-1 teaches the chapter's existing mechanic on a plain layout, x-2 introduces the layout gimmick, x-3 combines.
  - Garage: no new code; the founder's house (tiny garage, kitchen with serving hatch, hallway).
  - Startup: **Spills** (slippery wet-floor / cold-brew zones).
  - Scale-Up: **Lifts** (floors side by side linked by a lift on a cycle; stairwell as slow alternative).
  - Enterprise: **Reorgs** (partition walls and rolling desks shift on a telegraphed schedule).
  - Big Tech: no new code; gaps and belts on a campus with buildings, skybridges and an atrium.
- **One map per level for all player counts**; balance with spawns, station counts, alternative routes and the existing order-rate scaling.
- **Two human gates** before anything ships: (1) this design doc with ASCII maps and rendered images, (2) playable greybox maps in the real game.

## Design rules

Checked per map, partly by `npm run level-report`.

- **Variety:** sizes from ~10×7 to ~22×12; each chapter has a small, a medium and a large map; no two levels share an outline. The fixed auto-fit camera stays; the size cap is checked for readability at 1280×720 in gate 2.
- **Solo:** the full feature loop (inbox → keyboard → test → pipeline → ship) is walkable; P1 spawns near inbox and keyboards; no gimmick ever needs two players.
- **Four players:** at least 2 keyboards everywhere (3–4 on pairing and big levels), 2+ test benches and pipelines from chapter 2; teams split naturally because spawns 3 and 4 sit in the second room.
- **Bumping by design:** every map has one intentional chokepoint (1-wide door or short hallway) where flows cross, plus a second route (longer walk, throw, belt or lift) so 4 players never deadlock. Long 1-wide corridors only with a bypass.
- **Camera:** no tall wall hides a station or a player (interior walls with room behind are already cut down).
- **Bots** can play every level (bot star test, `npm run sim`), so new mechanics need bot support.

## Level concepts

The sketches below turn these into ASCII maps; the concepts may still change in review.

| #   | Level (id)                              | Size (approx) | Shape and rooms                                                                                                                                    | Gimmick in play              | 1p / 4p notes                            |
| --- | --------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------- |
| 1-1 | The Garage (`garage`)                   | 10×7 small    | One single-car garage, roll-up door is the ship hatch, workbench counters                                                                          | none (tutorial)              | Short solo loop; 4p crowding is the joke |
| 1-2 | Open Plan Office (`open-plan`)          | 16×9 medium   | First rented office: open room split by a desk-row divider with one gap and a review island; throw over it                                         | rooms, throwing              | Walk-around exists for solo              |
| 1-3 | Down the Hall (`scale-up`)              | 20×9 large    | Two rooms joined by a long hallway (2 wide, 1-wide doors at both ends); review room at the far end                                                 | hallway bumping              | Spawns 3/4 in far room                   |
| 2-1 | Seed Round (`seed-round`)               | 15×10 medium  | Coworking loft, L-shaped, desk island in the middle, incidents                                                                                     | none new                     | Two pipelines                            |
| 2-2 | Demo Day (`demo-day`)                   | 18×10 large   | Coworking floor + stage hall; a spilled-kombucha lane between them; counter wall with a gap                                                        | **Spills intro**             | Dry detour exists                        |
| 2-3 | On Call (`on-call`)                     | 18×11 large   | Night shift: ring corridor round a server room, freshly mopped (wet) corridor sections; two ways round                                             | Spills + long walks          | Ring gives 4p two directions             |
| 3-1 | Middle Management (`middle-management`) | 18×11 large   | Biggest single open floor so far, wide aisles, one manager                                                                                         | none new                     | Room for 4                               |
| 3-2 | Hypergrowth (`hypergrowth`)             | 21×10 large   | Two floors side by side (islands): ground (inbox, ship, pipelines) and first (keyboards, tests), one lift + a long 1-wide stairwell; manager rides | **Lifts intro**              | Solo waits for the lift or takes stairs  |
| 3-3 | Hot Desking (`hot-desking`)             | 22×11 large   | Two floors of desk rows, two lifts (express + local), two managers, reviews                                                                        | Lifts + managers             | Second lift relieves 4p queue            |
| 4-1 | Back to Back (`back-to-back`)           | 20×10 large   | HQ: long corridor with offices off it and a glass meeting room; calm meetings                                                                      | hallway bumping              | Corridor 2 wide                          |
| 4-2 | Synergy (`synergy`)                     | 18×11 large   | Meeting room up a corridor; partitions fold away / close on a schedule (opens a shortcut, then shuts it)                                           | **Reorg intro** (partitions) | Always one open route                    |
| 4-3 | The Reorg (`the-reorg`)                 | 20×12 large   | Whole floor reorganises twice per round: partitions slide, rolling desks move (with their tickets); everything on                                  | Reorgs, finale               | Telegraphed 3 s ahead                    |
| 5-1 | The Atrium (`the-atrium`)               | 20×11 large   | Two buildings across an atrium, a 1-wide skybridge, belt bridges                                                                                   | gaps, belts                  | Skybridge + walk-round for solo          |
| 5-2 | Design Sprint (`design-sprint`)         | 18×10 medium  | Small cosy design studio (whiteboards) joined by a hallway to a big engineering hall built for pairing                                             | design, pairing              | Studio fits 2                            |
| 5-3 | Monorepo (`monorepo`)                   | 22×10 large   | FE building and BE building with the merge "integration room" between them, reached by two corridors; belt across                                  | merge, gaps, belts           | Teams split FE/BE                        |
| 5-4 | Hackathon (`hackathon`)                 | 22×12 large   | Big hall with a belt loop + side rooms; everything at once (optionally one partition shift as a callback)                                          | everything                   | Many routes                              |

## Gimmick specs

Each is built later with a lab level, tests, 3D, bots and an intro card.

- **Spills** (`_` wet floor): per-tile traction multiplier on accel/decel in `movement.ts` (tunables in `balance.ts`); players slide and overshoot; prediction uses the same rule. 3D: glossy puddle and a wet-floor sign. Bots: path cost, no special logic.
- **Lifts** (`L` cabin tiles, paired by id/order): plain-data lift state in `GameState` (which floor, doors open/closed, timer); players (and what they carry) standing in the cabin when it departs arrive on the paired cabin; capacity by cabin size; the manager can ride. 3D: glass cabin, doors, floor indicator. Bots: the path graph gets lift edges with an expected wait. Tests: cycle timing, carry, capacity, push-out, determinism.
- **Reorgs** (`=` partition, rolling counter marks and a phase schedule in the level settings): `GameState` holds the current layout phase; `getTile` reads the live tile; a shift is telegraphed (stripes and a countdown) then applied; players inside a closing tile are pushed out; tickets on rolling desks move with them; stations never move. 3D: sliding partitions, rolling desks. Bots: replan on a shift. Tests: schedule, push-out, ticket carry, determinism, reachability in every phase.
- Online: protocol version bump (new tiles and state); `verify:prediction` covers spills and lifts.

## Tools

Draft maps live in [`maps/drafts/`](../../maps/drafts/README.md), one `<level-id>.txt` per level, in the normal map format plus the future chars `_` (wet floor), `L` (lift cabin) and `=` (partition). Until those mechanics exist the tools read `_` and `L` as floor and `=` as wall. The game never loads drafts.

```sh
npm run sketch -- <level-id>         # current and draft side by side -> docs/plan/images/level-redesign/<level-id>.svg
npm run sketch -- --drafts           # every level with a draft
npm run sketch -- --all              # every campaign level
npm run level-report -- <level-id>   # numbers for the current map and its draft
npm run level-report -- --all --table  # the markdown table below
npm run level-report -- --drafts --table
```

The sketch draws every tile type in its own color with a legend, spawns 1–4 numbered in the player colors, belts with arrows, gaps hatched and the void left empty; future chars get their own look (wet floor glossy blue, lift a boxed `L`, partition a dashed wall). Both maps are drawn at the same scale, so sizes compare at a glance.

The report, per map (pure logic in `scripts/mapTools/`, tested):

- **Size** and **floor** (walkable tiles; spawns, manager starts and meeting tiles count as floor).
- **Stations:** tiles per type by map char (`I2` is a 2-tile inbox or two inboxes: two players can use it at once).
- **Solo run:** steps from spawn 1 to the inbox, a keyboard, a test bench, a pipeline and the ship, on the shortest route.
- **Loop:** steps of the shortest round trip inbox → keyboard → test bench → pipeline → ship → back to the same inbox tile: what a solo player walks per feature.
- **Chokepoints** (grid `x,y` from the top-left, 0-based): `cut` is a 1-wide floor tile (or a run of them) whose blocking splits spawns and stations apart; `detour +N` is a 1-wide spot whose blocking makes the loop N steps longer (at least 4 steps and 25%). A standing player is a blocker, so these are where players bump.
- **Reachable:** whether every station can be walked up to from every spawn (throws and belts don't count); otherwise `not <char> x,y` per station.

## Current state (baseline)

`npm run level-report -- --all --table` on the current maps:

| Level                 | Size  | Floor | Stations                   | Solo run | Loop | Chokepoints                                                      | Reachable |
| --------------------- | ----- | ----- | -------------------------- | -------- | ---- | ---------------------------------------------------------------- | --------- |
| 1-1 The Garage        | 14×10 | 85    | I1 B1 K2 T2 P1 S1 X1       | 24       | 32   | none                                                             | all       |
| 1-2 Open Plan Office  | 14×10 | 89    | I2 B1 K2 T2 R1 P2 S2 X1    | 37       | 50   | cut 6,8                                                          | all       |
| 1-3 Down the Hall     | 14×10 | 81    | I2 B1 K2 T2 R1 P2 S2 X1    | 16       | 28   | none                                                             | all       |
| 2-1 Seed Round        | 14×10 | 76    | I2 B2 K4 T2 P2 S4 X1       | 23       | 30   | none                                                             | all       |
| 2-2 Demo Day          | 14×10 | 85    | I2 B2 K4 T2 R1 P2 S4 X1    | 37       | 52   | none                                                             | all       |
| 2-3 On Call           | 14×10 | 71    | I2 B1 K2 T2 R1 P2 S2 X1    | 28       | 42   | detour 2,1 +38; detour 1,2–1,3 (2) +38; detour 12,2–12,6 (5) +22 | all       |
| 3-1 Middle Management | 14×10 | 74    | I2 B2 K2 T2 P2 S4 X1       | 26       | 32   | none                                                             | all       |
| 3-2 Hypergrowth       | 14×10 | 72    | I2 B2 K2 T2 P2 S4 X1       | 26       | 38   | none                                                             | all       |
| 3-3 Hot Desking       | 14×10 | 76    | I2 B2 K4 T2 R2 P2 S2 X1    | 23       | 34   | none                                                             | all       |
| 4-1 Back to Back      | 14×10 | 74    | I2 B2 K2 T2 P2 S2 X1       | 32       | 38   | none                                                             | all       |
| 4-2 Synergy           | 14×10 | 82    | I2 B2 K2 T2 P2 S4 X1       | 23       | 36   | none                                                             | all       |
| 4-3 The Reorg         | 14×10 | 82    | I2 B2 K4 T2 R2 P2 S2 X1    | 22       | 32   | none                                                             | all       |
| 5-1 The Atrium        | 16×10 | 85    | I2 B2 K2 T3 P2 S2 X1       | 44       | 52   | cut 6,8–8,8 (3)                                                  | all       |
| 5-2 Design Sprint     | 16×10 | 80    | I2 B1 K4 T2 P2 S2 X1 W4    | 28       | 38   | none                                                             | all       |
| 5-3 Monorepo          | 16×10 | 92    | I2 B1 K6 T3 P2 S2 X1 G1    | 28       | 36   | none                                                             | all       |
| 5-4 Hackathon         | 16×10 | 69    | I2 B2 K4 T4 P2 S2 X1 W2 G1 | 27       | 36   | detour 6,8 +16; detour 9,8–10,8 (2) +16                          | all       |

What it shows: every level is the same 14×10 (Big Tech 16×10) box with 69–92 floor tiles, and a solo loop of 28–52 steps. Twelve of sixteen levels have no chokepoint at all; the four that do have them by accident of furniture (the one gap in Open Plan's divider, On Call's 1-wide side corridors, the walkway under the Atrium, the strip under Hackathon's belt loop). The redesign aims for clearly different sizes and one intended chokepoint with a bypass per map.

## Levels

Each level gets: the draft map, the sketch (current left, draft right), its report row, the intent, and solo and 4-player notes. Gate 1 review comments go under each level.

### Chapter 1: Garage

Layout gimmick: no new code: the founder's house (rooms, serving hatch, hallway). Sketches: _not drawn yet_.

#### 1-1 The Garage (`garage`)

**Concept:** 10×7 small. One single-car garage, roll-up door is the ship hatch, workbench counters. Gimmick: none (tutorial). 1p / 4p: Short solo loop; 4p crowding is the joke.

- **Draft:** `maps/drafts/garage.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/garage.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- garage --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 1-2 Open Plan Office (`open-plan`)

**Concept:** 16×9 medium. First rented office: open room split by a desk-row divider with one gap and a review island; throw over it. Gimmick: rooms, throwing. 1p / 4p: Walk-around exists for solo.

- **Draft:** `maps/drafts/open-plan.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/open-plan.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- open-plan --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 1-3 Down the Hall (`scale-up`)

**Concept:** 20×9 large. Two rooms joined by a long hallway (2 wide, 1-wide doors at both ends); review room at the far end. Gimmick: hallway bumping. 1p / 4p: Spawns 3/4 in far room.

- **Draft:** `maps/drafts/scale-up.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/scale-up.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- scale-up --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

### Chapter 2: Startup

Layout gimmick: **Spills** (`_` wet floor). Sketches: _not drawn yet_.

#### 2-1 Seed Round (`seed-round`)

**Concept:** 15×10 medium. Coworking loft, L-shaped, desk island in the middle, incidents. Gimmick: none new. 1p / 4p: Two pipelines.

- **Draft:** `maps/drafts/seed-round.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/seed-round.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- seed-round --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 2-2 Demo Day (`demo-day`)

**Concept:** 18×10 large. Coworking floor + stage hall; a spilled-kombucha lane between them; counter wall with a gap. Gimmick: **Spills intro**. 1p / 4p: Dry detour exists.

- **Draft:** `maps/drafts/demo-day.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/demo-day.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- demo-day --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 2-3 On Call (`on-call`)

**Concept:** 18×11 large. Night shift: ring corridor round a server room, freshly mopped (wet) corridor sections; two ways round. Gimmick: Spills + long walks. 1p / 4p: Ring gives 4p two directions.

- **Draft:** `maps/drafts/on-call.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/on-call.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- on-call --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

### Chapter 3: Scale-Up

Layout gimmick: **Lifts** (`L` lift cabin). Sketches: _not drawn yet_.

#### 3-1 Middle Management (`middle-management`)

**Concept:** 18×11 large. Biggest single open floor so far, wide aisles, one manager. Gimmick: none new. 1p / 4p: Room for 4.

- **Draft:** `maps/drafts/middle-management.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/middle-management.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- middle-management --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 3-2 Hypergrowth (`hypergrowth`)

**Concept:** 21×10 large. Two floors side by side (islands): ground (inbox, ship, pipelines) and first (keyboards, tests), one lift + a long 1-wide stairwell; manager rides. Gimmick: **Lifts intro**. 1p / 4p: Solo waits for the lift or takes stairs.

- **Draft:** `maps/drafts/hypergrowth.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/hypergrowth.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- hypergrowth --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 3-3 Hot Desking (`hot-desking`)

**Concept:** 22×11 large. Two floors of desk rows, two lifts (express + local), two managers, reviews. Gimmick: Lifts + managers. 1p / 4p: Second lift relieves 4p queue.

- **Draft:** `maps/drafts/hot-desking.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/hot-desking.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- hot-desking --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

### Chapter 4: Enterprise

Layout gimmick: **Reorgs** (`=` partitions, rolling desks). Sketches: _not drawn yet_.

#### 4-1 Back to Back (`back-to-back`)

**Concept:** 20×10 large. HQ: long corridor with offices off it and a glass meeting room; calm meetings. Gimmick: hallway bumping. 1p / 4p: Corridor 2 wide.

- **Draft:** `maps/drafts/back-to-back.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/back-to-back.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- back-to-back --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 4-2 Synergy (`synergy`)

**Concept:** 18×11 large. Meeting room up a corridor; partitions fold away / close on a schedule (opens a shortcut, then shuts it). Gimmick: **Reorg intro** (partitions). 1p / 4p: Always one open route.

- **Draft:** `maps/drafts/synergy.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/synergy.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- synergy --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 4-3 The Reorg (`the-reorg`)

**Concept:** 20×12 large. Whole floor reorganises twice per round: partitions slide, rolling desks move (with their tickets); everything on. Gimmick: Reorgs, finale. 1p / 4p: Telegraphed 3 s ahead.

- **Draft:** `maps/drafts/the-reorg.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/the-reorg.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- the-reorg --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

### Chapter 5: Big Tech

Layout gimmick: no new code: gaps and belts on a campus (buildings, skybridges, an atrium). Sketches: _not drawn yet_.

#### 5-1 The Atrium (`the-atrium`)

**Concept:** 20×11 large. Two buildings across an atrium, a 1-wide skybridge, belt bridges. Gimmick: gaps, belts. 1p / 4p: Skybridge + walk-round for solo.

- **Draft:** `maps/drafts/the-atrium.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/the-atrium.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- the-atrium --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 5-2 Design Sprint (`design-sprint`)

**Concept:** 18×10 medium. Small cosy design studio (whiteboards) joined by a hallway to a big engineering hall built for pairing. Gimmick: design, pairing. 1p / 4p: Studio fits 2.

- **Draft:** `maps/drafts/design-sprint.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/design-sprint.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- design-sprint --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 5-3 Monorepo (`monorepo`)

**Concept:** 22×10 large. FE building and BE building with the merge "integration room" between them, reached by two corridors; belt across. Gimmick: merge, gaps, belts. 1p / 4p: Teams split FE/BE.

- **Draft:** `maps/drafts/monorepo.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/monorepo.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- monorepo --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

#### 5-4 Hackathon (`hackathon`)

**Concept:** 22×12 large. Big hall with a belt loop + side rooms; everything at once (optionally one partition shift as a callback). Gimmick: everything. 1p / 4p: Many routes.

- **Draft:** `maps/drafts/hackathon.txt`: _not drawn yet_
- **Sketch:** _`images/level-redesign/hackathon.svg` (current left, draft right) goes here_
- **Report:** _row from `npm run level-report -- hackathon --table` goes here_
- **Intent:** _what the layout teaches and where players bump_
- **Solo:** _the solo route and how long it is_
- **4 players:** _how the team splits, the chokepoint and its bypass_
- **Review:** _human feedback from gate 1_

## Delivery

Stacked PRs on `main`, one layer per child session, each opening its own PR.

| Layer | Contents                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | This file, `maps/drafts/`, `scripts/mapSketch.ts` and `scripts/levelReport.ts` (npm `sketch`, `level-report`), tests, baseline numbers |
| 2     | Garage sketches: drafts for 1-1, 1-2, 1-3, their images and report rows, intent and 1p/4p notes                                        |
| 3–6   | Startup, Scale-Up, Enterprise and Big Tech sketches, one layer each, after the Garage review                                           |

After gate 1: the greybox loader, the three mechanics (one layer each) and the per-chapter rollout, planned in detail once the sketches are approved.

## Workflow and gates

1. **Design doc (gate 1):** this file with rules, gimmick specs and, per level, an ASCII draft, intent, solo/4p notes and the old-vs-new image. The human reviews and iterates the maps on paper.
2. **Greybox (gate 2a):** DEV-only `?draft=<level-id>` loads a draft map in the real 3D game with the current settings; not-yet-built tiles fall back to stand-ins (wet → floor). `npm run sim` report for 1–4 bots per draft. Couch-test Garage, Startup x-1, Scale-Up x-1, Enterprise x-1 and Big Tech drafts.
3. **Mechanics, one PR each, each gated in its lab level:** spills → lifts → reorgs.
4. **Greybox (gate 2b):** play the gimmick levels (2-2, 2-3, 3-2, 3-3, 4-2, 4-3) with the real mechanics; iterate the drafts.
5. **Rollout per chapter (one PR per chapter):** replace `maps/level-XX`, retune star thresholds for 1–4 players with `npm run sim`, update blurbs, intro cards and hints in `content.ts`, map looks, scenes with hardcoded coordinates (`sceneCatalog.ts`; move mechanic scenes to lab levels), the demo list, `docs/game/levels.md` and `mechanics.md`, the screenshots skill, protocol bump.
6. **Final couch balance pass** with 1, 2, 3 and 4 players.

## Notes and risks

- Bigger maps shrink characters with the fixed fit camera; 22×12 is a soft cap until gate 2 says otherwise.
- 1-wide hallways can jam with soft player push; keep them short and always with a bypass; check in greybox.
- Lifts and reorgs add dynamic state to an otherwise static `LevelMap`; keep it plain JSON and deterministic; movement, interact, throw, conveyor, path and render go through one live-tile accessor.
- Existing `sceneCatalog.ts` scenes and screenshots assume current garage coordinates; they move to lab levels or get recomputed.
- Out of scope: new ticket mechanics, the role/domain rollout (phase 22), world map changes.

## Done when

Gate 1 (design):

- [x] Design doc, `maps/drafts/`, sketch and report tools with tests; baseline numbers for the current maps
- [ ] Garage drafts, images, report rows and notes; reviewed
- [ ] Startup drafts; reviewed
- [ ] Scale-Up drafts; reviewed
- [ ] Enterprise drafts; reviewed
- [ ] Big Tech drafts; reviewed

Gate 2 and rollout get their own boxes once gate 1 is through.
