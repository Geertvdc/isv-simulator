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
