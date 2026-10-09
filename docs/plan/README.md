# Plan: to a playable couch co-op game

The game started as a Theme Hospital-style management sim and pivoted to Overcooked-style couch co-op after phase 1. Each phase ends in something you can run and play.

| Phase | Result |
|---|---|
| 0 Scaffold (done) | Vite + Phaser + TS app boots, tests and CI run |
| 1 Map and camera (done) | ASCII map rendered, camera and hover (rotation and manual camera removed in phase 2) |
| 2 Pivot cleanup and level format (done) | Auto-fit front-facing camera, garage level with stations |
| 3 Movement (done) | One keyboard player walks around with smooth movement and collision |
| 4 Multiplayer input (done) | 2 to 4 players on keyboard split and gamepads, join lobby |
| 5 Carry and work (done) | Tickets from the inbox, carry, counters, work at keyboard and test bench |
| 6 Orders and scoring | Orders with timers, pipeline, ship, score, stars: **playable core loop** |
| 7 Pipeline failure and fire | Forgotten builds catch fire, fire spreads, rollback extinguisher |
| 8 Couch polish | Dash, throwing, review station, juice, sound, 3 levels and level select |
| 9 Art pass (optional) | Real office art and characters replace placeholders, can start after phase 6 |
| 10 Online multiplayer (later) | Authoritative server, play from different machines, only after phase 8 |

## How to feed a phase to Claude Code

Per phase:

```
Read AGENTS.md and docs/plan/phase-0X-<name>.md.
Write a short implementation plan (files, steps, tests) and wait for my go.
Then implement, run npm run check until green, and tell me what to check manually.
Do not implement anything from later phases.
```

Play it yourself after every phase before starting the next, ideally with someone else on the couch.

## Deliberately out of scope until the core loop works

Fire, dash, throwing, the review station, more levels, sound, art, menus beyond the join lobby, saving progress, online play.
