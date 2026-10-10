# Phase 11: Campaign

**Goal:** enough levels and variety to play a whole evening, following a company from garage to enterprise.

## Structure

- Chapters, each a stage of the company and 3 levels long: **Garage** (the three levels we have), **Startup**, **Scale-Up**, **Enterprise**. About 12 levels in total
- Each chapter brings in one new mechanic: its first level teaches it on a calm layout, the other two combine it with what came before
- Level select becomes a chapter view: chapters left/right, levels up/down. A chapter opens with a total number of stars (`CHAPTER_STAR_GATES` in `balance.ts`), on top of the per-level unlock from phase 10
- Level names, blurbs and chapter names in `src/sim/content.ts`; the current `scale-up` level may need a new id or chapter once the chapter exists

## New mechanics (pick three at the start of this phase)

Candidates, each a small sim feature with tests:

- **Production incident**: a red order that appears without warning, has a short timer and blocks all new feature orders until it ships
- **Meetings**: a calendar invite pops up for one player; they have to walk to the meeting room and stand there for a few seconds or lose points
- **Flaky tests**: a test bench that sometimes fails a step halfway, so the ticket needs testing again
- **Merge conflicts**: some orders need two tickets combined at a merge station before the pipeline
- **Moving obstacles**: a cleaning robot or a wandering manager that blocks paths and shoves players
- **Coffee**: working slows down over the level; a coffee machine speeds a player up again

## Online-ready rule

Everything new follows the architecture rules, so phase 13 (online) stays possible: no new randomness outside `rng.ts`, nothing outside the per-tick input commands and `applyCommand`, and `GameState` stays plain JSON.

## Tests

- Each new mechanic, like earlier phases
- Every level parses and the bot run gets at least 1 star on it (bots learn the new mechanics where needed)
- Determinism: for every level, two runs with the same seed and inputs end in the same state, and that state survives `JSON.parse(JSON.stringify(state))`
- Chapter gates and the chapter view's cursor

## Done when

- [ ] All chapters playable from the level select, each new mechanic taught by its first level
- [ ] A group of 3 to 4 colleagues plays through a chapter and wants to keep going
- [ ] `npm run check` passes
