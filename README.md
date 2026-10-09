# ISV Simulator

A Theme Hospital-style management sim where you run a software vendor: customers arrive with tickets, you build rooms, hire staff, fix their problems and get paid. Isometric 2D, runs in the browser. Internal Zure game.

## Run it

Needs Node 22+.

```bash
npm install
npm run dev      # start the game at http://localhost:5173
npm run check    # typecheck + lint + tests (what CI runs)
npm run build    # production build into dist/
```

## Working on it

- Architecture rules and conventions: [`AGENTS.md`](AGENTS.md)
- Roadmap, one phase at a time: [`docs/plan/`](docs/plan/README.md)
