# Phase 5: Staff

**Goal:** hire receptionists and developers, they walk to their posts and cost salary.

## Sim

- Staff: `{ id, role, name, skill (1 to 5), salary, pos, state, assignment }`
- Roles: `receptionist`, `developer`
- Candidates: 3 per role, generated with the seeded RNG, names from `content.ts`, salary scales with skill, refreshed every day
- Commands: `hireStaff(candidateId)`, `fireStaff(staffId)`
- Hired staff appear at `E` and auto-assign:
  - receptionist: a desk without a receptionist, walks to its staff tile
  - developer: a Dev Pit without a developer (capacity 1 per room for now)
  - nothing free: idle, wander between corridor tiles
- Re-run assignment when layout or staff changes
- Hiring costs `HIRE_FEE` (0 for now, tunable); salaries deducted on `dayStarted`, logged as an event
- `BANKRUPT_LIMIT = -5000` in `balance.ts`; crossing it emits a `bankrupt` event (screen comes in phase 6)

## UI and render

- Hire panel with candidate cards (name, role, skill stars, salary)
- Click a staff member: small panel with stats and a Fire button
- Colors: receptionist blue, developer green
- Procedural desk + monitor inside each Dev Pit

## Tests

- Candidate generation is deterministic per seed and day
- Hiring deducts `HIRE_FEE` and fails with a reason when money is short
- Assignment rules, including reassignment after a desk is removed
- Firing frees the post
- Salary deduction on day start

## Done when

- [ ] Can hire both roles and they walk to their posts
- [ ] Salaries show up in the event log each day
- [ ] `npm run check` passes
