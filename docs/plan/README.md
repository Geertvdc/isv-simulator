# Plan: to a playable couch co-op game

The game started as a Theme Hospital-style management sim and pivoted to Overcooked-style couch co-op after phase 1. Each phase ends in something you can run and play.

| Phase                                        | Result                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0 Scaffold (done)                            | Vite + Phaser + TS app boots, tests and CI run                                        |
| 1 Map and camera (done)                      | ASCII map rendered, camera and hover (rotation and manual camera removed in phase 2)  |
| 2 Pivot cleanup and level format (done)      | Auto-fit front-facing camera, garage level with stations                              |
| 3 Movement (done)                            | One keyboard player walks around with smooth movement and collision                   |
| 4 Multiplayer input (done)                   | 2 to 4 players on keyboard split and gamepads, join lobby                             |
| 5 Carry and work (done)                      | Tickets from the inbox, carry, counters, work at keyboard and test bench              |
| 6 Orders and scoring (done)                  | Orders with timers, pipeline, ship, score, stars: **playable core loop**              |
| 7 Pipeline failure (done)                    | Forgotten builds break the build machine; take the ticket out, repair, rebuild        |
| 8 Couch polish (done)                        | Dash, throwing, review station, juice, sound, 3 levels and level select               |
| 9 Art pass (optional)                        | Real office art and characters replace placeholders, can start after phase 6          |
| 10 Game flow and save data (done, in review) | Title screen, pause, results with next level, settings, unlocks, versioned local save |
| 11 Campaign (done, in review)                | About 12 levels in chapters (Garage to Enterprise), one new mechanic per chapter      |
| 12 Music and onboarding (done, in review)    | Music, level intro cards, first-level hints, countdown and transitions                |
| 13 Online multiplayer (in progress)          | Authoritative Colyseus server, lobbies with join codes, user ids, stacked 13a to 13f  |
| 14 3D graphics (done)                        | three.js Overcooked-style office diorama; 14g made it the only look and deleted 2D    |
| 15 Atmosphere (in progress)                  | Themed surroundings and life around every level (3D)                                  |
| 16 Level shapes (planned)                    | Any outline, gaps you throw across, conveyor belts                                    |
| 17 Dev mechanics (planned)                   | Design at the whiteboard, front end + back end merge, pair programming                |
| 18 Big Tech chapter (planned)                | Four new levels built on 16 and 17; see [the overview](phase-15-18-overview.md)       |
| 19 World map (done, in review)               | 3D Overcooked-style level select and title, startup to enterprise; stacked PRs        |
| 20 Polish (done)                             | Smooth diagonals, varied road, software-look menus, varied set dressing               |
| 21 Tickets (in progress)                     | Incident blocks shipping, no zombie tickets, issue-tracker style ticket cards         |

## How to feed a phase to Claude Code

Per phase:

```
Read AGENTS.md and docs/plan/phase-0X-<name>.md.
Write a short implementation plan (files, steps, tests) and wait for my go.
Then implement, run npm run check until green, and tell me what to check manually.
Do not implement anything from later phases.
```

Play it yourself after every phase before starting the next, ideally with someone else on the couch.

## Deliberately out of scope for now

Online play, until the local game has enough content to be worth playing online (phase 11).
