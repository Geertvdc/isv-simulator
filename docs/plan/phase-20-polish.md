# Phase 20: polish after the world map

**Goal:** four rough edges from playing phase 19, fixed one at a time. Gameplay does not change.

## Steps (one stacked PR each, on top of the phase 19 stack)

1. **Smooth diagonal walking.** Walking diagonally makes the character's animation stutter (facing, body bob or walk cycle hitch). Find the cause (sim movement and collision, the input layer, interpolation, or the pose and facing code in `src/render/three/`) and make diagonal walking as smooth as straight walking, on keyboard and stick.
2. **A road that doesn't repeat.** The world map road zigzags in the same pattern every chapter (`NODE_ROWS` and the alternating `bend` in `src/flow/worldMap.ts`). Give every stretch its own shape: varied flag heights and bends, from a fixed per-map seed so the flow, server and renderer still agree. Set pieces, locks and the camera keep working with the new road.
3. **A software look for the menus.** The title and world map read as a copy of Overcooked's map screens. Keep the diorama and the van, but make it look like it belongs to a game about shipping software: engineering details on the map (circuit-board traces, server racks, cable runs, terminal and code motifs, git-branch style road markings or flags), and menu panels, cards, banner and logo styled like a code editor or terminal (monospace accents, syntax colors, prompt and bracket motifs) instead of Overcooked's wooden boards and ribbons.
4. **More varied set dressing.** The props around the levels (`surroundings.ts`, `setDressing.ts`, wall clutter in `MapView.ts`) and on the world map (`worldMap/cityModels.ts`, `cityPlan.ts`) repeat the same few models. Add more models and per-instance variation (size, color, rotation, small parts on and off), and choose them so neighbours rarely match.

Each step is built by one agent, then checked twice by separate critic agents (type check, lint, tests, screenshots against this plan). Findings from each critic round are fixed before the next round and before the next step starts.

## Done when

- [x] Diagonal walking looks as smooth as straight walking
- [x] The world map road has no repeating zigzag; every chapter's stretch looks different
- [ ] The title, map and menu panels read as a software/engineering game, not an Overcooked copy
- [ ] Props in levels and on the map show many more distinct models and variations, with few neighbours alike
- [ ] `npm run check` and `npm run build` pass; screenshots retaken where the look changed

## Out of scope

- New levels, chapters or mechanics
- Changing the sim's movement speeds or collision rules beyond what the stutter fix needs
