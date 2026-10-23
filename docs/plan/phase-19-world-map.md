# Phase 19: the 3D world map and menus

**Goal:** the menus and the level select live in the same 3D world as the rounds. The level select is an Overcooked-style diorama map: a road runs from a garage in a small town, past a startup office park and a growing downtown, to an enterprise city and a Big Tech campus. A moving van drives along the road from level to level; each level is a flag on the road with its number, stars and best score. The title screen shows the same map as a backdrop under the game's new name, **OverEngineered**.

The story the map tells: **startup to enterprise**. You start in a garage on a quiet street and end in a glass tower in a big city. Moving right on the map is moving up in the world.

Gameplay does not change. `src/sim/` is untouched apart from texts in `content.ts`; the server keeps running the same `updateFlow`.

Key decisions are logged in [decisions-19.md](decisions-19.md).

## Reference

Overcooked 1 and 2's world map: a tiled island seen from a high three-quarter camera, a road, level flags with numbers on the ground, a small vehicle you drive between them, a card over the selected level with its stars, a star counter top right, locked areas hidden (clouds, flipped tiles) until you earn them.

## Shape

```
title ──► level select ──► intro ──► round
  │            │
  └── settings, credits, lobby, profile: DOM panels over the map backdrop
```

- `src/flow/worldMap.ts` (pure, like the rest of `flow/`): where every level sits on the map (map-grid coordinates), the road between them as waypoints, where each chapter's region and star gate are, and `mapCursor(ctx, index, x, y)`: the level a direction press drives to. The flow and the server use it; the renderer draws from it.
- `src/render/three/worldMap/`: the map diorama, built in code like the office kit: terrain tiles per chapter region, the road, level flags, set pieces (houses, garage, office park, towers, campus), the van, clouds over locked regions. One `THREE.Scene`, drawn on the shared `Stage`.
- `GameScene` gets a `menuRenderer` option next to `roundRenderer` (same seam, so `GameScene` stays free of three.js and testable in Node). Outside a round (title, lobby, level select, settings, credits, profile, join code) it draws the map instead of the level.
- `src/ui/levelSelect.ts` shrinks to what floats over the map: the selected level's card (number, name, blurb, stars, best score or lock reason), the star total top right, the chapter name banner and the button hint.

## Steps (one stacked PR each)

1. **Plan, decisions, new name on the title screen.** This file, `decisions-19.md`, `GAME_TITLE = 'OverEngineered'`.
2. **Map foundation.** `worldMap.ts` with layout and `mapCursor` (tests), the `menuRenderer` seam, a first diorama: terrain tiles, the road, level flags with numbers, a camera that follows the selected level. The level select shows it with the floating level card; the DOM columns go.
3. **The van.** A small moving van drives along the road waypoints to the selected level (eased, turning with the road, a little bounce); it starts where the cursor is when the screen opens.
4. **Startup to enterprise.** Set pieces per chapter region: Garage (small town, houses, a garage with the door open), Startup (office park, coffee bar, coworking), Scale-Up (downtown blocks, mid-rise offices), Enterprise (city towers, a big HQ with a logo), Big Tech (glass campus, skyscraper). Trees, lamp posts, cars parked; the town grows denser and taller to the right.
5. **Locks and unlocks.** Locked chapters sit under clouds with a road barrier and a "needs N ★" sign at the gate; locked levels have a grey flag. Played levels show their stars on the flag. When a chapter opens (results said so), the clouds roll away the next time the map shows.
6. **3D title and menus.** The title screen shows the map from a high, slow-drifting establishing camera with the **OverEngineered** logo and the menu as a card; Play swoops the camera down to the level select. Settings, credits, lobby, profile and join code become lighter panels over the (dimmed) map instead of solid screens.
7. **Docs and screenshots.** Retake the menu screenshots, update `docs/game`, tick the boxes below.

Each step is built by one agent and then checked by a separate critic agent (type check, lint, tests, screenshots against this plan and the Overcooked references). Critic findings are fixed before the next step starts.

## Tests

- `mapCursor`: every direction from every level lands on a real level; left/right walks the road order; a press with no road that way stays put
- Layout: every level in `LEVELS` has a node, nodes don't overlap, waypoints connect consecutive levels, every chapter has a region and (after the first) a gate
- `GameScene` with a fake `menuRenderer`: it draws the map outside rounds and the level during them
- Existing flow, server and net tests stay green

## Done when

- [ ] The level select is a 3D map; arrows, WASD and the stick drive the van between levels, Enter plays
- [ ] The map tells the startup-to-enterprise story from left to right
- [x] Locked chapters and levels read as locked, with what opens them
- [ ] The title screen is 3D and says OverEngineered
- [ ] Online: the host drives, guests see the van move
- [ ] `npm run check` and `npm run build` pass; screenshots retaken

## Out of scope

- Renaming the repo, package, server or docs to OverEngineered (only the title screen changes)
- Free driving of the van (Overcooked lets you drive anywhere); here it hops node to node
- New levels or chapters
