# Draft maps (phase 23 level redesign)

Sketches of the redesigned campaign maps, for review on paper before anything is built. See [the phase file](../../docs/plan/phase-23-level-redesign.md).

- One file per level: `<level-id>.txt`, using the level's id from `src/sim/levels.ts` (for example `garage.txt`, `open-plan.txt`, `scale-up.txt` for 1-3 Down the Hall).
- Same format as the maps in `maps/`: the chars from `src/sim/level.ts` (`#` wall, `.` floor, `C` counter, `I` inbox, `B` bug queue, `K` keyboard, `T` test bench, `R` review, `P` pipeline, `S` ship, `X` bin, `W` whiteboard, `G` merge, space for void, `~` gap, `>` `<` `^` `v` belts, `1` to `4` spawns, `M` manager start, `m` meeting room floor).
- Plus chars for mechanics that don't exist yet. The tools read them as a stand-in until the mechanic is built:

  | Char | Will be                                                      | Tools read it as |
  | ---- | ------------------------------------------------------------ | ---------------- |
  | `_`  | wet floor (Startup: spills)                                  | floor `.`        |
  | `o`  | leaky tap (Startup)                                          | counter `C`      |
  | `%`  | spill zone, wet while its tap leaks (Startup)                | floor `.`        |
  | `r`  | mop robot route, a closed loop (Startup)                     | floor `.`        |
  | `L`  | lift cabin (Scale-Up: lifts)                                 | floor `.`        |
  | `=`  | partition (Enterprise: reorgs)                               | wall `#`         |
  | `l`  | express lift cabin (Scale-Up: lifts, skips floors)           | floor `.`        |
  | `H`  | mail chute hatch (Scale-Up: one-way drop to the floor below) | counter `C`      |
  | `D`  | rolling desk (Enterprise: reorgs)                            | counter `C`      |

- Reorg levels change layout during the round: `<level-id>.txt` is phase 1 (the layout at the start), `<level-id>.phase2.txt`, `.phase3.txt` the layouts after each reorg. Same size; only partitions `=` and rolling desks `D` move (onto and off floor), everything else stays put. Rolling desks pair up in reading order (the first `D` in phase 1 rolls to the first `D` in phase 2). The tools draw, report and render every phase, and flag a phase that moves anything else.
- The game never loads these files (not until the greybox step of phase 23).

## Tools

```sh
npm run sketch -- <level-id>        # current and draft side by side -> docs/plan/images/level-redesign/<level-id>.svg
npm run sketch -- --drafts          # every draft here
npm run level-report -- <level-id>  # numbers for the current map and its draft
npm run level-report -- --drafts --table
npm run draft-shots -- <level-id>   # draft in the real 3D game -> docs/plan/images/level-redesign/<level-id>-3d.webp
```
