# Phase 14a: 3D foundation

**Goal:** the level and round can be drawn by three.js behind `?render=3d`, as a greybox, without changing how 2D looks. Part of [phase 14](phase-14-3d-graphics.md).

## Scope

- `src/render/RoundRenderer.ts`: the interface `GameScene` draws a round through (`syncRound`, `render`, `setShake`, `setDebug`, `tileAt`, `setHover`) and its factory type. `GameSceneOptions.roundRenderer` picks the factory; the default is the 2D one.
- `src/render/PhaserRoundRenderer.ts`: today's renderers, camera controller, target highlights and hover outline moved out of `GameScene` unchanged. 2D is pixel-identical (checked with `npm run screenshots` against the commit before).
- `src/render/mapShape.ts`: which walls are cut down (`isFrontWall`, `wallPiece`), shared by 2D and 3D.
- `src/render/projection.ts`: the 3D view as plain math, no three.js: `gridToWorld`, `CameraPose`, `projectPoint`, `pixelsPerUnit`, `screenToGround`, `fitCamera3d`. One tile is one world unit, grid y is world z, the camera pitches down `VIEW3D_PITCH` (56°) with a 28° field of view and no yaw, so screen-relative input is unchanged. The fit keeps pitch and field of view and only moves the camera back and along the floor, and shifts the principal point to the middle of the space between the HUD bands.
- `src/render/three/`: `stage.ts` (one WebGL canvas for the whole game under Phaser's transparent canvas, kept across scene restarts), `layout.ts` (heights and ticket placement in world units, three.js-free), `ThreeRoundRenderer.ts` (greybox: slab, checkered floor, blocks at their heights with letters, capsule players with a nose, managers, ticket cards, target plates, hover outline, one sun with shadows and a sky light).
- `src/main.ts`: `?render=3d` loads the 3D renderer with a dynamic `import()` (three.js is its own ~137 KB gzipped chunk) and makes Phaser's canvas transparent. Phaser still owns the loop, sound, input, the fade and (from 14b) the overlays.
- `scripts/screenshots.ts`: `--render=3d`, `--out=<dir>`, `--width`, `--height`; headless Chrome gets SwiftShader for WebGL.

## Tests

- `projection.test.ts`: grid ↔ world mapping, screen-up is grid-up, floor round trip through `projectPoint` and `screenToGround`, perspective, and the fit at 1920×1080, 1024×768, 3440×1440 and 390×844 (inside the HUD bands, as large as fits, centered)
- `mapShape.test.ts`: wall pieces
- `three/layout.test.ts`: block heights, level box, facing yaw, ticket placement on blocks, in front of a carrier, and queue stacks

## Done when

- [x] Every level shows in 3D as a greybox (`npm run screenshots -- --render=3d --only=levels/`)
- [x] 2D looks exactly as before
- [x] `npm run check` passes
