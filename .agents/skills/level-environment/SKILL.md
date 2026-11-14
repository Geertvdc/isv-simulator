---
name: level-environment
description: Give one level a hand-built, story-telling world (Overcooked-style environment art pass) with parallel Room / World / Light agents, a critic review against references, and a second round of fixes. Use when the user asks to improve a level's theme, environment, surroundings, set dressing or "make level X look like Overcooked", or to do the next level after the garage pilot.
---

# Level environment pass

The garage (1-1) was the pilot: `docs/plan/garage-environment.md` has the brief, the before/after images and what's left. This skill repeats that process for one other level at a time. A pass is render-only (`src/render/`): sim, maps and balance never change.

Score history to beat: the garage went from **3/10 to 5.5/10** after round 1 and clearly higher after round 2, judged against Overcooked 2 shots.

## 0. Pick one level, read its story, get references

- **Read the level's entry in `docs/game/storyline.md` first.** The campaign is one story (YOTTA, from Mom's garage to MONOLITH's old campus) and every level is one beat of it: where and when, the joke, why the level's mechanic exists in the story, what the inbox and ship hatch are, the outside, and where the running gags (the logo, Prod the plant, Segfault the cat, Mom and her station wagon, MONOLITH, the crane tower, Derek, Moppy, the plan) are in this level. Read the levels just before and after too, so the pass sets up the next beat and doesn't repeat the last place.
- One level per pass. Prefer the chapter's first level (x-1), so later levels in the chapter can reuse its props and atmosphere.
- Ask the user for reference images if they didn't give any (Overcooked 2 shots work well). Copy them to the scratchpad (`sips -s format png` also converts `.avif`) so agents can read them.
- Take a **before** shot (step 2 shows how) and keep it for the plan doc.
- Check `docs/plan/phase-23-level-redesign.md` and `maps/drafts/<id>.txt`. If the level has a redesign draft, the scene must fit **both** maps (the draft loads with `?draft=<id>`).

## 1. Write the brief (`docs/plan/<level>-environment.md`)

Copy the structure of `docs/plan/garage-environment.md`:

1. **Story in two sentences**, taken from the level's storyline entry: who works here, where, what time of day and season, and what the joke is. Every prop must belong to that place. "A mix of office-ish things" is the failure mode. You may sharpen the story (a funnier joke, a better place), but then change `docs/game/storyline.md` in the same commit, including the next level's "how it ends" hook if it no longer fits.
2. **Where this sits on the road:** one short paragraph on the levels before and after (link the storyline, don't copy its table). Each level is bigger and more "tech" than the one before; say how this one shows that in material, light and outside.
3. **Read it from the fixed front camera.** Back (top of screen), front (bottom), left, right, inside, light. Tie the outside to the play: build the inbox and the ship hatch as the storyline's doors (where tickets come from, where shipped work goes), and show why the level's mechanic exists (the divider because walls cost money, the spill from the leaking haze machine).
4. **Running gags:** list where each one from the storyline's per-level table goes, with tile or screen positions. At least the logo and Segfault, plus one more. They are cameos: out of the play area, out from under the HUD, small enough to find, never readable as a player.
5. The **six Overcooked lessons**, checked for this level:
   - The frame is full, at several heights.
   - The room's edge is made of the setting.
   - Surfaces carry material and wear.
   - One place, one story.
   - Light does the composition.
   - The outside connects to the play.
6. The rules below, the work split, and a "Done when" list (including "the storyline beat reads with no explanation" and "the running gags are in place").

Commit the brief before spawning agents. Only wait for the user's approval if they asked to review the plan.

## 2. Plumbing first, by you, before any agent starts

Do the small shared changes yourself, so parallel agents never fight over them:

- `LEVEL_LOOKS[<id>]` in `src/render/mapLook.ts`: set `scene: '<id>'`, plus the wall and floor themes the Room agent will add. Adding a theme to `WALL_THEMES` forces an entry in `WALL_DECOS` (`src/render/mapShape.ts`). Tell the Room agent so.
- **Register the level, don't branch on it.** Worlds are a registry by scene id (`SCENES` in `scenes/index.ts`, types in `scenes/types.ts`: a scene brings its own `horizon`, ground `painters` and `alive` props) and rooms one by wall theme (`ROOMS` in `rooms/index.ts`, `RoomDressing` in `rooms/types.ts`: walls, floor, foundation, counter, lamp fitting, story pieces). Add a stub scene and a stub dressing with their registry lines before round 1, so every agent works only in its own `scenes/<id>.ts`, `rooms/<theme>.ts`, `roomModels/<theme>.ts` and `setDressing/<theme>WallTops.ts`. `MapView.ts` and `surroundings.ts` need no level-specific code. Generic living kinds (`sway`, `blink`, `peck`, `wisp`, `bob`) and poses (`phoning`, `carrying`, `sipping`, `smoking`) already exist.
- **Two levels at once works:** Room and World per level plus one Light agent for both (Open Plan and Down the Hall ran that way).
- `ATMOSPHERES` in `src/render/three/atmosphere.ts` is already keyed by scene id; levels without an entry get `DEFAULT_ATMOSPHERE` (today's look).

Shots for each agent, on its own ports:

```bash
npx vite --port 51NN --strictPort          # background
npm run screenshots -- --base=http://localhost:51NN --cdp=93NN --only=levels/<id> --out=<scratch>/shipped
npm run screenshots -- --base=http://localhost:51NN --cdp=93NN --only=levels/<id> --query=draft=<id> --out=<scratch>/draft
sips -s format png <scratch>/shipped/levels/<id>.webp --out <scratch>/shipped.png
```

- In zsh, write the flags out in full. `B="--base=… --cdp=…"; npm run screenshots -- $B` passes them as one word and every shot fails with "invalid URL".
- Screenshots open `?scene=level-<id>`. That param also selects the hand-built world, so `mapLook()` in `GameScene.ts` ignores screenshot scene ids. Never add another URL param named `scene`.
- Headless Chrome renders with SwiftShader, so say "not checked on a real GPU" in the report.

## 3. Round 1: three parallel agents

Spawn all three in one message (`run_in_background`), as `general-purpose` agents in the **same worktree** with strict file ownership.

| Track     | Owns                                                                                                                                                                                     | Builds                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Room**  | `roomModels.ts`, the level's `<level>Room.ts` (+test), `MapView.ts`, `stationModels.ts` (counters only), `setDressing/wallTops.ts`, the `FLOOR_COLORS`/`WALL_COLORS` tables in `look.ts` | Wall and floor themes with material and wear, wall-face and wall-top dressing, counters in the setting's style, inbox and ship as story doors, light fittings |
| **World** | `surroundings.ts` (+test), `scenes/<id>.ts` (+test), `scenes/ground.ts`, the chapter's `setDressing/*.ts`                                                                                | The authored outside: the big backdrop shape at the back, the front strip, both sides, ground surfaces, scene people                                          |
| **Light** | `atmosphere.ts` (+test), `stage.ts`, `WorldFx.ts`, and `createLights` in `look.ts`                                                                                                       | The level's atmosphere preset: sun, sky, fill, fog, vignette, lamps, motes                                                                                    |

Every agent prompt includes:

- The repo path, plus "read `AGENTS.md`, the brief, and this level's entry in `docs/game/storyline.md`".
- Which running gags are its job: logo and signs usually go to Room (walls) or World (backdrop), Segfault and other cameos to whoever owns the spot they sit on, people from the story (Mom, Derek, MONOLITH staff, consultants) to World.
- The reference image paths and the before-shot path.
- Its own files, the other two tracks' files ("don't edit; ignore their transient tsc/test errors"), and its own vite and cdp ports.
- **"Do NOT commit."** You commit per track afterwards with `git add <its paths>`. Commits can't be split cleanly when two tracks touch `look.ts` or `ThreeRoundRenderer.ts`. When that happens, put the shared file in the last commit and make sure the final state passes `npm run check`.
- "Run prettier and eslint on **your own files by name**." One round-1 agent ran prettier on `src/render/three/*.ts` and reformatted another agent's file mid-edit.
- "Iterate with screenshots until it genuinely looks good next to the references; judge like an art director."
- A report format: files changed, per area what was built, final screenshot paths for both maps, weaknesses, and what it needs from the other tracks.

When a report asks something of another track that's still running, forward it with `SendMessage`. Round-1 examples: Light handed its lamp spots to Room for the bulbs, and Room asked World for an apron in front of its doors.

## 4. The rules every track follows

These are the round-1 lessons and the critic's findings, written as rules so round 1 gets them right this time.

**Composition and camera**

- The fixed camera shows only **about 1.2 tiles of ground in front of the slab**. Build the front strip thin (the garage's apron is 0.12, the sidewalk 0.34), or the story's front ends up off frame.
- **HUD-safe rects at 1440×810.** Keep story props out of them:
  - order cards: 0–690 × 0–140 (three cards; two reach 460)
  - player legend: 0–220 × 610–745
  - SCORE: 0–135 × 755–810
  - timer: 1320–1440 × 755–810
  - mute button: 1370–1440 × 0–60
  - the pause hint, bottom centre
    The test `keeps the story props out from under the HUD` in `scenes/garage.test.ts` projects every prop vertex through the real camera fit; copy it for each scene. It duplicates `HUD_TOP_3D` from `ThreeRoundRenderer.ts` by hand, so keep the two in step.
- **Nothing taller than about 0.6 in front of the level**, and no people there. Test it, the way `garage.test.ts` does.
- **Anything hung near the front wall lands on players' heads on screen.** Lamps, signs and cords belong along the back wall only (`lampSpots` turns a front row on only for rooms at least 12 deep).
- **No ceiling exists.** A cord or wire must hang from something visible: string a wire wall to wall, or use a wall bracket.
- A big backdrop at the back (house, building, tent) closes the top of the frame, but must not hide back-wall stations. **Check its origin:** the garage house model had its origin at the front face but was placed as if centred, which left a 2-tile lawn gap. The back wall should _be_ the backdrop's wall.

**Value hierarchy (stations first)**

- Stations keep their signature colours (`PALETTE.station`) and stay the **brightest, most saturated things on screen**.
- **Counter tops must be darker than every station top.** The garage counters started at 0xe6dcc6 and outshone the test benches; they ended at 0xcdbf9f.
- Wall caps must not compete with stations. Use cool, light concrete or stone coping with a lip, not a wide flat tan slab: those read as cardboard.
- Scenery uses the dimmed surroundings materials. Saturated confetti (flower beds) gets clumped and desaturated about 25%.
- **No dark, high-contrast decal in the middle of the play area.** The garage oil stain read as a hole: make decals about 0.9 tiles, translucent, near an edge or door, and never under a spawn.
- **Repeated thin shapes become glyphs.** Splayed sawhorse legs along a counter run read as "A A A A". Thin out repeats along runs (end tiles plus every second tile).

**Story and density**

- **The story is the campaign's, not just the level's.** Props come from this level's beat in `docs/game/storyline.md`; nothing that belongs to an earlier or later place (no HQ glass in the garage, no garage clutter on the campus) unless the storyline calls it a callback.
- **Software and office props, not food.** No catering, bars, kegs, crates of produce or pizza boxes: with the stations, they make the level read as a kitchen game. Coffee mugs are fine.
- **Cluster, don't spread.** Pile props against the room's outer walls (boxes 2–3 high, overflowing bins). Leave open ground only as a deliberate breather. Wall-top props come in 3–4 stacked clusters per long wall, not one item every few tiles.
- The best storytelling prop (the evicted car with the cat on it) must be fully in frame and read from above: windows, wheels, lights, a muted colour of its own.
- **Background people read as extra players** unless they're smaller and quieter. Scale them by `SCENE_PERSON_SCALE` (0.88), desaturate them about 30%, give each an unmistakable action pose (mowing, watering), and keep them at least 1 tile from the room.
- Unreadable lumps get a clear identity (a gnome with a red hat) or go.
- Static pets look dead. Add cheap idle motion (breathing, a twitch, a swaying hose spray) in `Surroundings.update`, skipped on `low`, never within 1 tile of the play area.

**Surfaces**

- Walls get coursing on every face the camera sees: grooves about every 0.2 high, staggered joints, about 12–20% darker. Add a plinth or foundation in the setting's material.
- Floors get per-slab tone variation (±4%), thin light joints, and _placed_ wear that tells a story: tyre tracks from the door, cracks, a drain, drips beside counters.

**Light and grade**

- **Measure, don't eyeball.** The pre-pass garage frame had mean luminance about 103. Round 1's warm grade dropped it to 93 and read muddy and brown. Aim for about 100+ on the shipped frame (a small python script over the PNG does it). Check that benches stay clearly more saturated than wall caps.
- Raise the sun (garage: about 44°) so wall shadows don't swallow the back row. Keep the fill only slightly blue, or the shaded fronts of yellow stations go olive.
- Vignette about 0.35 opacity with inner 0.7. Fog by view depth only softens the top of the frame; the sides need scenery out to the frame edge.
- Point lights: no shadows, hidden on `low`.

**Engineering**

- Deterministic: no `Math.random`, use `tileHash` and salts. Merge static geometry per material, instance repeats, no new shadow-casting lights.
- Place everything from the map's outline and its ship and inbox tiles, never fixed coordinates. Test on both maps.
- Other levels must stay unchanged. Take a shot of one other level at the end (the garage pass used open-plan).

## 5. Critic

When round 1 is committed, spawn one `general-purpose` agent as an **exacting art director** with no edit rights in its instructions. It takes fresh shots (shipped, draft, `?quality=low`), compares them with the references, the before shot and the brief, and returns:

1. A verdict scored out of 10 against the reference bar, before vs after.
2. Prioritised issues, each with the screenshot path and region (x0, y0, x1, y1), why it matters, and a fix with numbers and colours.
3. The fixes grouped into **2–4 chunks that share no files**, each with a goal, its files and a "done when" list.
4. Its screenshot paths.

It also lists what is genuinely good and must be kept, so round 2 doesn't undo it.

Give the critic the level's storyline entry too. Points the critic must cover: frame fill (including what the HUD hides), whether the storyline beat reads with no explanation (where we are, the joke, why the mechanic is there), whether the running gags are present and findable but not distracting, whether the edge is made of the setting, material and wear, clustering and silhouettes, value hierarchy, light and grade (with measured luminance), life and motion, and readability risks near the play area.

## 6. Round 2

Spawn one agent per chunk, in parallel, on fresh ports. Paste the critic's issues and "keep" list into each prompt verbatim, plus the round-1 rules above. Commit each chunk as it lands; a chunk that only touches its own files can be committed before the others finish.

If the result still has clear gaps and the user wants more, run another critic round; otherwise list the leftovers in the brief.

## 7. Finish

- `npm run check` with everything in.
- Final shots: both maps, plus one other level. Copy the shipped shot to `docs/game/images/levels/<id>.webp`, and before/after/draft to `docs/plan/images/<level>-environment/`.
- In the brief: a before/after image table at the top, a status line, a summary of round 2, the leftovers, and ticked "Done when" boxes.
- In `docs/game/storyline.md`: link the brief from the intro's list of levels with a brief, and update the level's entry and its row in the running-gags table to what was actually built.
- Send the user the before and after images, then offer to ship (the `ship` skill).

## Reusable pieces from the garage

- `atmosphere.ts`: `Atmosphere`, `ATMOSPHERES`, `atmosphereFor`, and the pure helpers `sunPlacement`, `lampSpots`, `fogRange`, `moteSeeds`. The vignette is a CSS div owned by `Stage`.
- `scenes/garage.ts`: the `Scene` data shape (ground patches, pieces, people, tufts) and its tests (deterministic, nothing on the slab, nothing tall in front, HUD rects, both maps).
- `scenes/ground.ts`: `groundModel` merges ground patches (lawn stripes, concrete with joints, asphalt with a dashed line) into one vertex-coloured mesh.
- `setDressing/suburb.ts`: house, car, mailbox, hydrant, fence, flower bed, box stacks, monitor stacks, tarp lump, gnome.
- `garageRoom.ts`: the pattern for pure room placement (doors from the ship and inbox tiles, wall-face decor in turn, cap clusters, floor wear), with tests.
- `roomModels.ts`: the garage wall (coursing, 4 wear looks), coping, foundation, slab floor, bulb with shade, lamp wire and roll-up doors.
