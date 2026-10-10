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

## Phase 12
