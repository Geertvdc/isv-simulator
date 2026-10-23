# Phase 18: Big Tech chapter

**Goal:** a fifth chapter, **Big Tech**, set in a tech campus, where every level has a shape of its own and introduces one idea from phases 16 and 17, Overcooked style; the last level mixes them. Part of [phases 15 to 18](phase-15-18-overview.md).

## Levels

| #   | Level             | Shape and layout gimmick                                                                                                                           | New mechanic             |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 5-1 | **The Atrium**    | Two office halves across an atrium gap. Inbox and keyboards on one side, test and pipeline on the other; throw across, or use the conveyor bridges | Gaps, conveyors          |
| 5-2 | **Design Sprint** | An L-shaped floor wrapped around a courtyard (void); whiteboards in the corner, keyboards made for pairing                                         | Design, pair programming |
| 5-3 | **Monorepo**      | Keyboards on both sides of an atrium (any keyboard codes either half), the merge station just below the gap, a belt across the top                 | Merge                    |
| 5-4 | **Hackathon**     | A ring around a void courtyard with a long belt that ends on a counter; everything at once                                                         | All of the above         |

## Scope

- Four maps in `maps/level-13…16`, settings in `levels.ts` (shares of design, full-stack and reviewed orders; incidents and meetings from earlier chapters stay off except in Hackathon), star thresholds.
- Chapter `big-tech` in `CHAPTERS`, a star gate after Enterprise, a name and blurb in `content.ts`, a music track (an existing one re-used), the level select with five columns.
- Intro cards: one line and a picture for each new mechanic.
- 3D surroundings for the chapter: a campus with glass, lawns, scooters, a slide.
- Docs: `docs/game/levels.md` and `mechanics.md` describe the chapter and the mechanics; screenshots in 2D and 3D.

## Tests

- Every new level parses, has a reachable path for every station from the spawns (or a throw/conveyor connection to it), and plays a whole round with scripted inputs without errors
- The campaign test covers the new chapter and gate

## Done when

- [x] Four new levels play from the level select, each feels different
- [x] Docs and screenshots updated
- [x] `npm run check` passes

## As built

- Maps `maps/level-13-the-atrium.txt` to `level-16-hackathon.txt`, 16 × 10. The Atrium got a walkway along the bottom (solo play needs it); Monorepo's merge station sits below the atrium where both sides meet, with a belt across the top; Design Sprint is an L with the corner void.
- Settings: Design Sprint 60% designed features and pairing; Monorepo 60% full-stack, pairing, orders every 24 s; Hackathon 30% design, 40% full-stack, pairing and calm incidents. Star thresholds from bot runs.
- Chapter `big-tech` behind 18 stars, the Scale-Up music, level select in five columns.
- Intro pictures: `atrium`, `design`, `merge`, `carousel`.
- Bots carry coded parts to the merge station and fetch the merged ticket, so every level is checked by the bot star test (which also proves every station is reachable) and the demo plays them.
- 3D: a `big-tech` campus setting (lawns, picnic tables, bike racks, food trucks, a fountain); each level has its own walls and floor.
- Docs: `levels.md` (chapter 5), `mechanics.md` (gaps, belts, design, merge, pairing), `stations.md`, `3d.md`, screenshots in 2D and 3D.

Assumptions are logged in [review-notes-15.md](review-notes-15.md#phase-18-big-tech).
