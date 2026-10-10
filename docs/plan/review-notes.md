# Review notes for phases 10 to 12

Open questions, decisions made without you, and issues found while the phases were built by agents. Review these with the PRs.

## How to review this stack

Three stacked PRs, each on top of the one before:

1. #14 Phase 10: game flow and save data (base `main`)
2. #15 Phase 11: campaign (base `phase-10-game-flow`)
3. Phase 12: music, onboarding and transitions (base `phase-11-campaign`)

Merge in that order, rebase-merge only (no squash, no merge commits). After #14 merges, GitHub retargets #15 to `main`; after #15, the phase 12 PR. If a retarget doesn't happen by itself, change the base to `main` before merging.

What to playtest (all on phase 12, which has everything):

- From a fresh save (clear site data): title → lobby with two keyboards (Enter twice) → Garage. Does the intro card make sense, can someone new get through the first level with only the card and the hints? (The one box left unticked.)
- Listen: menu music after the first key press, Garage track in the round, faster in the last 30 s, quieter in the pause menu, menu track on the results. Sound and music volume in the settings, after a reload.
- Countdown "3, 2, 1, Ship it!": try pressing buttons or pausing during it (nothing should happen).
- Results: stars filling in one by one with a chime (needs a round with stars).
- On the TV: text size at 1080p, player hats readable from the couch.
- With a gamepad (never tested by the agents): menus, joining, playing, and whether music starts without touching the keyboard.
- Campaign (phase 11): a chapter or two with colleagues; balance of the new mechanics.

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

Decisions:

- Music: CC0 tracks from OpenGameArt (Kenney has no music loops, only jingles). Menu "Swingshot" (Haley Halcyon), Garage "Keep your dream alive!" (congusbongus), Startup "Upbeat Chiptune Theme" (nihilocrat), Scale-Up "Utopia" and Enterprise "March" from MatiasVME's Chiptune Loops. All .ogg as published, 4.6 MB together; listed in `CREDITS.md` (which also shows on the credits screen). Picked by name, description and length: **the agent could not listen to them**, so swap any that don't fit. The candidates are downloaded into the git-ignored `music-candidates/` (re-download from the pages in `CREDITS.md`).
- "Swingshot" has an intro: its page gives a loop point at 11.36 s. We loop the whole file, so the intro plays again every loop. Looping from the loop point needs Web Audio `loopStart`, which Phaser's sound API doesn't expose.
- Music plays: nothing on the title until a button press (browsers unlock audio on a gesture), the menu track on menus and the results, the chapter's track from the intro card to the end of the round, ducked to 30 % while paused (also in the settings opened from the pause menu). In the last 30 s the level track plays at 1.15x (Phaser `setRate`, so the pitch goes up too, arcade style). Tracks cross-fade over 0.6 s. All numbers in `balance.ts` (`MUSIC_*`); per-track loudness in `src/render/music.ts`, like the sound volumes in `sounds.ts`.
- Music and sound volume are independent: the sound volume is now applied per effect instead of on Phaser's global volume. Music volume 0–10, default 6, in the save as `settings.musicVolume`. Saves without it (or without `tutorialDone`) get the defaults; `SAVE_VERSION` stays 1, nothing else was migrated.
- All music is preloaded with the rest at boot, so the first load waits for 4.6 MB more. Fine on localhost; on a slow connection the title shows a few seconds later. Lazy loading per chapter is possible later.
- New flow screens `intro` and `countdown` before `playing`. The intro shows when a level is picked (level select, Next level); Restart and Retry skip it and go straight to the countdown. Any joined player skips it with confirm; back on the intro returns to the level select. The countdown is 3 × 0.7 s and ignores every press, including pause; the round starts on "Ship it!", which then fades over the map. The round is created behind the intro card (the map, players and clock at 3:00 show through) but doesn't tick.
- Intro card: chapter and level ("Garage · Level 1-1"), name, blurb, the recipes for this level and player count (Feature, Feature with review when reviews apply, Bug fix, Hotfix on incident levels) as station letters in their colors, and for the levels that teach something (The Garage: basics; Open Plan: throwing; Down the Hall: reviews; Seed Round: incidents; Middle Management: the manager; Back to Back: meetings) one line and a procedural SVG picture. The Garage card also lists the buttons for keyboard and gamepad. Texts in `content.ts`.
- First-level hints: labels with bobbing arrows over the inbox, the keyboard and the ship hatch, all at once, on the Garage only, while `tutorialDone` is false. Each goes once used: inbox on the first pickup (`pickedUp` event), keyboard on any code progress (there's no work event, so this reads the state), ship on the first `orderShipped`. When all three are used, `tutorialDone` is saved and they never show again. Leaving the round earlier shows all three again next time. Pure in `src/flow/hints.ts`.
- Transitions: every screen fades in (CSS, 250 ms), the map fades in from black when a scene (re)starts. No fade-out before a screen goes: that would need the flow to wait for animations.
- Results stars: empty stars fill in gold one by one (0.45 s, then every 0.4 s) with the `ship` chime for each.
- Accessibility: each player wears a white hat on top of their capsule: 1 circle, 2 cone, 3 square, 4 diamond. The lobby slots and meeting invite cards show the same shape on the player's color. The UI scales with the window height (root font size 16px at 720p, 24px at 1080p, all CSS sizes in rem); the smallest texts went up a step (order kind, invite title, lobby device, chapter blurbs, pause hint). The tight level select layout from phase 11 (was only for screens under 800px high) now always applies, since with the scaling every screen has the room of a 720p one.

Issues / not verified:

- "Someone who has never played gets through the first level without being told what to do" is left for you.
- The agent can't hear: music was checked through the network panel (all five tracks load) and by hooking Phaser's sound calls in devtools: the Garage track plays in the round and switches to 1.15x at 0:30, the menu track takes over on the results, the volume drops to 30 % in the pause menu and follows the music volume setting. Whether the tracks sound good, loop cleanly, or are balanced against each other is untested.
- The hat is hidden behind a carried ticket (tickets are drawn over the head), so while carrying, only the color and the target outline tell players apart.
- Gamepad-only: browsers don't count gamepad buttons as a user gesture, so with only a gamepad the audio context stays locked (no music or sound) until someone clicks or presses a key. Same as phase 10.
- Browser checks ran with the pane hidden (`requestAnimationFrame` throttled), using a `setTimeout` shim and synthetic key events from devtools; nothing in the code. Checked at 1280x720 and 1920x1080: title → lobby (badges) → level select → Garage intro card → countdown 3/2/1/Ship it! → hints over inbox, keyboard and ship hatch; picking up a ticket removed the inbox hint and coding removed the keyboard hint; pause ducks the music; settings music volume persisted after a reload; Retry skipped the intro; Back to Back intro and an invite card with the player badge. The results stars were checked by setting a round result from devtools (3 stars filled in with three chimes). Shipping a ticket to finish the hints and `tutorialDone` was only covered by tests.
- No console errors from the game; only the Vite dev server reconnect noise.
- `npm run sim -- --level=all` gives the same scores as before phase 12.
