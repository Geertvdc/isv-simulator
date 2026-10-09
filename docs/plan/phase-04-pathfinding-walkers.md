# Phase 4: Pathfinding and walkers

**Goal:** tickets walk in, queue at the reception desk and leave. Nothing gets processed yet.

## Sim

- `findPath(state, from, to): Tile[] | null`: A*, 4-directional, Manhattan heuristic, deterministic tie-breaks, uses `canStep`
- Recompute paths when `layoutVersion` changes
- Movement: entities have a tile position plus progress along the current step; `WALK_SPEED` (tiles per second) in `balance.ts`
- Spawner: every `SPAWN_INTERVAL` ticks (with seeded jitter) a ticket appears at `E` with a random problem from `content.ts`: YAML Fever, Works-On-My-Machine Syndrome, Legacy Monolith Bloat, Friday Deploy Panic, Null Pointer Flu, Dependency Hell. All behave the same for now.
- Queue at a desk is a logical ordered list in the sim. Slot 0 is the service tile; slot k is the k-th tile back along the ticket's path to the service tile.
- This phase only: tickets wait `WAIT_TICKS` at the desk, then walk back to `E` and despawn
- No desk: ticket walks to a random corridor tile, then leaves with event "Customer couldn't find reception"

## Render

- Placeholder people: circle head + rounded body, ticket color orange, small walk bob
- Position interpolated between tiles; depth sorted by screen y, so people walk behind walls correctly
- Hover a ticket to see its problem name
- F3 debug overlay also draws current paths and queue slots

## Tests

- A*: straight line, around walls, only through a door, unreachable returns null, same result twice
- Spawner rate with a fixed seed
- Queue slot assignment and advancement when slot 0 leaves
- Paths update after a layout change

## Done when

- [ ] Tickets walk in, queue, and leave
- [ ] Nobody walks through walls
- [ ] Building a room in their path re-routes them
- [ ] `npm run check` passes
