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
- [x] The title, map and menu panels read as a software/engineering game, not an Overcooked copy
- [x] Props in levels and on the map show many more distinct models and variations, with few neighbours alike
- [x] `npm run check` and `npm run build` pass; screenshots retaken where the look changed

## Out of scope

- New levels, chapters or mechanics
- Changing the sim's movement speeds or collision rules beyond what the stutter fix needs

## Decisions

Step 3, the software look:

- **One direction, two halves:** the map is a circuit board, the menus are a code editor in dark mode. The diorama, the van, the growing town and the cheerful colors stay; what was Overcooked (wooden-looking paper cards tilted on the map, rounded outlined lettering on an arch, white puff clouds, a sandy shore in a blue sea) goes.
- **Map:** the green tiles keep their chapter colors (the solder mask) and get a texture of traces with vias and silkscreen chips and resistors (`circuitBoard.ts`, fixed seed, kept clear of the level numbers). The shore ring is a dark rim with gold contact fingers (like a card's edge connector), the board edge dark FR4, the sea a dark editor grid (a line per tile, a brighter one every 4). The road is a data bus: copper edges, cyan packets, a via in each stop. Flags are tags with a hole by the point, level numbers monospace like silkscreen. Locked chapters stay under the same puffs, now faceted, a deep blueprint navy with a faint wireframe (a mesh not rendered yet); the gate sign is a little terminal window (`★ 13`) on the open side of the gate. New props: outdoor server cabinets with status LEDs, satellite dishes and radio masts, scattered with the trees from the Garage (dishes) on.
- **Menus:** every card is an editor window: dark, thin edge, a title bar with three dots and a file name (`main.ts`, `settings.json`, `level-3-1.ts`, `player-2.ts`, `results.log`). Menus are numbered lines; the current line is highlighted with a cyan edge, a green `>` and a blinking cursor. Headings follow one rule: a screen's name is a tag with no space (`<Settings/>`, `<Online lobby/>`, like the logo), an instruction is a shell command (`$ Press Enter…`), and a level's name stays plain sans (the results title, the cards). The hint is an editor status bar along the bottom with `⎇ main`; it wraps onto a second line on narrow (4:3) screens. The logo is `<OverEngineered/>` with a cursor, the tagline a `//` comment, the chapter banner a folder (`~/campaign/Scale-Up/`), the star total a status badge (`stars | ★ 012`).
- **Type:** the system's monospace stack (`ui-monospace`, SF Mono, Cascadia Mono, Menlo, Consolas…) for labels, numbers, menus and headings; level names, blurbs and tips stay in the system sans for reading at couch distance. No font files.
- **Words** shown by the CSS (title-bar file names, the status bar's branch, the chapter folder, the badge's `stars`) are text, so they live in `content.ts` (`WINDOW_FILES`, `levelFile`, `playerFile`, `STATUS_BRANCH`, `CHAPTER_FOLDER`, `STAR_BADGE_LABEL`) and reach the CSS through `data-*` attributes. The decorations (title bars, line numbers, prompts, brackets) have empty alt text, so screen readers skip them.
- **Motion:** the cursors blink, except with reduced motion, where they stay lit (and the logo doesn't slide in). The screenshot script asks for reduced motion, so every shot shows the cursors the same way.

Step 4, varied set dressing:

- **Levels:** every chapter's rows draw from 11 to 13 pieces (was 4 to 7), new ones in each (workbenches, wheelie bins, tires, old PCs, sheds, fences and kennels in the Garage; standing desks, bookshelves, whiteboards on wheels, fridges, foosball, high tables, server racks and a mini ramp in the Startup; phone booths, kitchen islands and lockers in the Scale-Up; vending machines, coat racks and shredders in the Enterprise; benches, sorting bins, scooter docks, drone pads, lamp posts, solar panels, a shuttle stop and a sculpture at Big Tech). Most pieces come in 2 to 10 looks (`variants`): other plants and pots, other things on a desk or shelf, another paint job. A row never repeats its last two pieces, and a piece that comes back comes in its next look. Each copy gets its own brightness and a warm or cool cast, and props nobody stands at their own height, width (never past the footprint) and a wider turn when small. The props merge into four meshes (near, far, glow, glass) instead of one instanced mesh per kind, so the extra looks cost no draw calls.
- **Office walls:** 15 things on wall tops (was 3: plants in five kinds, book piles, a rubber duck, a robot, a CRT, a lava lamp, a trophy, a globe, a coffee maker, a router), one wall in five, none the same as one within 4 tiles; five more wall decorations (frames, a shelf, a pinboard, a `{ }` neon sign, a build-status TV), none the same as one within 4 tiles along the wall.
- **Map:** kinds have styles (`STYLES` in `cityPlan.ts`): houses 6 (gable either way with a porch, hip, flat with solar panels, shed roof, with a garage), offices 5 (window grid, ribbon windows, fins, setback, shops with awnings) with 5 kinds of roof (AC units, a water tower, a mast, solar panels, a lit sign), towers and glass towers 4, cars 4 bodies, and the small props 2 or 3; chimneys, dishes, lit windows and bushes come and go per piece. The planner gives a piece a style its nearest neighbour of the same kind doesn't have and that its chapter has used least, picks fillers again rather than clump one kind, and rows don't repeat a kind. New trees (pines, birches, palms at Big Tech), each tree tinted and widened on its own, and new props (bins, hydrants, bus stops, bike racks, food trucks, sheds, solar panels, cooling units, cable spools, drone pads, delivery robots, EV chargers). All of it is seeded, so the flow, server and renderer still agree.
