# Down the Hall environment pass

**Status:** brief. Level 1-3 (`scale-up`, "Down the Hall") gets a hand-built world, after the garage pilot ([garage-environment.md](garage-environment.md)), together with [Open Plan Office](open-plan-environment.md).

**Goal:** the world around the level tells one story, the way Overcooked 2 levels do. Render only (`src/render/`); the sim, maps and balance don't change.

## The story: the biscuit works

> The startup has outgrown Unit 4 and rented two rooms at either end of a shared corridor on the ground floor of an old brick biscuit factory by the canal, now "creative workspace". It's late afternoon going on evening; every ticket has to be carried down the hall past the other tenants (a yoga studio, a craft brewery's office) to get its code review.

Read from the fixed front camera (top of screen = back of the level):

- **Back (top of screen): the warehouse itself.** The level's back wall is the factory's wall: red brick with tall arched windows (warm light in the other tenants' windows), iron tie plates, a hoist beam, and faded painted lettering ("… & SONS BISCUIT WORKS"). Low enough never to hide a back-wall station.
- **Front (bottom of screen): the quay, a thin strip.** Cobbles, an iron mooring bollard, the stone edge of the canal and dark water at the very bottom, with the bow of a moored narrowboat. The ship hatch is the loading-bay door; a courier's cargo bike waits at it. Everything low: the camera shows only about 1.2 tiles in front of the slab.
- **The inbox** is the door from the shared entrance hall (pigeonholes, the post). On the shipped map it is on the **front** edge, on the draft on the **back** edge: place it from the inbox tiles.
- **Between the two rooms (the void tiles by the hallway): a courtyard light well.** Cobbles, a tree in a big planter, a picnic table, a cargo bike, string lights. This is where the maps differ most; it must fill whatever void shape the map has.
- **Left: the yard.** A coffee van with a short queue (scene people, small and posed), stacked pallets, a skip.
- **Right: the next warehouse.** Its brick end wall with a loading dock, pallets and kegs from the brewery, a bike rack.
- **Life:** the coffee-van queue, a brewery worker rolling a keg, a cyclist at the quay. Few, small, posed, never near the players.
- **Inside the rooms:** exposed red brick in courses with a painted white lower band, cast-iron pipes, old wide timber floorboards with knots, a worn path where everyone walks, the corridor with a runner and other tenants' panel doors (signs: yoga, brewery) on its walls. Counters are scaffold boards on black pipe frames. Edison bulbs on wires strung wall to wall along the back.
- **Light:** late afternoon turning to evening: low warm sun from the left (west), a deepening blue sky at the frame edges, warm interior bulbs and quayside lamps beginning to glow. Still bright on the play area (mean luminance about 100).

## The six Overcooked lessons, for this level

| Lesson                                 | Here                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The frame is full, at several heights  | The factory wall and windows at the back, the courtyard tree, the coffee van, the next warehouse   |
| The room's edge is made of the setting | Exposed brick with a painted band, iron pipes, a stone plinth as the foundation                    |
| Surfaces carry material and wear       | Brick coursing, knotted boards worn along the hallway, cobbles, wet stone at the canal             |
| One place, one story                   | A converted factory by the canal at the end of the day: nothing suburban, no car park              |
| Light does the composition             | Low warm sun, blue evening edges, warm bulbs and lamps                                             |
| The outside connects to the play       | Tickets from the entrance hall (inbox), work out through the loading door to the cargo bike (ship) |

## Rules

The rules in the [level-environment skill](../../.agents/skills/level-environment/SKILL.md) hold, plus:

- **Both maps:** the shipped `maps/level-03-scale-up.txt` (16×9, one room with a void notch top right, inbox and ship both on the front edge) and the draft `maps/drafts/scale-up.txt` (20×9, two rooms joined by a hallway with void round it, `?draft=scale-up`). Place everything from the outline, the void tiles and the ship and inbox tiles.
- Other levels keep their look: the new wall and floor themes are used only by `scale-up`.

## Work split (round 1, both levels)

Five agents in one worktree at once, with strict file ownership. The shared plumbing (registries keyed by scene id and wall theme) is done first, so no agent needs `MapView.ts`, `surroundings.ts` or `ThreeRoundRenderer.ts`.

| Track           | Owns                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Room, 1-2**   | `rooms/officePark.ts` (+test), `roomModels/officePark.ts`, `setDressing/officeParkWallTops.ts`, the `officePark`/`carpetTiles` rows in `look.ts` and `mapShape.ts` |
| **Room, 1-3**   | `rooms/warehouse.ts` (+test), `roomModels/warehouse.ts`, `setDressing/warehouseWallTops.ts`, the `warehouse`/`boards` rows in `look.ts` and `mapShape.ts`          |
| **World, 1-2**  | `scenes/openPlan.ts` (+test), `setDressing/businessPark.ts`                                                                                                        |
| **World, 1-3**  | `scenes/downTheHall.ts` (+test), `setDressing/canal.ts`                                                                                                            |
| **Light, both** | `atmosphere.ts` (+test), `stage.ts`, `WorldFx.ts`, `createLights` in `look.ts`                                                                                     |

## Done when

- [ ] The shot reads as "a converted brick warehouse by a canal, two rooms down a shared hall" without explanation.
- [ ] No flat empty ground and no void in the 1440×810 frame.
- [ ] Stations and players read at a glance; nothing hides them.
- [ ] Works on the shipped map and on `?draft=scale-up`.
- [ ] `npm run check` passes; other levels look as before.
