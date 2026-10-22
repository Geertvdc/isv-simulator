# Phase 14: 3D graphics

**Goal:** the game looks like a real Overcooked-style 3D game: a lit, chunky, colorful office diorama with soft shadows, little developers with floating hands, and props you recognise at a glance. **Gameplay does not change.** `src/sim/`, `src/flow/`, `src/net/`, `server/` and the HUD stay as they are; only `src/render/` (plus a setting and the screenshot script) changes.

Phase 14 is split into sub-phases, each a stacked PR like phase 13 (14a → `main`, 14b → 14a, ...). Each sub-phase gets its own detailed file (`phase-14x-<name>.md`) written by the agent that builds it, after a short plan and a go.

## Visual target

What makes Overcooked look like Overcooked, and what we copy:

- **Fixed perspective camera** at about 55° down, slight perspective (narrow FOV, ~30°) so the back wall looks a little smaller than the front. The whole level always fits, like today's auto-fit.
- **A diorama:** the playable office is a raised block with surroundings outside it (street, neighbouring offices, a server room, people watching through the window). The surroundings are pure decoration per chapter.
- **Chunky, rounded, low-poly props** with flat colors and bevelled edges; few textures. Countertops are a different color from their fronts.
- **Warm key light with soft shadows**, sky-colored fill light, ambient occlusion in corners. Screens and LEDs glow a little.
- **Characters with no legs:** a bean body, a big head, floating hands, a hat. A colored ring under each player in the player color.
- **Floating icons** (billboards) over stations and carried items, progress bars over work in progress, all always facing the camera.

## Decisions

### Engine: three.js for the world, Phaser stays as host (for now)

- **three.js** (`three`, latest r1xx when 14a starts, with `@types/three`), `WebGLRenderer`. Biggest ecosystem, smallest learning curve, small enough (~150 KB gzipped), loaded with a dynamic `import()` so 2D mode doesn't pay for it. `WebGPURenderer` is not needed for a scene this small.
  - Not Babylon.js: heavier, its own engine/scene model, more than we need.
  - Not a Phaser 3D plugin: the Phaser 3 era plugins (enable3d, Phaser 3D) don't support Phaser 4, and the Phaser 4 3D fork is experimental.
- **Phaser keeps its job as app host**: the scene lifecycle, the `update` loop and `GameLoop`, sound and music, the scale manager. In 3D mode the three.js canvas sits under a transparent Phaser canvas and the Phaser round renderers are switched off. Dropping Phaser completely is possible later (our own rAF loop and WebAudio) but out of scope.
- Post-processing with the `postprocessing` library (pmndrs): N8AO (ambient occlusion), a little bloom for screens, SMAA. All optional per quality level.

### 2D stays on `main` behind a toggle, no long-lived branch

Keeping both is the easiest route: a separate 3D branch would drift from `main` every time a level, mechanic or HUD change lands, while a toggle only needs one small interface that is cleanup anyway. `?render=2d|3d` picks the renderer (default 2D until 14g). In 14g we decide whether to make 3D the default and delete the 2D round renderers (recommended at that point, so new features aren't drawn twice).

### Models: built in code, ForgeGUI and Kenney for what code can't do well

Overcooked props are mostly rounded boxes, cylinders and capsules, so most of our models can be **built in TypeScript** from three.js primitives (`RoundedBoxGeometry`, `CapsuleGeometry`, cylinders, extrusions) and merged into one geometry per model with vertex colors from a shared palette. Why:

- No binary asset pipeline, no licenses, tiny downloads, everything reviewable in a PR.
- One consistent style by construction (same bevel radius, same palette, same light).
- The agent can build and iterate on them: change code, take a screenshot, compare.
- Station states (pipeline broken, test bench red/green) are just parameters.

For the few things that are hard to make from primitives (a plant, a coffee machine, a rubber duck, a beanbag, a server rack with detail):

- **ForgeGUI** (forgegui.com): AI generator for game assets that exports textured **GLB** 3D models and also 2D icons and GUI sets. It's aimed at Roblox and launched in April 2026, so treat it as a trial. Known caveats: models need cleanup (polycount, no rigging), so **not for characters**; generations on **free credits can go to a public asset catalog** unless that's turned off (use a paid plan or check this before generating anything Zure-specific); style can drift between generations. Every generated model goes through the cleanup step below.
- **Kenney CC0 3D kits** (Furniture Kit, City Kit for the surroundings) as a free fallback for props that are neither worth building nor generating.
- **Cleanup pipeline** for any GLB from outside: `@gltf-transform/cli` (scripted, in `scripts/`) to simplify (target under 3k triangles per prop), recolor to our palette where possible, and compress (meshopt). Result in `public/assets/models/`, listed in `CREDITS.md` with source and license.

### Characters: procedural, animated in code

Overcooked-style developers have no legs or rig to animate, which is why they're doable in code: a bean body, a head with simple eyes, two floating hands, a hat per player (the hat shapes from phase 12), a colored ring on the floor. Animation is a pure function of the player state and time (`playerPose(player, timeMs)`): walk bob and lean, hands up while carrying, typing hands at a keyboard, squash during a dash, wind-up before a throw, a stumble when shoved. Testable without WebGL. Rigged Kenney Mini Characters stay a fallback if the procedural ones don't read well.

### Architecture

- **`RoundRenderer` interface** in `src/render/RoundRenderer.ts`: what `GameScene` asks of whatever draws a round (`sync(view)`, `events(events)`, `setTarget(...)`, `resize(...)`, `setDebug(...)`, `destroy()`). `PhaserRoundRenderer` wraps today's renderers without changing them; `ThreeRoundRenderer` is the new one. `GameScene` only talks to the interface.
- **3D code in `src/render/three/`**: `ThreeRoundRenderer.ts`, `stage.ts` (renderer, scene, lights, post), `models/` (one builder per prop), `PlayerModel.ts`, billboards, effects.
- **Projection rule (AGENTS rule 10) still holds:** grid ↔ 3D world mapping and the 3D camera pose and fit go in `src/render/projection.ts` (or `projection3d.ts` next to it, also covered by the rule): 1 tile = 1 world unit, grid x → world x, grid y → world z, floor at y = 0. Screen-relative input (rule 12) keeps working because the camera has no yaw: "up" on screen is still −grid y. A test pins this.
- **Pure, tested helpers** next to the code: camera fit for a perspective camera, `playerPose`, block heights, wall piece choice (shared with 2D), billboard layout, quality auto-downgrade.
- Visual constants stay in their render files like today; camera fit numbers that already live in `balance.ts` are reused.

### Performance budget

60 fps with 4 players on a laptop iGPU at 1080p. Instanced meshes for floor and wall tiles, one material per palette, shadow map fitted to the level, pixel ratio capped at 2. A **quality setting** (Low: no shadows, no post; High: everything) in Settings, saved in the save's `settings`, with an automatic drop to Low when frames are slow.

## Sub-phases (stacked PRs)

| #   | Branch                    | Result                                                                                                                                                                                                                                  |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14a | `phase-14a-3d-foundation` | `RoundRenderer` extraction (2D looks identical), three.js lazy-loaded, `?render=3d`, 3D projection + camera fit, **greybox** of every level (floor, walls, blocks at their heights), capsule players, card tickets, one light + shadows |
| 14b | `phase-14b-3d-parity`     | Every mechanic readable in 3D: ticket step icons and progress bars as billboards, carried/thrown/queued tickets, pipeline states, manager, meeting room, hints, target highlight, popups, puffs, screen shake, hover and debug labels   |
| 14c | `phase-14c-look`          | Palette, materials, lighting, AO, bloom, SMAA, tone mapping, player rings, quality setting + auto-downgrade, perf check                                                                                                                 |
| 14d | `phase-14d-office-kit`    | Code-built models for walls (3 themes), floors (3), counters, every station with its states, bin, hatches, wall deco; `/models.html` catalog to view each model; ForgeGUI trial for 2–3 hero props through the cleanup script           |
| 14e | `phase-14e-characters`    | Procedural developers and manager, `playerPose` animations (idle, walk, carry, work per station, dash, throw, shoved), hats and small looks per player                                                                                  |
| 14f | `phase-14f-diorama`       | Surroundings per chapter (garage, startup, scale-up, enterprise), small particles (dust, sparks from a broken pipeline, confetti on ship), squash and stretch on pick up and put down                                                   |
| 14g | `phase-14g-3d-default`    | Screenshots regenerated in 3D, `docs/game` updated, `CREDITS.md`, playtest; decide 3D as default and whether to delete the 2D round renderers                                                                                           |

14a and 14b get 3D to "playable and complete but ugly"; from 14c on it's all about looks, so each of those can be judged from screenshots.

## Tests (across the sub-phases)

- Grid ↔ 3D world mapping round trip; screen-up stays grid-up with the 3D camera
- Perspective camera fit: every level's bounds fit inside the viewport between the HUD bands at common sizes (16:9, 4:3, ultrawide, phone portrait)
- `playerPose`: carrying lifts the hands, dashing squashes, walking bobs, idle is still
- Quality auto-downgrade: switches after N slow frames, never flips back and forth
- `PhaserRoundRenderer`: existing render tests stay green
- Screenshots: `npm run screenshots -- --render=3d` renders every `?scene=` in 3D (headless Chrome with SwiftShader WebGL); no pixel diffs, the images are for review

## Done when

- [ ] Every level and every mechanic scene plays and reads clearly in 3D
- [ ] Each player is easy to tell apart, and you can see at a glance who carries what and what a ticket still needs
- [ ] 60 fps with 4 players on a laptop iGPU at 1080p on High, or it drops to Low by itself
- [ ] Gameplay, HUD, online play and saves are unchanged (`npm run check` and `verify:online` pass)
- [ ] `?render=2d` still works until 14g decides otherwise
- [ ] `CREDITS.md` lists every outside model with its source and license

## Out of scope

- Any gameplay change (new mechanics, level layouts, balance)
- A moving or rotating camera, cinematic fly-ins
- 3D menus or HUD (the DOM overlay stays)
- Removing Phaser
