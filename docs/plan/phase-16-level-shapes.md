# Phase 16: Level shapes

**Goal:** levels that aren't rectangles, with places you can only reach by throwing and tickets that travel on their own. Part of [phases 15 to 18](phase-15-18-overview.md).

## New map tiles

| Char            | Tile       | Walk | Throw over                                                                  | What it is                                                                                                                                                                                                                              |
| --------------- | ---------- | ---- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ` ` (space)     | `void`     | no   | yes, and a ticket that stops there is lost (back to its queue, work undone) | Outside the office: lets a map have any outline (L shapes, islands, notches). Drawn as nothing (3D: the surroundings show).                                                                                                             |
| `~`             | `gap`      | no   | yes, and a ticket that stops there is lost                                  | An atrium or stairwell inside the office: splits a level into areas you can only reach by throwing. Drawn with a glass railing and a drop.                                                                                              |
| `>` `<` `^` `v` | `conveyor` | no   | lands on it like a counter                                                  | A belt (the "message queue"): a ticket put on it moves one tile every `CONVEYOR_TICKS` along its arrow, onto the next conveyor, counter or station if that's free; it waits when the next one is full. Picking up works like a counter. |

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

- [x] A level can be any outline and have areas reachable only by throwing
- [x] Conveyors move tickets and can be loaded and emptied by players
- [x] 2D and 3D draw everything
- [x] `npm run check` passes

## Implementation

- `src/sim/level.ts`: tiles `void`, `gap`, `conveyor`; `LevelMap.conveyors`; `isDrop`, `isBlock`, `conveyorAt`; `BlockTile` for things drawn as a block.
- `src/sim/conveyor.ts`: `Belt` state per conveyor tile (`GameState.belts`), `updateConveyors` (repeated passes so a full line moves as one, each ticket at most a tile a tick), `beltProgress` for drawing.
- `src/sim/throw.ts` and `tickets.loseTicket`: flights cross drops; coming down over one, or flying off the map, sends the ticket back to its queue with its work undone (`ticketLost`, popup "git reset --hard").
- `maps/lab-shapes.txt` and `LAB_LEVELS`: a level outside the campaign (L-shaped, split by an atrium gap, a conveyor bridge) for the `gap-throw` and `conveyor` scenes; `GameScene` loads a scene's own level.
- 2D: the void isn't drawn, gaps are dark with a railing, belts are blocks with a chevron. 3D: the slab follows the outline, gaps are shafts with a lower floor and glass railings, belts have hazard rails and a stripe texture that runs toward their arrow; tickets glide along. The ground outside goes round the level, never under it.
- `PROTOCOL_VERSION` 5.

## Review round 1 fixes

- **Regression fixed:** a throw that crosses a station on the map's edge (ship, inbox, a full counter) and leaves the map drops back on the last floor, as before; only a ticket leaving over the void or a gap is lost. A test throws from every floor tile of every campaign level in every direction and checks none is lost.
- **Belts:** the timer belongs to the ticket on the tile (a fresh one starts from 0); the longest-waiting ticket moves first and tiles freed by the one ahead go to whoever waited longest, so merging belts take turns; a full loop turns all at once instead of jamming. A belt must point at something that takes tickets (another belt, a counter or a station), or the map doesn't parse.
- **Lost tickets** also pop "Back in the backlog" over their queue.
- **2D gaps** show a lower floor (apart from the dark void), a shadow under the far edge and a thicker railing with posts. **3D belts** glide middle to middle and stop short of a taken tile.
- More tests: belts in every direction, a loop, merging belts, a belt into a pipeline, a ticket's own time on a tile.

## Review round 2 fixes

3D tickets on belts only stop short when they will really wait (`beltWaits`: the tile ahead won't take them, or the belt ahead waits too); a full line or loop glides on. A ticket leaving the map is reported where it left, and lands on that tile when it's floor. Tests for `beltWaits` and a side belt feeding a loop with one free tile. Two review rounds done; left over: `BELT_TAKERS` in `level.ts` repeats what `interact.ts` takes (kept apart to avoid an import cycle), and online the belt glide steps at the snapshot rate.
