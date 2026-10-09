# Plan: to a playable core loop

Starting point: empty repo. Each phase ends in something you can run and click on.

| Phase | Result |
|---|---|
| 0 Scaffold | Vite + Phaser + TS app boots, tests and CI run |
| 1 Map and camera | Startup Pit rendered isometric, pan, zoom, hover |
| 2 State, loop, HUD | Clock runs, speed controls, money on screen, save/load |
| 3 Build mode | Place Dev Pits and a reception desk with valid/invalid feedback |
| 4 Pathfinding and walkers | Tickets walk in, queue at reception, leave |
| 5 Staff | Hire receptionists and developers, they walk to their posts |
| 6 Core loop | Tickets get checked in, fixed, pay, reputation, win/lose |
| 7 Art pass (optional) | CC0 sprites replace placeholders, can start after phase 3 |

## How to feed a phase to Claude Code

Copy `AGENTS.md`, `CLAUDE.md`, `maps/` and `docs/` into the empty repo first. Then per phase:

```
Read AGENTS.md and docs/plan/phase-0X-<name>.md.
Write a short implementation plan (files, steps, tests) and wait for my go.
Then implement, run npm run check until green, and tell me what to check manually.
Do not implement anything from later phases.
```

Play it yourself after every phase before starting the next.

## Deliberately out of scope until the core loop works

Triage and diagnosis, multiple problem types with different rooms, random events and incidents, staff traits, locked plots, more buildings, sound.
