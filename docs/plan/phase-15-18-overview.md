# Phases 15 to 18: atmosphere, level shapes, dev mechanics, a new chapter

**Goal:** levels that feel like Overcooked: full of life around the edges, in shapes other than a rectangle, with places you can only reach by throwing, and steps that feel more like software development than "code, test, pipeline".

Built without the product owner (no time to review), so every decision made on their behalf is logged in [review-notes-15.md](review-notes-15.md). Each phase is one stacked PR, reviewed twice by a critic sub-agent before it's opened:

| PR  | Branch                     | Base   | Result                                                                                                     |
| --- | -------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| 14  | `claude/game-3d-graphics…` | `main` | The 3D look (done)                                                                                         |
| 15  | `phase-15-atmosphere`      | 14     | [Atmosphere](phase-15-atmosphere.md): themed surroundings per chapter, background life, details on the map |
| 16  | `phase-16-level-shapes`    | 15     | [Level shapes](phase-16-level-shapes.md): any outline, gaps you throw across, conveyor belts               |
| 17  | `phase-17-dev-mechanics`   | 16     | [Dev mechanics](phase-17-dev-mechanics.md): design at the whiteboard, front end + back end merge, pairing  |
| 18  | `phase-18-big-tech`        | 17     | [Big Tech chapter](phase-18-big-tech.md): four new levels built on 16 and 17, docs and screenshots         |

## Do level design and gameplay belong together?

Research: in Overcooked 2 almost every level pairs a **layout gimmick** (moving platforms, split kitchens drifting apart, conveyor belts you ride or throw onto, portals, fire) with the **recipes** it serves, and a new world introduces one new idea at a time. Reviewers praise the shifting layouts and criticise gimmicks that only add noise. So gameplay and level design meet in the levels themselves, but the two kinds of building block are independent:

- **Layout features** (phase 16) change where you can walk and how tickets travel: outlines, gaps, conveyors. They live in the map format, movement, throwing and the renderers, and say nothing about what a ticket needs.
- **Dev mechanics** (phase 17) change what a ticket needs and how it's worked: new steps, new stations, combining tickets, working together. They live in tickets, interact and orders, and work on any layout.

So they're built and tested as separate PRs (each small enough to review, each with scenes to show it), and **combined in phase 18**, where each new level introduces one idea and the last ones mix them, Overcooked style. Phase 18 is the only one that needs both.

## What stays the same

- The existing 12 levels keep their maps and balance (saves and star records stay valid). New ideas arrive as a fifth chapter.
- Architecture rules: everything new in the sim is plain data, deterministic and tested; tunables in `balance.ts`, text in `content.ts`; every new tile gets a 3D model (2D was deleted in phase 14g).
- Online play: the server runs the same sim; the protocol version goes up because maps can hold new tiles.

Sources for the research: [Overcooked 2 (Wikipedia)](https://en.wikipedia.org/wiki/Overcooked_2), [Twinfinite review](https://twinfinite.net/2018/08/overcooked-2-review/), [Co-Optimus review](https://www.co-optimus.com/ampfeature/2181/overcooked-2-co-op-review.html), [Shacknews](https://shacknews.com/article/109081/shacknews-best-co-op-game-of-2018-overcooked-2).
