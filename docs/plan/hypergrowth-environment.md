# Hypergrowth environment pass

**Status:** brief written; round 1 next. Level 3-2 (`hypergrowth`, "Hypergrowth"), the second level of the Scale-Up chapter, gets a hand-built world after [Middle Management](middle-management-environment.md) (3-1), in the same building.

| Before                                          |
| ----------------------------------------------- |
| ![](images/hypergrowth-environment/before.webp) |

**Goal:** the world around the level tells one story, the way Overcooked 2 levels do. Render only (`src/render/`); the sim, maps and balance don't change.

## The story in two sentences

> It's a rainy spring day and YOTTA, flush with the new round's money and a hiring plan ("double the team by summer"), has taken the ground floor and the first floor of the mid-rise from 3-1, joined by one tiny lift, a long stairwell and a mail chute. They hire faster than the desks arrive: the ground floor is full of unopened flat-pack desk boxes and violet welcome balloons, the lift is always full of new starters clutching welcome packs, and outside a delivery van is unloading yet more desk boxes into the rain.

That is the level: tickets arrive in the ground-floor post room (the inbox), go up in the lift to the developers, come back down the mail chute and leave through the loading bay into the rain (the ship hatch). Derek rides the lift.

## Where this sits on the road

See [the storyline](../game/storyline.md#3-2-hypergrowth-hypergrowth). 3-1 Middle Management was one bright, clean, finished floor high up in the mid-rise on a spring morning, with the city small and far below. 3-2 is the **same building, lower down and messier**: the street is right outside the ground floor's loading bay, it's raining, and the fit-out can't keep up with the hiring. 3-3 Hot Desking is three floors on a Friday afternoon with nobody owning a desk, so 3-2 must not show desk-booking or lockers; it sets up the "more people than desks" ending ("someone suggests hot desking").

- **Material:** reuse 3-1's building (plasterboard-and-glass partitions, aluminium head tracks, carpet tiles upstairs) so it reads as the same building, plus what's new here: a **hard ground floor** (front of house: grey-green rubber/vinyl sheet with a walk-off mat at the loading bay and a pale "post room" lino), **the stairwell** (painted concrete block walls, steel nosings on the treads, a handrail), and **the lift** (brushed steel doors, a floor indicator).
- **Light:** a rainy spring day: soft, cool, diffuse daylight from a grey sky outside; inside, the office lights are on and warm-white, so the rooms glow against the wet grey-blue street. Low-contrast shadows. Rain streaks outside only. Mean luminance on the frame about **100+** (before: 92.1, saturation 0.38).
- **Outside:** the street **at ground level** this time (3-1 looked down on it): wet asphalt and pavement with puddles, umbrellas, the delivery van at the loading bay, cherry trees dripping (blossom on the wet pavement), and across the street the **crane tower almost done**, fully clad but for its top floors, the crane still on its roof with the red light.

**Not food, not a kitchen.** No catering, pizza boxes, kegs, fruit, crates or bars. Desk boxes are flat brown cardboard with a printed desk outline and "DESK" or "FLAT-PACK" on the side, never produce crates. Welcome balloons are YOTTA violet and white, a few, tied to box stacks, never a party.

## Read it from the fixed front camera

The map (`maps/level-08-hypergrowth.txt`, 22×12) is two islands. Top of screen = back.

```text
            ##KK#KK###      rows 0-8, x 12-21: FIRST FLOOR (engineering): keyboards back, tests right
            #........#
            #.....3..T
##II#BB##   H........T      H (12,3): the chute's top hatch
#.1...LL#   #LL......#      L: the lift cabins, ground (6-7,4-5) and first (13-14,4-5), facing across the shaft
#.....LL#   #LL..M...#      M: Derek starts upstairs
X.......#   #.....4..#      X (0,6): the bin
#.......H   #........#      H (8,7): the chute's bottom hatch
S.......#   ######.###      S (0,8-9): ship = the loading bay, on the LEFT wall
S.2.....##########.#        (18,8): the first floor's front door, top of the stairs
#..................#        row 10, x 8-18: the long stairwell along the front
####PP##############        P (4-5,11): pipelines on the front wall
```

Voids: the top-left (x 0-11, rows 0-2), **the shaft** (x 9-11, rows 3-8) between the islands, and the front-right corner (x 20-21, rows 9-11).

- **Back of the ground floor (top-left void, x 0-8, rows 0-2): the post room.** The **inbox (2-3, row 3) is the post room's pass-through**: pigeonholes, a franking machine, a mail trolley, grey mail sacks, parcels with labels, a "POST ROOM" sign; tickets arrive with the mail. In it (World), the queue of **new starters**: two or three people in a row holding welcome packs (violet tote bags), one with a balloon, `carrying`/`idle`, smaller and greyer than players, at least 1 tile from the wall. Unopened desk boxes stacked 2-3 high against the post room's walls with a few violet balloons. **HUD:** the order cards cover 0–690 × 0–140, so keep the post room low near its back and put the tall stuff (balloons, box towers) right of x≈700 on screen or low. The bug queue (5-6, row 3) is on the same wall: what's behind it stays low.
- **The shaft (x 9-11, rows 3-8) and above it (x 9-11, rows 0-2): the lift.** The ground cabin and the first-floor cabin face each other across the shaft. Build it as an open lift shaft between the two floors: guide rails, steel cables running up out of the frame to a motor housing, a counterweight, the shaft's dark concrete walls with a pit at the bottom, and the first floor's slab edge. **Segfault rides the lift:** asleep on the roof of the lift car or the counterweight in the shaft, breathing, never on a cabin tile. The lift doors themselves are Room's: the ground floor's wall at (8, 4-5) and the first floor's at (12, 4-5) become brushed-steel lift door frames with a floor indicator (0 and 1) and a call button. **The welcome banner** (the logo gag) hangs over the lift: a violet "WELCOME TO YOTTA" banner on a wire strung across the top of the shaft from the ground floor's wall to the first floor's (Room places it), with a couple of balloons.
- **Left (x < 0): the loading bay out into the rain.** The **ship hatch (0, 8-9) is the loading bay's roller shutter**, open, with yellow-black dock bumpers, a dock leveller plate, a strip curtain and a walk-off mat inside (Room: the wall swap and floor). Outside (World): a dock canopy, wet concrete apron, the **delivery van** backed up to the bay with its doors open and desk boxes inside, a pallet of desk boxes on a pump truck in the rain, a driver `carrying` a box toward the bay (scaled 0.88, greyed, a tile from the room), the street beyond with umbrellas. The bin (0,6) gets a wheelie bin and a cardboard recycling cage overflowing with desk-box cardboard and bubble wrap outside it. The van must be fully in frame and read from above (roof, windscreen, wheels, open rear doors), in a muted colour of its own (white or pale grey, a violet-free courier stripe).
- **Back of the first floor (row < 0, x 12-21) and right (x > 21): upstairs windows and the street.** The first floor is **upstairs**: its back and right edges are the building's outer wall, glass with rain running down it (World: a curtain-wall band like 3-1's `curtainWall`, streaked), and past it the wet street seen from one floor up: umbrellas from above, cherry trees in rows, cars with lights on, a bus. The **crane tower across the street** rises behind, top right, almost finished. The mute button (1370–1440 × 0–60) and the test benches on the right wall (21, 2-3) stay clear.
- **Front (bottom of screen): thin.** The camera shows about 1.2 tiles in front of the slab. Along the ground floor: wet pavement, a doormat, a "WET FLOOR" sign, a couple of umbrellas in a stand, all under 0.6, no people. The front-right void (x 20-21, rows 9-11) is **the landing**: **Prod** in a bigger pot on the stair landing beside the top of the stairs (x ≈ 20, rows 9-10), with a rain-streaked window; keep it under the timer's rect (1320–1440 × 755–810) clear.
- **Inside the room.**
  - **The ground floor (x 1-7, rows 4-10): front of house, mid-move-in.** Hard floor (grey-green rubber or vinyl sheet, slightly glossy), a walk-off mat at the loading bay, wet footprints and trolley tracks from the bay to the lift (placed wear, faint, never under a spawn), a pale lino patch in front of the post room hatch. Walls: 3-1's plasterboard-and-glass partitions. **Wall tops: flat-pack desk boxes**, 2-3 high, in clusters, some with a violet balloon tied on; a box of welcome packs; a stack of chairs still in plastic. The ground floor is the joke's main stage.
  - **The first floor (x 13-20, rows 1-7): engineering.** 3-1's carpet tiles (or a near twin), wall tops with monitors still boxed, a stack of laptops, a desk fan; fewer boxes than downstairs (the desks arrived up here first).
  - **The stairwell (row 10, x 8-18, and x 18, rows 8-9).** A different floor look: concrete treads with steel nosings across the walking direction, reading as a long flight; its walls (row 9, x 9-17, and row 11 from x 8) are painted block with a handrail on the wall top along the front, a "1" floor number stencilled at the top, a green fire-exit sign. It must still read as walkable floor.
  - **The chute (H at 12,3 and 8,7).** The hatches read as a mail chute: a steel hatch flap with "MAIL" and a down arrow plate; `Mechanics.ts` already draws the blinking arrows: keep them.
  - **Wall faces:** **the plan as an onboarding checklist** (a laminated sheet on the ground floor: "DAY 1 · ☑ Laptop · ☐ Desk · 1. Build it 2. ??? 3. Profit"), a "NEW STARTERS THIS WAY ↑" sign by the lift, a "DESKS ARRIVING TUESDAY" note crossed out and rewritten, a wall clock, a fire-exit sign, a floor directory by each lift door ("0 · POST ROOM / LOADING", "1 · ENGINEERING").
  - **Lights:** office linear pendants along the back of each floor only (3-1's), on a wire wall to wall.
- **Light:** overcast spring rain. A high, soft key (about 50°) so walls don't throw hard shadows; a cool grey-blue sky and fog outside; the interior a touch warmer and brighter than the outside; rain streaks as motes over the outside only (never over the play area); puddles that catch the sky. Mean luminance about 100+.
- **Life:** the new starters shifting in the queue, the driver carrying a box, umbrellas bobbing along the street, the van's hazard lights blinking, the crane's red light, rain, Segfault breathing on the lift. Few, small, never near the players.

## Running gags

| Gag             | Where                                                                                                        | Track        |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
| YOTTA's logo    | the "WELCOME TO YOTTA" banner over the lift, strung across the top of the shaft, violet, with a few balloons | Room         |
| Prod            | on the stair landing in the front-right corner (x ≈ 20, rows 9-10), in a bigger pot than 3-1's               | World        |
| Segfault        | riding the lift: asleep on the lift car's roof (or the counterweight) in the shaft, breathing                | World        |
| The crane tower | across the street, top right, almost done: clad to near the top, the crane still on its roof, red light      | World        |
| The plan        | an onboarding checklist on a ground-floor wall face: `1. Build it`, `2. ???`, `3. Profit` under DAY 1 ticks  | Room         |
| Spring rain     | rain streaks outside, puddles, umbrellas, blossom on the wet pavement                                        | World, Light |
| Hypergrowth     | desk boxes everywhere, welcome balloons, new starters with welcome packs, the van unloading more desks       | Room, World  |

All cameos out of the play area, out from under the HUD, small enough to find and never readable as a player.

## The six Overcooked lessons, for this level

| Lesson                                 | Here                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The frame is full, at several heights  | Post room and box towers at the back left, the lift shaft and its cables in the middle, the upstairs glass and crane tower at the back right, the van at the left |
| The room's edge is made of the setting | 3-1's partitions, the loading bay's shutter and dock bumpers, the lift doors, the stairwell's painted block and handrail                                          |
| Surfaces carry material and wear       | Rubber floor with wet footprints and trolley tracks, carpet tiles upstairs, stair treads with nosings, cardboard everywhere                                       |
| One place, one story                   | Two floors of 3-1's building on a rainy day, mid-move-in, hiring faster than the desks arrive. No lockers, no desk booking                                        |
| Light does the composition             | Warm lit rooms against a cool wet street; the lift shaft darker between them; puddles catching the sky                                                            |
| The outside connects to the play       | Tickets come in with the post (inbox), go up the lift and down the chute, and leave by the loading bay past the van (ship)                                        |

## Rules

The rules in the [level-environment skill](../../.agents/skills/level-environment/SKILL.md) hold, plus:

- **One map:** `maps/level-08-hypergrowth.txt` (22×12) is the only map. Place everything from its outline, its void tiles, its lift cabins (`L`), chute hatches (`H`), ship and inbox tiles; never fixed coordinates.
- **The lift and the chute are mechanics.** `Mechanics.ts` draws the cabin plates, floor pips and hatch arrows: no track edits it, nothing covers a cabin tile or a hatch, and nothing hung over the shaft hides a cabin.
- **Derek is the player-sized manager in the play area.** No scene person may look like him (no suits with lanyards).
- **Same building as 3-1.** Reuse `roomModels/midRise.ts`, `setDressing/midRise.ts` and `setDressing/midRiseWallTops.ts` by import (new optional parameters are fine), but their defaults and 3-1's look must not change.
- **No 3-3 props:** no lockers, no desk-booking screens, no "TO LET".
- Value hierarchy: desk boxes are a muted cardboard (about 0xa88a62, darker than every station top), balloons violet but small and few; the rubber floor mid-grey-green (about 0x7d8a84), not white; the stations stay the brightest, most saturated things.
- Other levels keep their look: the new wall theme `lowerFloors` and floor theme `mixedFloors` are used only by `hypergrowth`.

## Work split (round 1)

Three agents in one worktree at once, with strict file ownership. The shared plumbing (stub scene, stub dressing, themes, `LEVEL_LOOKS`) is done first.

| Track     | Owns                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Room**  | `rooms/lowerFloors.ts` (+test), `rooms/lowerFloorsRoom.ts` (+test), `roomModels/lowerFloors.ts`, `setDressing/lowerFloorsWallTops.ts`, the `lowerFloors`/`mixedFloors` rows in `look.ts` and `mapShape.ts` |
| **World** | `scenes/hypergrowth.ts` (+test), `setDressing/hypergrowth.ts`                                                                                                                                              |
| **Light** | `atmosphere.ts` (+test), `stage.ts`, `WorldFx.ts`, `createLights` in `look.ts`                                                                                                                             |

## Done when

- [ ] The shot reads as "a startup's two new floors in the same office building on a rainy day, hiring faster than the desks arrive" without explanation, and nothing in it reads as food or a kitchen.
- [ ] The storyline beat reads with no explanation: the ground floor full of desk boxes and balloons, the lift between the floors, new starters with welcome packs, the van unloading more desks in the rain.
- [ ] The outside connects to the play: tickets come in at the post room, ship out of the loading bay; the lift and the chute look like a lift and a chute.
- [ ] The running gags are in place: the welcome banner over the lift, Prod on the landing, Segfault riding the lift, the crane tower almost done, the onboarding checklist.
- [ ] No flat empty ground and no void in the 1440×810 frame.
- [ ] Stations, players, Derek, the lift cabins and the chute hatches read at a glance; nothing hides them.
- [ ] `npm run check` passes; other levels look as before.
