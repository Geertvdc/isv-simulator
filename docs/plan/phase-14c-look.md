# Phase 14c: Look

**Goal:** the 3D greybox gets the light, color and finish of a toy diorama: warm sun with soft shadows, ambient occlusion, a little bloom, clean edges, a palette in one place, and player rings. Weak machines drop to a cheaper look by themselves. Part of [phase 14](phase-14-3d-graphics.md).

## Scope

- `src/render/three/look.ts`: `PALETTE` (every 3D color; stations keep the colors players learned in 2D), floor and wall colors per theme, lights (sky light, a warm lowish sun from the front left with soft 2048² shadows fitted to the level, a cool fill from the back right), a soft room environment for reflections (made once per renderer), a radial backdrop gradient, `matte()` materials.
- `src/render/three/MapView.ts`: the map built from the palette and the level's `MapLook` (floor and wall theme, glass walls see-through): a wooden slab, a checkered floor, walls with a darker cap, counters and stations with a top that overhangs their body. A handful of instanced meshes.
- `src/render/three/stage.ts`: on `high`, the frame goes through `postprocessing`: render, N8AO ambient occlusion (half resolution), bloom (only bright things), SMAA, neutral tone mapping. On `low`: no post, no shadows, pixel ratio 1, MSAA, tone mapping in the renderer.
- `src/render/three/quality.ts`: `?quality=low|high` forces a quality; otherwise the game starts on high and drops to low for good when most frames in a 1.5 s window are slower than 25 ms (after a 2 s warm-up, ignoring hidden-tab gaps).
- Player rings: a ring on the floor in each player's color.
- `vite.config.ts`: three.js, postprocessing and n8ao are pre-bundled, so the dev server never loads two copies of three.js.

## Decisions

- **No Graphics item in Settings yet.** Settings menus are shared by 2D and 3D, and a quality line would do nothing in 2D. Auto-downgrade plus `?quality=` covers it until 14g makes 3D the default, when the menu gets the line.
- Tone mapping is Khronos Neutral, which keeps the station colors saturated instead of washing them out like ACES.

## Tests

- `three/quality.test.ts`: warm-up, dropping once after a slow window, staying up with occasional hitches, ignoring hidden-tab gaps, forced quality never watching

## Done when

- [x] Levels read as a lit diorama with visible shadows and stations in their colors
- [x] `?quality=low` and the automatic drop work
- [x] `npm run check` passes
