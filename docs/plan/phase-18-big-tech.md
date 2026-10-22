# Phase 18: Big Tech chapter

**Goal:** a fifth chapter, **Big Tech**, set in a tech campus, where every level has a shape of its own and introduces one idea from phases 16 and 17, Overcooked style; the last level mixes them. Part of [phases 15 to 18](phase-15-18-overview.md).

## Levels

| #   | Level             | Shape and layout gimmick                                                                                                                              | New mechanic             |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 5-1 | **The Atrium**    | Two office halves across an atrium gap. Inbox and keyboards on one side, test and pipeline on the other; throw across, or use the one conveyor bridge | Gaps, conveyors          |
| 5-2 | **Design Sprint** | An L-shaped floor wrapped around a courtyard (void); whiteboards in the corner, keyboards made for pairing                                            | Design, pair programming |
| 5-3 | **Monorepo**      | Front-end team on the left island, back-end team on the right, the merge station on a narrow peninsula between them that both can throw to            | Merge                    |
| 5-4 | **Hackathon**     | A ring around a void courtyard with a conveyor loop; everything at once                                                                               | All of the above         |

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

- [ ] Four new levels play from the level select, each feels different
- [ ] Docs and screenshots updated
- [ ] `npm run check` passes
