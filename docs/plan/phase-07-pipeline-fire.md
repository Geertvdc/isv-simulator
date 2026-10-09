# Phase 7: Pipeline failure and fire

**Goal:** the first source of real panic: forget a finished build and the office catches fire.

## Level format

- New map char `E`: rollback extinguisher. It starts on that tile (a counter) and can be picked up and put down like a ticket

## Sim

- A finished build left in the pipeline for longer than `PIPELINE_FAIL_TICKS` fails: the ticket is destroyed and the pipeline catches fire. A warning state (`PIPELINE_WARN_TICKS` before failing) lets the render flash
- Fire on a tile: the tile can't be used, and anything on it is destroyed when it catches fire
- Spread: every `FIRE_SPREAD_TICKS` each burning tile may set fire to adjacent counters and stations (seeded chance `FIRE_SPREAD_CHANCE`). Walls and floor don't burn
- Extinguishing: hold work while carrying the extinguisher and facing a burning tile; it goes out after `EXTINGUISH_TICKS` of spraying. Progress decays slowly when you stop
- A burning pipeline is usable again once extinguished

## Render

- Warning flash on a pipeline about to fail
- Placeholder fire on burning tiles, spray effect from the extinguisher

## Tests

- Timing: warning and failure ticks, a build picked up in time never fails
- Spread: only to adjacent counters and stations, deterministic per seed, never to walls or floor
- Fire destroys tickets on burning tiles
- Extinguishing: needs the extinguisher, needs the work button, takes `EXTINGUISH_TICKS`, the tile works again afterwards
- The extinguisher follows the same carry rules as tickets

## Done when

- [ ] Ignoring a finished build causes a fire that spreads if nobody acts
- [ ] Putting it out is possible but costs enough time to hurt the score
- [ ] `npm run check` passes
