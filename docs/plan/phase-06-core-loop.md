# Phase 6: Core loop

**Goal:** a playable game: tickets get checked in, fixed, pay, and you can win or lose.

## Ticket lifecycle

`arriving` → `queuedReception` → `checkingIn` → `walkingToRoom` → `queuedRoom` → `beingFixed` → `paying` → `leaving` → removed

- `checkingIn` takes `CHECKIN_TICKS`, faster with receptionist skill
- `beingFixed` takes `FIX_TICKS`, faster with developer skill; one ticket per developer at a time
- Room queue works like the desk queue, outside the door
- Patience: drains while queued; at zero the ticket goes `leavingAngry`
- No Dev Pit or no developer: tickets still check in, then wait and drain patience

## Economy and reputation

- `TICKET_FEE = 200` paid on fix, floating "+€200" text
- `REP_HAPPY` on fix, `REP_ANGRY` on angry leave, clamped 0 to 100
- Spawn interval scales with reputation: better reputation, more customers
- Win: `WIN_MONEY = 25000` and reputation at least 60 by day 10. Lose: bankruptcy.
- Win and lose screens with a restart button

## UI

- Click a ticket: problem, state, patience bar
- End-of-day summary toast: fixed, angry, income, salaries
- Event toasts for big moments (first fix, first angry customer, bankruptcy warning)

## Tools for tuning

- `npm run sim`: headless run of a scripted game (build desk + Dev Pit, hire 1 + 1), prints daily stats. Accepts seed and days.

## Tests

- Each lifecycle transition
- Patience drain and angry leave
- Reputation clamping and its effect on spawn interval
- Scenario test: scripted game over 10 days with a fixed seed is not bankrupt and fixes at least N tickets
- Win and lose conditions

## Done when

- [ ] A full game from start to win or lose takes about 15 to 20 minutes
- [ ] Someone who has never seen it understands what to do within 2 minutes
- [ ] `npm run check` passes
