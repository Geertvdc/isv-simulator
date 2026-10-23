# Phase 14g: 3D only

**Goal:** the game is 3D, full stop. `?render=3d` goes away, the 2D Phaser round renderers and everything that only they use are deleted, and the docs show 3D pictures. New tiles and mechanics get drawn once. **Gameplay does not change:** `src/sim/`, `src/flow/` (except one Settings line), `src/net/` and `server/` stay as they are.

This is the 14g decision from [phase 14](phase-14-3d-graphics.md): 3D is the default, and the 2D round renderers are deleted rather than kept behind a toggle, because every phase since 15 has drawn everything twice.

## What stays

Phaser stays as the app host (scene lifecycle, `update` loop, `GameLoop`, sound and music, scale manager), and its transparent canvas over the three.js one keeps drawing the billboards (ticket cards, progress bars, pipeline badges, meeting invites, hint markers, popups). Dropping Phaser is still out of scope.

The `RoundRenderer` interface stays too. It has only one implementation now, but it is the seam that keeps `GameScene` free of three.js and keeps `GameScene` and `GameLoop` testable in Node.

## What 3D still borrows from the 2D files

These parts of the 2D files are used by the 3D renderer, the HUD or the model sheet, so they move before anything is deleted:

| From                                           | Used by 3D / UI                                                                                  | Moves to                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `MapRenderer.ts`                               | `MapLook`, `WallTheme`, `FloorTheme`, `WALL_THEMES`, `FLOOR_THEMES`, `DEFAULT_LOOK`, `tileColor` | `src/render/mapLook.ts` (plus `LEVEL_LOOKS` and `mapLook()` out of `GameScene.ts`) |
| `TicketRenderer.ts`                            | `drawTicketCard`, `drawProgressBar`, `PAIRING_COLOR`, `isPaired`                                 | `src/render/billboards.ts`                                                         |
| `PipelineRenderer.ts`                          | `drawBadge`                                                                                      | `src/render/billboards.ts`                                                         |
| `MeetingRenderer.ts`                           | `drawInvite`                                                                                     | `src/render/billboards.ts`                                                         |
| `HintRenderer.ts`                              | `HINT_TILES`, `createHintMarker`, `hintLabelOrigin`                                              | `src/render/billboards.ts`                                                         |
| `projection.ts`                                | `screenDirToGrid` (input), `TILE_SIZE` (billboard pixel size), all of the 3D math                | stays; the 2D projection functions go                                              |
| `mapShape.ts`, `effects.ts`, `playerColors.ts` | shared already                                                                                   | stay; prune exports nothing uses afterwards                                        |

`tileColor` is a 2D block color that the HUD recipe letters (`src/ui/game.ts`) and the intro pictures (`src/ui/introPicture.ts`) reuse; it moves as a plain color table, not as part of `BLOCK_STYLES`.

## Steps (one commit each)

1. **Move the shared bits out (no behaviour change).** Create `mapLook.ts` and `billboards.ts` from the table above, repoint the imports in `three/`, `ui/`, `modelSheet/` and `GameScene.ts`. 2D still works after this commit; `npm run check` green.
2. **3D is the only renderer.** In `src/main.ts`: import `createThreeRoundRenderer` statically, always pass it, make the Phaser canvas always `transparent`, ignore `?render=` (an old link still opens the game). Drop the lazy-load comment and the `optimizeDeps` workaround in `vite.config.ts` if the dev server no longer needs it. If WebGL is missing, show a short DOM message ("This game needs WebGL") instead of a blank page; 2D used to cover that through Phaser's Canvas fallback.
3. **Delete the 2D round renderers.** `PhaserRoundRenderer.ts`, `CameraController.ts`, `cameraFit.ts` + test, `EffectsRenderer.ts`, `ManagerRenderer.ts`, `PlayerRenderer.ts`, `MapRenderer.ts`, and what is left of `TicketRenderer.ts`, `PipelineRenderer.ts`, `MeetingRenderer.ts`, `HintRenderer.ts`. In `projection.ts` delete `tileToScreen`, `screenToGrid`, `screenToTile`, `tileCorners`, `tileDepth`, `blockFaces`, `Side`, `VIEW_PITCH`, `VIEW_YAW`; `screenDirToGrid` becomes "normalise the screen direction, screen +y is grid +y" (the 3D camera has no yaw), and its test plus the "screen-up stays grid-up in 3D" test keep pinning rule 12. `GameScene` makes `roundRenderer` a required option. Then grep every remaining export in `src/render/` and delete the ones nothing imports.
4. **Delete the 2D-only assets and tools.** The PixelLab sprites in `public/assets/tiles/`, `walls/`, `floors/` and their `CREDITS.md` entry (the in-game credits screen reads that file); the asset sheet (`assets.html`, `src/assetSheet/`) and `docs/assets.md`, which export 2D placeholders for an artist. `/models.html` is the 3D catalog that replaces it.
5. **Graphics line in Settings.** Phase 14c held this back because it did nothing in 2D: a Low / High (and Auto) quality choice saved in the save's `settings`, read by `three/quality.ts`; `?quality=` keeps working as an override. Save version bump only if the settings shape needs one; a test for loading an old save without the field.
6. **Screenshots and game docs in 3D.** `scripts/screenshots.ts` loses `--render`; delete the 2D pictures, `git mv docs/game/images-3d docs/game/images` so the pages keep their links, delete `docs/game/3d.md` and its row in `docs/game/README.md`. Update the `screenshots` skill (one run, no 2D/3D choice). Retake any shot that changed after steps 2 to 5 (settings screen at least).
7. **Rules and plan text.** `AGENTS.md`: the intro line ("2D with a front-facing 3/4 view" → a 3D office diorama with a fixed front camera), the placeholder-graphics convention (code-built three.js models, not Phaser Graphics), the `screenshots` skill line. `docs/plan/README.md` row 14 and the phase 14 "Done when" box about `?render=2d`; `phase-15-18-overview.md` ("2D and 3D both draw every new tile"). Comments in `RoundRenderer.ts`, `projection.ts` and `ThreeRoundRenderer.ts` that mention `?render=3d` or 2D.

Roughly 2,000 lines of render code, 27 sprite PNGs and one dev page go away.

## Tests

- Existing 3D tests (`projection`, `layout`, `stage`, `pose`, `quality`, `surroundings`, `People`) stay green unchanged
- `screenDirToGrid`: the four screen directions and a diagonal map to the same grid directions as before the rewrite
- `mapLook()`: every level id in `LEVELS` has a look (catches a level added without one)
- Quality setting: old save without it loads as Auto; a chosen value survives a save round trip
- `npm run check`, `npm run build` and `npm run verify:online` pass

## Done when

- [x] `npm run dev` opens the game in 3D with no query string; `?render=2d` and `?render=3d` both just open the game
- [x] No file in `src/` imports a deleted module, and `src/render/` has no 2D drawing code left outside `billboards.ts`
- [x] Every level, mechanic scene and screen still plays and reads the same as `?render=3d` did before this phase (screenshots match)
- [x] Hover tile in debug mode, screen shake, hints and the meeting invite still work
- [x] Settings has a Graphics line, and the choice is kept after a reload
- [x] A browser without WebGL shows the message instead of a blank page
- [x] `docs/game` shows only 3D pictures; `CREDITS.md` lists nothing that is no longer shipped
- [x] `npm run check` and `verify:online` pass

## Out of scope

- Removing Phaser, moving `src/render/three/*` up a folder, or merging `RoundRenderer` into `GameScene`
- New looks, models or effects
- Any gameplay, HUD or online change
