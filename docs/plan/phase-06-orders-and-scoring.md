# Phase 6: Orders and scoring (playable core loop)

**Goal:** a full 3-minute level you can win with 1 to 3 stars. After this phase the game is playable.

## Level settings

- A level is an ASCII map plus settings, in `src/sim/levels.ts`: `id`, `name`, `map`, `durationTicks` (3 minutes), `orderSchedule`, `starThresholds: [one, two, three]`
- `orderSchedule`: when orders appear (e.g. a list of tick offsets, or an interval with seeded jitter) and their time limit

## Sim

- Order: `id`, `steps` (`code`, `test`, `pipeline` for now), `createdTick`, `expiresTick`
- Pipeline (`P`): put a ticket in that has `code` and `test` done; it builds on its own for `PIPELINE_BUILD_TICKS` (no work button needed). Pick it up when done; `pipeline` is then complete
- Ship (`S`): put down a ticket with all steps done to deliver it. It completes the matching order with the least time left. A ticket that matches no order, or isn't finished, is refused (stays in hand)
- Score: `ORDER_POINTS` per order plus a speed bonus for time left; `EXPIRED_PENALTY` when an order runs out (the order is removed)
- Level timer: when `durationTicks` is reached the level ends; `state.result = { score, stars }`
- Events (`orderCreated`, `orderShipped`, `orderExpired`, `levelEnded`) for the render and UI to react to

## UI

- Order bar at the top: one card per order with its steps and a draining timer bar, flashing when nearly expired
- Score and level timer
- End screen: score, 1 to 3 stars, restart (A or Enter)

## Tools for tuning

- `npm run sim`: headless run (e.g. with `vite-node`) of a scripted bot run on a level with a fixed seed. Bots walk the shortest path to each station and do the work. Prints orders shipped, expired, score and stars, to sanity-check level timing and star thresholds

## Tests

- Order creation follows the schedule; expiry removes the order and applies the penalty
- Pipeline: refuses unfinished tickets, builds on its own timer, completes the step
- Ship: completes the order with the least time left, refuses unfinished tickets and tickets with no matching order
- Scoring: base points and speed bonus
- Level end at `durationTicks`, star thresholds
- Scenario test: the bot run on the garage with a fixed seed earns at least 1 star

## Out of scope

Pipeline failure and fire, review station, dash and throwing.

## Done when

- [ ] Two players can play the garage start to finish and get a score with stars
- [ ] A tight 3-star run needs real teamwork; a sloppy run still gets 1 star
- [ ] `npm run sim` prints sensible numbers
- [ ] `npm run check` passes
