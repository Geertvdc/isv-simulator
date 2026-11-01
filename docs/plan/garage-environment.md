# Garage environment pass

**Status:** in progress. One level (`garage`, 1-1) gets a hand-built world, as a pilot for the other 15.

**Goal:** the world around the level tells a story, the way Overcooked 2 levels do, instead of rows of random props on a flat green plane. Render only (`src/render/`); the sim, maps and balance don't change.

## What Overcooked does that we don't

Looking at Overcooked 2 (the mine and the circus tent):

1. **The frame is full.** Scenery runs edge to edge at several heights; there is no flat plane fading into a dark void. Props cluster, stack and overlap (hay bales piled two high, crates on crates) instead of standing one by one with gaps.
2. **The room's edge is made of the setting.** Mine-cart rails and timber beams, hay bales tied with rope: not a generic wall in a theme colour.
3. **Surfaces carry material and wear.** Planks of varying colour with cracks and nails, loose cobbles scattered over dirt, patches. Our floor and walls are flat colour with a faint checker.
4. **One place, one story.** The mine has miners eating at tables right where the dishes go out; the circus has its tent, ring and stalls. Every prop belongs to that place. Ours are a mix of "garage-ish" things spread evenly.
5. **Light does the composition.** Warm key light, local light sources (lanterns, torches, glowing crystals), darker edges, so the eye lands on the kitchen.
6. **The outside connects to the play.** The serving hatch leads to the diners. Inputs come from somewhere you can see.

## The story: The Garage

> Two founders have taken over Mom's garage on a quiet suburban street. It's a late-summer afternoon. The family car got evicted to the driveway, the house is right behind the garage, and the neighbourhood carries on as if nothing world-changing is happening.

Read from the fixed front camera (top of screen = back of the level):

- **Back (top of screen): the house.** The garage's back wall is the house wall: the inbox is the door into the house (tickets come from the kitchen, Mom brings "feature requests"). Behind it the house rises: siding, a window with warm light, a roof edge, a gutter and downpipe. Low enough that it never hides a station (camera rule from phase 23), tall enough to close the top of the frame.
- **Front (bottom of screen): the driveway and street.** The ship hatch is the roll-up garage door. In front of it a concrete driveway runs to the sidewalk and the street (curb, asphalt, a painted line, a drain). The family car stands on the driveway, pushed out; a basketball hoop over the door; the mailbox at the curb. Everything near the camera stays low so it never covers the play area.
- **Left: the side yard.** Wheelie bins (one overflowing with pizza boxes and energy-drink cans), a side gate, garden hose reel, lawn mower, a hedge.
- **Right: the neighbour's.** A wooden fence on the property line, the neighbour's lawn with a sprinkler, flower bed, the dog kennel, a tree.
- **Life:** a neighbour mowing or watering, the cat on the car roof, maybe a kid on a bike passing in the street. Few, readable, never near the players.
- **Inside the garage:** painted cinder-block or drywall walls with a pegboard of tools, shelves of paint tins and boxes, the garage-door rails on the ceiling line, a strip light or bare bulbs, extension cords. Sealed concrete floor with expansion joints and an oil stain where the car used to be. Counters can read as doors on sawhorses or a workbench, if it stays readable as a counter.
- **Light:** golden-hour sun from the back left, long soft shadows, warm interior bulbs, a dusk-blue sky colour at the frame edges instead of the menu navy, and the ground fading out softly rather than ending.

## Rules

- Architecture rules in `AGENTS.md` hold: nothing in `src/sim/`, every model built in code in `src/render/three/`, deterministic (no `Math.random`; use `tileHash`/salts like `surroundings.ts`).
- **Readability first:** stations keep their signature colours and stay the brightest, most saturated things on screen. Scenery is darker/desaturated (the surroundings already use dimmed materials). No tall scenery between the camera and the floor.
- **Works for both maps:** the shipped `maps/level-01-garage.txt` (14×10) and the redesign draft `maps/drafts/garage.txt` (10×7, `?draft=garage`). Place the scene relative to the level's outline and its ship/inbox tiles, never at hard-coded coordinates.
- **Performance:** merge static geometry per material (as `surroundings.ts` does), instance repeats, no new shadow-casting lights; `low` quality must still run.
- **Other levels unchanged:** everything is keyed on `MapLook.scene === 'garage'` (or the garage setting). `?scene=none` shows the old rows for comparison.
- Tests next to code for the pure parts (placement: deterministic, nothing on the slab, nothing tall in front of the level, fits both maps).

## Work split (round 1)

| Track     | Owns                                                                                                                                               | Delivers                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **World** | `surroundings.ts` (+test), new `scenes/`, new `setDressing/suburb.ts`, `setDressing/garage.ts`, the `Surroundings` line in `ThreeRoundRenderer.ts` | The authored outside: house, driveway, street, side yard, neighbour, ground surfaces, scene people                             |
| **Room**  | `roomModels.ts`, `mapLook.ts` themes, `FLOOR_COLORS`/`WALL_COLORS` in `look.ts`, `setDressing/wallTops.ts`, `layout.ts`, `MapView.ts`, counters    | Garage walls and floor (material, wear, pegboard, door rails), roll-up door at the ship hatch, house door at the inbox, lights |
| **Light** | `createLights` and light constants in `look.ts`, `stage.ts`, new `atmosphere.ts`, the lights line in `ThreeRoundRenderer.ts`, `WorldFx.ts`         | Per-scene light preset (golden hour), sky/background colour, edge falloff (fog or vignette), local warm lights                 |

Round 2: a critic compares screenshots against the Overcooked references and this brief; its feedback is split into new chunks.

## Done when

- [ ] The garage screenshot reads as "a garage at the back of a house on a suburban street" without explanation.
- [ ] No flat empty ground and no dark void visible in the 1440×810 frame.
- [ ] Stations and players read at a glance; nothing hides them.
- [ ] Works on the shipped map and the `?draft=garage` map.
- [ ] `npm run check` passes; other levels look as before.
