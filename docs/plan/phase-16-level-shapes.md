# Phase 16: Level shapes

**Goal:** levels that aren't rectangles, with places you can only reach by throwing and tickets that travel on their own. Part of [phases 15 to 18](phase-15-18-overview.md).

## New map tiles

| Char            | Tile       | Walk | Throw over                                 | What it is                                                                                                                                                                                                                              |
| --------------- | ---------- | ---- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ` ` (space)     | `void`     | no   | yes, and a ticket that stops there is lost | Outside the office: lets a map have any outline (L shapes, islands, notches). Drawn as nothing (3D: the surroundings show).                                                                                                             |
| `~`             | `gap`      | no   | yes, and a ticket that stops there is lost | An atrium or stairwell inside the office: splits a level into areas you can only reach by throwing. Drawn with a glass railing and a drop.                                                                                              |
| `>` `<` `^` `v` | `conveyor` | no   | lands on it like a counter                 | A belt (the "message queue"): a ticket put on it moves one tile every `CONVEYOR_TICKS` along its arrow, onto the next conveyor, counter or station if that's free; it waits when the next one is full. Picking up works like a counter. |

## Sim

- `level.ts`: the new chars; `Tile` gets `void`, `gap` and `conveyor`; `LevelMap.conveyors` holds each belt's direction (plain data). `isSolid` stays "everything but floor".
- `throw.ts`: flying over `gap` and `void` like floor (they don't stop a throw), but a throw that ends over one drops the ticket into it: it's gone (`ticketLost` event), like the bin.
- `conveyor.ts`: `updateConveyors(state)` moves tickets along belts, deterministically (belts processed in a fixed order, the front of a chain first so a full belt moves as one).
- `interact.ts`: conveyors take and give tickets like counters.
- `path.ts` and `bot.ts`: unchanged (bots only play the old levels; see the review notes).
- `PROTOCOL_VERSION` goes up: maps can hold the new tiles.

## Rendering

- 2D: void is not drawn; gap a dark tile with a railing edge; conveyors a belt with an arrow.
- 3D: void leaves the slab out (the slab follows the map's outline, so a level is an L or an island); gap is a hole in the slab with a glass railing and a view down; conveyor a belt with moving stripes, rollers and arrows. Tickets glide between belt tiles.
- Overlays: an arrow on each belt end.

## Tests

- Parsing the new chars, conveyor directions, uneven outlines
- A throw flies over a gap and lands on the far counter; one that stops over a gap or void is lost
- Conveyors: a ticket moves along a chain and onto a station at the end; waits when the next tile is full; a chain moves as one; picking up and putting down
- Determinism: same inputs, same state

## Scenes

`gap-throw`, `conveyor` (for docs and review).

## Done when

- [ ] A level can be any outline and have areas reachable only by throwing
- [ ] Conveyors move tickets and can be loaded and emptied by players
- [ ] 2D and 3D draw everything
- [ ] `npm run check` passes
