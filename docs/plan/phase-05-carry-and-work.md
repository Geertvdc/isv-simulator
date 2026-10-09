# Phase 5: Carry and work

**Goal:** tickets appear at the inbox, players carry them around, put them down and work on them.

## Sim

- Ticket: `id`, `steps: { kind: 'code' | 'test' | 'pipeline', progress: 0..1 }[]` in order, `location` (carried by a player, or on a tile)
- Ticket names from `content.ts` (e.g. "Fix login button", "Upgrade to YAML 2") for flavour only
- Inbox: spawns a ticket on a free `I` tile every `INBOX_SPAWN_TICKS` (seeded jitter), up to `INBOX_MAX_TICKETS` waiting. Players pick tickets up from the inbox like from a counter
- Interact (on press, not hold) on the target tile:
  - Empty-handed at a counter, inbox, `K` or `T` holding a ticket: pick it up
  - Carrying at an empty counter, `K` or `T`: put it down
  - Carrying at a bin: the ticket is destroyed
  - Anything else: nothing happens
- Rules: a player carries at most one ticket; a counter or station holds at most one
- Work (held) at `K` or `T` with a ticket on it: advances that station's step by `WORK_RATE` per tick. `T` only works once `code` is done. Progress stays on the ticket when you let go or walk away
- Two players working the same station don't stack (keep it simple; `R` comes later)
- Pipeline (`P`) and ship (`S`) accept nothing yet

## Render

- Tickets as small placeholder cards: on counters, above a carrying player's head, on stations
- Progress bar above a station while a ticket on it has progress for that station's step
- Step checklist icons on each ticket (code, test, pipeline) showing what's done

## Tests

- Inbox spawning: interval, max waiting, only on free inbox tiles, deterministic per seed
- Carry rules: pick up, put down, one item per player, one per counter or station, bin destroys
- Interact is edge-triggered: holding interact doesn't pick up and put down every tick
- Work progress: rate, cap at 1, keeps progress after letting go, `T` blocked before `code` is done
- Interacting with an empty or invalid tile changes nothing

## Out of scope

Orders, scoring, the pipeline timer, shipping.

## Done when

- [ ] Players can grab tickets from the inbox, hand them over via counters and bin them
- [ ] Holding work at `K` and then `T` fills the progress bars and the ticket shows the steps as done
- [x] `npm run check` passes
