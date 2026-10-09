# Phase 6: Orders and scoring (playable core loop)

**Goal:** a full 3-minute level you can win with 1 to 3 stars. After this phase the game is playable.

## Level settings

- A level is an ASCII map plus settings, in `src/sim/levels.ts`: `id`, `name`, `map`, `durationTicks` (3 minutes), `orderSchedule`, `starThresholds: [one, two, three]`
- `orderSchedule`: when orders appear (e.g. a list of tick offsets, or an interval with seeded jitter) and their time limit

## Sim

- Order: `id`, `kind` (`feature` or `bug`), `title`, `steps`, `createdTick`, `expiresTick`
- Steps are an ordered list and are done in order: a station only works the ticket's first unfinished step. Features need `code`, `test`, `pipeline`; bugs need `test` (reproduce), `code`, `test`, `pipeline`
- `test` steps are optional: a station may skip past unfinished tests to the next required step, so an untested ticket can go through the pipeline and ship. Skipped tests can still be done later
- Two queues, each holding any number of tickets. Taking from a queue tile gives the oldest ticket in that queue; tickets never go back in
  - Inbox (`I`): every new feature order puts its ticket here (this replaces the phase 5 inbox timer)
  - Bug queue (`B`): after each ship there is a chance that a bug comes back: `BUG_CHANCE` (25%) when fully tested, rising linearly with the share of skipped tests to `BUG_CHANCE_UNTESTED` (75%). The bug comes back after `BUG_DELAY_TICKS`. It opens a bug order with a shorter timer than features and puts its ticket in the bug queue. Bugs don't count towards the feature order cap
- When an order expires, one waiting ticket of its kind is removed from its queue (tickets already in progress stay and can serve a later order)
- Pipeline (`P`): put a ticket in that has `code` done (tested or not); it builds on its own for `PIPELINE_BUILD_TICKS` (no work button needed). Pick it up when done; `pipeline` is then complete
- Ship (`S`): put down a ticket with all required steps done to deliver it; the `orderShipped` event says whether tests were skipped. It completes the matching order with the least time left. A ticket that matches no order, or isn't finished, is refused (stays in hand)
- Score: `ORDER_POINTS` per feature order (`BUG_ORDER_POINTS`, 0, per bug fix, so skipping tests doesn't farm points) plus a speed bonus for time left; `EXPIRED_PENALTY` when a feature order runs out and `BUG_EXPIRED_PENALTY` for a bug (the order is removed). The score never drops below 0
- Level timer: when `durationTicks` is reached the level ends; `state.result = { score, stars }`
- Events (`orderCreated`, `orderShipped`, `orderExpired`, `levelEnded`) for the render and UI to react to

## UI

- Order bar at the top: one card per order with its steps and a draining timer bar, flashing when nearly expired; bug orders look different
- Score and level timer; score popups, with a "YOLO!" tag on untested ships
- End screen: score, 1 to 3 stars, restart (A or Enter)

## Tools for tuning

- `npm run sim`: headless run (e.g. with `vite-node`) of a scripted bot run on a level with a fixed seed. Bots walk the shortest path to each station and do the work. `--skip-tests` makes the bots skip all tests. Prints orders shipped, expired, score and stars, to sanity-check level timing and star thresholds

## Tests

- Order creation follows the schedule; expiry removes the order and applies the penalty
- Pipeline: refuses unfinished tickets, builds on its own timer, completes the step
- Ship: completes the order with the least time left, refuses unfinished tickets and tickets with no matching order
- Queues: new orders enqueue their ticket, pick-up takes the oldest; bug chance after shipping, bug order timer and steps
- Scoring: base points and speed bonus, bug points and bug penalty
- Optional tests: untested tickets go through the pipeline and ship; bug chance scales with skipped tests
- Level end at `durationTicks`, star thresholds
- Scenario test: the bot run on the garage with a fixed seed earns at least 1 star

## Out of scope

Pipeline failure and fire, review station, dash and throwing.

## Done when

- [ ] Two players can play the garage start to finish and get a score with stars
- [ ] A tight 3-star run needs real teamwork; a sloppy run still gets 1 star
- [x] `npm run sim` prints sensible numbers
- [x] `npm run check` passes
