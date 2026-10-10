# Review notes for phases 10 to 12

Open questions, decisions made without you, and issues found while the phases were built by agents. Review these with the PRs.

## Decisions made without you

- Phases 10, 11 and 12 were built back to back by subagents as stacked PRs (10 → main, 11 → 10, 12 → 11). Online multiplayer (13) is not started.
- Pause menu has six entries (Resume, Restart, Settings, Level select, Change players, Quit to title); the spec listed four.
- Back from the lobby returns to the title and clears everyone who joined (instead of only removing the player who pressed back).

## Phase 10

Decisions:

- Menu input: confirm is interact or join (E, right Shift, Enter, gamepad A); back is dash or the new `menu` button (left Shift, right Alt, Escape, gamepad B, Start). Escape is shared by both keyboard schemes, like Enter. Only one confirm/back counts per frame, so one Enter press (which reaches both keyboard schemes) acts once.
- `updateFlow(flow, presses, ctx)` takes a context (save, level ids, `unlockAll`, current time) instead of only the save. It changes `save.settings` in place and returns `saveChanged` / `settingsChanged` effects; the scene writes and applies them.
- "New best!" now means the score beat the best score (it used to be stars). The first finished round on a level always counts as a new best, as before, except a later round with an equal score does not.
- Results: `Next level` only shows when the next level exists and is open. If the round didn't unlock it, the menu is just `Retry` / `Level select`.
- Level select: the cursor can move onto locked levels (so you can read what unlocks them); confirming a locked level does nothing.
- Quit to title clears the lobby (same as back from the lobby). `Change players` (level select back, pause menu) keeps everyone joined.
- Leaving a round (level select, change players, quit) restarts the scene on the same map, so no players or tickets stay standing around under the menus. `InputDevices` now lives for the whole game instead of per scene, otherwise a button held through a scene restart counted as a new press (e.g. starting a level straight from the level select).
- Writing the save keeps fields it doesn't know from a newer version (merged per level and in settings) and never lowers the stored `version`.
- The old `isv-simulator.best-stars` key is migrated once (best stars, score 0, 1 play) and left in place.
- Settings: sound volume 0–10 (Phaser `sound.volume`), screen shake on/off. Defaults 10 and on, in `balance.ts`.
- Credits are parsed from `CREDITS.md` at build time (`?raw`); when they don't fit the screen they roll slowly up and down, since nobody scrolls with a gamepad.
- Title "Press any button" only reacts to game buttons (any mapped key or pad button), not to every key.
- `src/flow/` gets the same lint purity rules as `src/sim/` (no Phaser, no DOM, no `Math.random`, `Date.now`).
- Plan steps 4 (scene) and 5 (screens) landed as one commit; they depend on each other.

Issues / not verified:

- Gamepad-only play was not tested (no gamepad in the agent's browser); the first "Done when" box stays unticked. Keyboard-only was walked: title → settings → credits → lobby → level select → play → pause → settings → resume → change players → level select → play → results → next level.
- Browsers don't count gamepad buttons as a user gesture, so with only a gamepad the audio may stay locked until someone clicks or presses a key. Not something the title screen can fix.
- "Level unlocked!" and earning stars in a real round were only checked by tests (the agent can't play a round well enough to get a star); `Next level` was checked in the browser with `?unlockAll`.
- The agent's browser pane was hidden, which pauses `requestAnimationFrame`; browser checks ran with a `setTimeout` shim injected from devtools (nothing in the code). Very short synthetic key taps (under one frame) are missed; real key presses last longer.
- Credits on small screens (800×600) don't fit and roll; on a TV they fit.

## Phase 11

Decisions:

- Mechanics: production incident (Startup), wandering manager (Scale-Up), meetings (Enterprise). The plan section in `phase-11-campaign.md` has the details and numbers.
- Incidents: the hotfix ticket (code, pipeline; no test step) lands in the existing bug queue and is handed out before any bug, so no new map letter. While an incident order is open no new feature orders open; the feature timer waits and a due feature opens right after. Bugs still land. Scoring: `INCIDENT_POINTS` 20 plus the normal speed bonus, `INCIDENT_EXPIRED_PENALTY` 30. Shipping a hotfix rolls for a bug like any ship. One incident schedule for any number of players (not scaled).
- Ticket locations in a queue now name the queue (`feature` / `bug`) instead of the ticket kind (`QueueKind`, `QUEUE_OF`), since incidents share the bug queue.
- Manager: map letter `M`. Wanders to random floor tiles (seeded), stands 1-3 s, walks at 2.2 tiles/s. Can't be pushed; a walking manager shoves players at most once per second (`managerBumped` event, "Got a minute?" popups, reuses the shove sound). A dash into it stops dead. A pinned player stops it; it gives up after 1.5 s. Its position is interpolated like players (`GameLoop.renderManagerPos`).
- Meetings: map letter `m` (meeting room floor, plain floor in `tiles`, listed in `LevelMap.meetingTiles`). Invites go to a random player without one; 4 s in the room within 20-25 s; time sat counts across stepping out (kinder in the chaos; easy to change to a reset). Missed: -15 (`MEETING_MISSED_PENALTY`), attended: 0 points (like bug fixes, only the miss costs). Invite interval scales with the order rate for the player count.
- Incidents and meetings never start with less than their time limit left in the level, so the last seconds don't hand out unavoidable penalties.
- Levels without incidents, managers or meetings never roll the RNG for them, so the Garage levels' order sequences are unchanged.
- The old "The Scale-Up" level is renamed "Down the Hall" but keeps the id `scale-up` so existing saves still count; no save migration needed. Chapter ids live in a separate namespace from level ids.
- Chapter gates `CHAPTER_STAR_GATES` = 0 / 4 / 9 / 13 total best stars, on top of the 1-star-on-the-previous-level rule (which now also runs across chapters: Level 2-1 needs a star on 1-3 and 4 stars in total).
- Chapter view: four columns. Left/right keeps the row (clamped to the shorter chapter), up/down stays inside the chapter. Cards are "Level 2-1" etc. Locked chapters show "Needs N ★ in total (you have M)". Results show "Chapter unlocked!" when a round met a gate.
- `FlowContext.chapters` is required; flow tests use one level per chapter where the old flat behaviour was tested.
- `npm run sim -- <bots> <runs> --level=all` prints one line per level; star thresholds printed are now the ones scaled for the bot count.
- `findPath` in the bot moved its BFS to `src/sim/path.ts` (shared with the manager).
- The HUD's bottom center holds the incident banner and invite cards (`.hud-alerts`).

Balance (perfect bots, `npm run sim`, 5 seeds; thresholds are the solo numbers, scaled per player count as before):

- New levels' 3-star thresholds sit at about 0.85x the perfect-bot average, like the Garage. With 1 bot the worst seed still gets 2 stars on every level; 2 to 4 bots get 2 to 3 stars everywhere. The Garage and Open Plan numbers did not change.
- Bots handle the new mechanics without much loss (no incident or meeting expired in the runs I looked at), so the mechanics mostly cost humans, not bots. Thresholds may be too high or too low for real players; worth tuning after a playtest.
- The Reorg (everything at once) scores about the same as the other late levels for bots. It is the finale, so it may want a lower 3-star bar after a playtest.

Issues / not verified:

- "A group of colleagues plays through a chapter" is left for you.
- Gamepad play was not tested.
- Browser checks ran with the pane hidden, so `requestAnimationFrame` was paused; I re-ran the page with a `setTimeout` shim and synthetic key events from devtools (nothing in the code). Checked: the chapter view at 1280x720 (locked chapters with gate hints, cursor left/right/up/down, confirming a locked level does nothing), Seed Round (incident card, red hotfix in the bug queue, banner), Middle Management (manager walks, blocks), Back to Back (invite card and calendar icon, walking into the room fills the bar and closes the invite), and every new level loads and renders. No console errors from the game (only Vite reconnect noise while the dev server reloaded).
- A manager bump popup and the "Chapter unlocked!" results badge were only checked by tests, not seen in the browser.
- The bottom-center alerts (incident banner, invite cards) can overlap the bottom row of the map a little on 16:9 screens; the camera only keeps 6% free at the bottom.
- No real art for the manager or the meeting room: procedural placeholders (suit and tie capsule, purple rug with a label). The incident reuses the pipeline-broke sound, invites the build-done sound; new sounds would help.
- With only 9 wall/floor combinations, some of the 12 levels share a look.

## Phase 12
