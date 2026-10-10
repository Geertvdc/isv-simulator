# ISV Simulator

An Overcooked-style couch co-op game about shipping software. 2 to 4 players on one screen carry tickets through code, test and pipeline stations and ship them before the customer's order runs out. Runs in the browser. Internal Zure game.

## Run it

Needs Node 22+.

```bash
npm install
npm run dev      # start the game at http://localhost:5173
npm run check    # typecheck + lint + tests (what CI runs)
npm run build    # production build into dist/
```

## How to play

The game docs, with screenshots of every screen, station, event and level: [`docs/game/`](docs/game/README.md).

## Working on it

- Architecture rules and conventions: [`AGENTS.md`](AGENTS.md)
- Roadmap, one phase at a time: [`docs/plan/`](docs/plan/README.md)
