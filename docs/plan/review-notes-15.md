# Review notes: phases 15 to 18

Decisions made without the product owner, who asked for the work to go ahead on assumptions. Each is something to check when reviewing or playtesting. Newest phase last.

## Overall

- **Building blocks apart, levels together.** Layout features (16) and dev mechanics (17) are separate PRs; they meet in the new chapter (18). See [the overview](phase-15-18-overview.md) for why.
- **The existing 12 levels don't change.** Their maps, balance and star records stay; new ideas come as a fifth chapter, **Big Tech**. Reshaping old levels can follow after playtesting.
- **Bots don't learn the new tricks.** The demo/kiosk bots keep playing the old levels (`DEMO_LEVEL_IDS`). Teaching them to throw across gaps, merge and design is a separate job.
- **Star thresholds for the new levels are estimates**, not tuned with `npm run sim` (the bots can't play them). They're set from the closest old level and the extra walking or throwing. Playtest and adjust.
- **Protocol version goes up** in 16, so an old client and a new server refuse each other instead of failing on an unknown tile.
- **Every new tile is drawn in 2D too**, with placeholders like the rest of 2D, so the new levels are playable without `?render=3d`.

## Phase 15: atmosphere

- **The surroundings are a third darker than the office** (their own dimmed materials), and their screens and signs glow softly instead of blooming, so the eye stays on the play area. No extra "light pool" over the office: the dimming does that job without another light to tune.
- **Background people:** at most 14 per level, only in the near rows, 85% of a player's size, muted hoodies, bare hands (players wear white gloves), no hats. They type at desks, chat and walk the lane behind the office; nobody sits down yet (no sitting pose).
- **No colors of the players outside:** props avoid the player red, blue, yellow and green.
- **Clutter on wall tops** only on some full-height walls, never next to a counter or station and never where it could hide a player behind it; no laptops or sticky notes (they read as things to pick up).
- **No front row** in front of the level: it would sit between the camera and the play.
- **Left after two review rounds:** at 16:9 the side far rows (where the car and other rare props stand) sit at the very edge of the screen, partly cut off; near props at the far ends of the back row can lose their shadow at the edge of the sun's shadow box. Both are cosmetic.

## Phase 16: level shapes

- **A ticket that falls is not destroyed:** it goes back to its queue with all its work undone ("git reset --hard"), so the order can still be met. Harsh enough to teach "don't throw into the atrium", without the order becoming impossible.
- **Flying off the map counts as falling** (only possible through the void: old levels are walled in).
- **Conveyors don't ship or bin:** they hand tickets to counters, stations and other belts. A pipeline at the end of a belt takes a ticket only when it would (ready and not broken), like a player's put-down.
- **Belt speed** is half a second a tile (`CONVEYOR_TICKS`): 2 tiles a second against 5 walking and 12 thrown. A belt is slow; it's worth it where walking or throwing can't go, or to free your hands. The Big Tech levels (18) route belts that way and make atria 2–3 tiles wide, so a throw can come down in one.
- **Belts catch throws** like counters do: a ticket thrown across a belt lands on it.
- **Uneven map rows still fail to parse:** an outline is drawn with spaces, so a map file must keep its trailing spaces (editors that strip them break the map, loudly).
- **A lab level** (`lab-shapes`, not in the level select) shows the features on their own, for scenes and tests, until the Big Tech chapter (18) uses them.
- In 2D, a ticket on a belt jumps from tile to tile (3D glides).

## Phase 17: dev mechanics

- **Both parts of a full-stack feature only need coding** (the plan had the back end tested too): one extra step per part made the merge feel like busywork in the lab level. The merged ticket gets tested as a whole.
- **Any front end merges with any back end**, like a bun with any patty: tracking which pair belongs to which order would be invisible on screen.
- **Full-stack orders** pay 30 (a feature pays 20) and last 1.5× as long: two tickets' work, though they can be coded in parallel.
- **Pairing is a level setting**, not global, so the old levels' balance doesn't change. Two coders go 1.9× as fast, a third adds nothing.
- **"Working" detection for a pair** comes for free: both players show the typing pose. On top, the card over that keyboard swaps its title for a "Pairing ×1.9" label (from `PAIR_RATE / WORK_RATE`).
- **Design takes as long as coding** (`DESIGN_RATE`) but makes the coding after it 1.6× faster, so a designed feature costs about a second more than a plain one.
- **Bots still don't know the new stations:** a bot holding a part would bin it. They only play the old levels (the demo), so this only matters once bots learn the new chapter.
- **Parts look alike from afar** (sky-blue and green folders); an icon on each (`</>` and a database) is a follow-up.
