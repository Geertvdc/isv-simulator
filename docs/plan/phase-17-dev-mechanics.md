# Phase 17: Dev mechanics

**Goal:** steps that feel like building software, not just "code, test, deploy" on three machines. Three new ideas, each with its own station or twist, chosen to be readable at a glance and to make people shout at each other. Part of [phases 15 to 18](phase-15-18-overview.md).

## Ideas considered

| Idea                                 | Kept? | Why                                                                                               |
| ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------- |
| **Design at the whiteboard**         | yes   | A step before coding, at a big visible station; makes "plan before you build" a place in the room |
| **Front end + back end merge**       | yes   | Overcooked's plating: two parts made separately, combined into one. Natural split for teams       |
| **Pair programming**                 | yes   | Two people at one keyboard go faster: a co-op choice (pair up, or split up?) with no new station  |
| Merge conflicts (two tickets clash)  | no    | Hard to read on screen; punishes without a clear fix                                              |
| Database migration (locks a station) | no    | Similar to the pipeline's waiting; little new                                                     |
| Tech debt piling up                  | later | A good chapter idea, but needs its own balance work                                               |
| Coffee machine speed-up              | no    | Fun, but not about software                                                                       |

## 1. Design (whiteboard, `W`)

- New step `design`, worked by hand at a **whiteboard** (`W`) like coding. Some orders start with it: `design → code → test → pipeline`.
- HUD letter **W**, color white/blue. 2D: a whiteboard block; 3D: a big whiteboard on wheels with a sketch that fills in as the step progresses.

## 2. Merge (front end + back end, `G`)

- A **full-stack order** comes in as two tickets in the inbox: a **front end** part and a **back end** part (`frontend` and `backend` kinds), each needing `code`.
- The **merge station** (`G`, a git-branch logo): put one finished part on it, then the other; they combine into one **full-stack** ticket that still needs `test → pipeline` and ships for the order. An unfinished part can't go on it, and two of the same part don't merge.
- 2D: a block with a branch icon; 3D: a desk with two screens joined by a glowing branch line, the parts sliding together.

## 3. Pair programming

- Two players working the **same keyboard** at once code faster (`PAIR_RATE`, 1.9× one player, not 2×), on levels with `pairing: true`.
- 3D: both type; a small "pairing" spark over the keyboard. 2D: a "×2" badge on the station's progress bar.

## Sim

- `tickets.ts`: step kinds `design` and `merge`; ticket kinds `frontend`, `backend` and `fullstack` (steps per kind); `TICKET_STEPS` and the queue for each.
- `level.ts`: tiles `whiteboard` (`W`) and `merge` (`G`).
- `interact.ts`: the whiteboard works `design` by hand; putting a part on the merge station with its other half combines them (`merged` event); pairing counts workers per keyboard.
- `orders.ts`: `fullstack` orders create both parts; `designShare` and `fullstackShare` per level, like `reviewShare`.
- `content.ts`: titles for the new tickets, HUD text, intro lines. `balance.ts`: `PAIR_RATE`, `DESIGN_RATE`.

## Tests

- Design is worked by hand at a whiteboard and only when it's the next step
- Merge: two finished complementary parts combine into one ticket with the right steps; unfinished or same-kind parts are refused (any front end merges with any back end); the order ships with the merged ticket
- Pairing: two players at one keyboard advance it by `PAIR_RATE`, three don't add more, off on levels without `pairing`
- Orders: full-stack orders create both parts in the inbox; shares by level

## Scenes

`design`, `merge`, `pairing`.

## Done when

- [x] Each mechanic works in 2D and 3D, with HUD letters (intro pictures come with the levels in phase 18)
- [x] Existing levels unchanged (no new RNG rolls on levels without the new shares)
- [x] `npm run check` passes

## Implementation

- `tickets.ts`: step kinds `design` and `merge`; ticket kinds `frontend`, `backend`, `fullstack` (`fullstack` steps are `code → merge → test → pipeline`, code and merge done when merged); `DESIGNED_FEATURE_STEPS`; `isPart`, `canMerge`, `mergeParts`. A lost merged ticket keeps its merge.
- `level.ts`: tiles `whiteboard` (`W`) and `merge` (`G`).
- `interact.ts`: the whiteboard works `design` by hand at `DESIGN_RATE`; `canPutDown` on a merge station takes a coded part, then its other half; `settleOn` (used by put-down, throw landings and conveyors) merges them; on levels with `pairing`, everyone coding at a keyboard signs up and `finishCoding` advances it at `PAIR_RATE` for two or more.
- `orders.ts`: `fullstack` orders (35 points, 1.5× the time) open as both parts in the inbox; parts can't ship; `designShare` and `fullstackShare` roll only on levels that use them; an expired full-stack order takes its waiting parts with it.
- `levels.ts`: optional `designShare`, `fullstackShare`, `pairing` settings; lab level `lab-dev`.
- 2D: whiteboard and merge blocks (W, G); card colors for the new kinds. 3D: a whiteboard on legs with a user-flow sketch, a merge desk with a glowing git branch sign; sky-blue, green and purple folders. HUD: W and G letters, "Front end", "Back end", "Full-stack" labels. Popup "Merged!".
- Scenes: `design`, `merge`, `pairing`.

## Review round 1 fixes

- **Merge is raspberry** (it was nearly the pipeline's orange): the G chip, the 2D block and the 3D station.
- **Full-stack order cards** show both parts: two K chips with a front-end blue and a back-end green mark, then G, T, P. Order kind labels live in `content.ts`.
- **Pairing shows:** the sim keeps the keyboards being paired last tick (`GameState.pairing`), and both looks put "Pairing ×1.9" over the ticket. The first coder codes right away (nothing is lost if someone grabs the ticket mid-tick); the pair's extra comes on top. `PAIR_RATE` is 1.9×.
- **Design pays off:** a designed feature codes 1.6× faster (`DESIGNED_CODE_FACTOR`), so the whiteboard is a choice of where to spend time, not "code again somewhere else".
- **Balance:** full-stack orders pay 30 (from 35).
- **Fixes:** an expired full-stack order takes a waiting merged ticket (lost and back) instead of two parts; conveyors and throw landings report the merged ticket's id.
- **More tests:** a part thrown onto its other half, an uncoded part flying over G, a conveyor feeding G, full-stack expiry, designed coding, the pairing marker.
