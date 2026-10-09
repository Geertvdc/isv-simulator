# Phase 0: Scaffold

**Goal:** empty repo to a running Vite + Phaser + TypeScript app with tests and CI.

## Scope

- Vite vanilla TypeScript setup, add `phaser`, `vitest`, `eslint`, `prettier`
- `tsconfig` strict mode
- npm scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `check` (typecheck + lint + test)
- Folder skeleton from `AGENTS.md`
- Phaser boots one `GameScene` with a dark background and centered text "ISV Simulator"
- DOM overlay `<div id="ui">` on top of the canvas showing "v0"
- Canvas resizes with the window
- `src/sim/rng.ts`: seeded RNG (mulberry32 or similar) with `next()`, `int(min, max)`, `pick(array)`; RNG state must be storable as a number in `GameState` later
- GitHub Actions workflow: `npm ci && npm run check` on push and PR
- `.gitignore`, short `README.md` with how to run

## Tests

- Same seed gives the same sequence
- `int` stays within bounds over many draws

## Out of scope

Any game logic or rendering beyond the text.

## Done when

- [x] `npm run dev` shows the text and the overlay
- [x] `npm run check` passes
- [x] CI is green
