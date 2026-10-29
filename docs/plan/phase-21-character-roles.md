# Phase 21 proposal: character roles, ticket domains, and a new cast

**Status:** design proposal, not approved for implementation. Numbers below are starting hypotheses, not measured balance results. Implement one approved subphase at a time.

**Goal:** a team of generalists is dependable and can earn three stars; a well-coordinated specialist team has a higher ceiling because it assigns work and hands tickets over well. Mixed teams should be a useful middle ground. Replace the current character silhouette, not just its hats.

## Confirmed direction

- Generalists and specialists coexist in the same game, not separate casual/expert modes.
- Specialists should theoretically outperform generalists when they stay on their strengths and coordinate perfectly. Their opportunity cost is inflexibility, travel, queues, and handovers.
- The original 25% coding / 150% testing example was illustrative, not a required stat line.
- Redesign the cast with new bodies, faces, outfits, and animation personalities. Do not retain the current hats or use new hats to distinguish roles. The current silhouette is not a constraint.
- This phase is planning only until approved. Character art direction needs a visual approval checkpoint before production.

## 1. What already exists

| Surface | Current behavior | Consequence |
| --- | --- | --- |
| `src/sim/tickets.ts` | Feature, bug, incident, frontend, backend, and fullstack kinds. FE/BE are code-only merge ingredients. | Do not turn existing ingredients into independently shippable tickets or overload kinds with specialties. |
| `src/sim/interact.ts`, `balance.ts` | Code/test/design take 2.5 seconds at base speed. Designed code gets 1.6x. Pair coding gets 1.9x. Review requires two workers. | Roles must compose with existing mechanics without stacking accidentally. |
| `src/sim/pipeline.ts` | Builds run unattended for 4 seconds; repairs take 3 seconds of work. | A DevOps character cannot earn an engaging primary role just by standing near a build. |
| `src/sim/orders.ts` | Shipping matches recipes by step sequence. Expiry removes queued tickets by kind. Pending bugs only store time/title. | Domains must reach matching, expiry, and delayed bugs, not only ticket visuals. |
| `src/input/lobby.ts`, `flow/flow.ts` | Join order assigns player id; no role selection. Local play can start solo too. | Keep player identity separate from role, and keep solo viable. |
| `src/net/snapshot.ts` | Snapshots copy game state, but round creation and lobby ownership are separate concerns. | Role choice needs authoritative round setup and reconnect coverage, not just an extra snapshot field. |
| `src/render/three/Characters.ts`, `People.ts`, `pose.ts` | Shared legless hoodie body, floating gloves, similar faces; hats/colors derived from player id. | A new cast needs new geometry and posing, with preserved carry/throw alignment. |
| `/models.html`, `src/modelSheet/main.ts` | Existing model review page with idle/carry/work/dash poses. | Extend this rather than build a separate art-review tool. |

Phase 17's frontend/backend merge and pairing are implemented, even though the plan index still calls that phase planned. Build on the implementation, not a duplicate version of those mechanics.

## 2. Role model: strengths, not permissions

Every character can perform every existing action. No role-exclusive stations, inventory sizes, movement speeds, hitboxes, dash/throw advantages, or permanent quality bonuses in this first version. A weak assignment costs time, not the ability to complete an order.

Start with five roles:

| Role | General code | Frontend code | Backend code | Infra code | Mixed code | Test | Design | Repair |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Full-stack developer / generalist | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Frontend specialist | 0.85 | 1.50 | 0.85 | 0.85 | 1.00 | 0.90 | 1.00 | 1.00 |
| Backend specialist | 0.85 | 0.85 | 1.50 | 0.85 | 1.00 | 0.90 | 1.00 | 1.00 |
| QA engineer | 0.80 | 0.80 | 0.80 | 0.80 | 0.80 | 1.60 | 1.00 | 1.00 |
| Platform engineer | 0.85 | 0.85 | 0.85 | 1.50 | 1.00 | 0.90 | 1.00 | 1.25 |

All values multiply **work speed**, not duration. Thus 1.50x is 50% faster work and about 33% less time. UI copy must use that distinction consistently. The generalist is competent and reliable, not a deliberately bad character.

Use one coding-domain lookup, not a role bonus multiplied by another affinity bonus. QA's testing bonus applies to all domains, including the reproduction test on a bug. Review speed and reviewer count stay unchanged. Merge stays instantaneous. Shipping score and bug probability do not depend on the worker's role.

Platform's main strength is actively implementing infra tickets at keyboards: deployment configuration, infrastructure definitions, observability, and similar work. Repair is a modest secondary strength, not a reason to break pipelines deliberately. Do not shorten unattended builds based on who inserted a ticket or who stands nearby.

Keep the roster small initially. Designer, security, database, and on-call specializations are later possibilities only if these five produce genuinely different, useful decisions.

## 3. Ticket domains: independent of recipe

Add a plain-data `TicketDomain` with `general | frontend | backend | infra | mixed`, stored on both tickets and orders.

**Kind answers "what workflow is this?" Domain answers "what area is the work in?"**

- A frontend feature is still `kind: feature`, with `domain: frontend` and the usual code/test/pipeline recipe. It is not the existing code-only `kind: frontend` merge ingredient.
- Existing FE and BE ingredients get their corresponding domains. Their merged fullstack ticket gets `mixed`. General feature orders start as `general` unless their level opts into domains.
- A mixed feature means cross-cutting work. The proposed FE/BE/platform rate is deliberately only generalist speed, not their preferred-domain rate.
- Bugs retain the shipped ticket's domain through `PendingBug` and their generated orders/tickets. Incidents get a domain from their level's configured schedule. Never assume every incident is infra.
- Merge compatibility stays based on the existing complementary ingredient kinds. Do not add order-specific ingredient ownership: current gameplay intentionally allows any finished FE part to merge with any finished BE part.
- Preserve domain through carrying, throwing, conveyors, queueing, loss/reset, and snapshots.
- On domain-enabled levels, shipping and expiry use the same kind/recipe/domain compatibility rule. A frontend feature cannot satisfy or remove a backend feature's order/ticket merely because their recipes match. Matching still chooses the earliest-expiring compatible order.
- Keep classic levels on their existing compatibility path until explicitly migrated; tighten matching only for opted-in rules, with tests for both paths.

Domain selection is authored per level, not adapted to the chosen team. Show the planned mix before readiness. Use seeded, bounded shuffled batches rather than independent rolls that can starve a specialty for a whole round. Configure counts and maximum droughts per level. Fullstack orders contribute two coding parts to the workload forecast, not one.

Default/disabled domain settings must consume no additional RNG rolls. Preserve existing order schedules, seeds, and baseline outcomes on classic levels.

## 4. How the speed system composes

Put numeric tuning in `src/sim/balance.ts`, labels/descriptions in `content.ts`, and a small pure role/rate resolver in `src/sim/roles.ts`. Game state contains role ids, never callbacks or rendered models.

For manual work: existing station rate, multiplied by one role/domain rate, multiplied by the existing design factor only for already-designed coding. Clamp completed progress using the existing helper.

For paired coding, calculate each participating coder's effective solo rate first. With two workers, use 0.95 times their summed rates; with one, use their solo rate. Two generalists therefore preserve today's 1.9x and two matching specialists reach 2.85x, not 4.5x. Pairing is still disabled where the level disables it.

At most two coders contribute. If more are present, choose the two highest effective rates, with player id as a deterministic tie-break. A third player must neither increase output nor reduce it by crowding out a stronger coder. On non-pair stations, the strongest eligible active worker contributes once; never let player iteration order select the rate.

**Important refactor constraint:** current coding applies the first worker's progress immediately, then adds a pairing bonus at the end of the tick. Gather rates against the ticket and step actually worked; account for already-applied progress without double work, and do not transfer progress to a replacement ticket. Preserve current same-tick pickup/ship behavior. Test interrupted work and permutation of player order explicitly.

Repair needs the worker's repair rate, but still only one contribution per pipeline per tick. Review remains the existing quorum mechanic; QA cannot review alone. Do not add hidden proximity auras.

Designed coding can be fast: a matching specialist gets 1.50 x 1.60 = 2.40x, and a matching pair 2.85 x 1.60 = 4.56x. Those are explicit combinations, not accidental extra multipliers. Include them in balance trials before deciding whether later tuning is needed.

## 5. Balance: measure the entire kitchen, not average stats

Do not balance by making every row's arithmetic average equal 1.00. Duration is reciprocal to speed, recipes differ, bugs add testing, and queues/travel determine real throughput.

### A useful first sanity check

For a single frontend feature, ignoring travel, queues, bugs, and overlapping other orders:

| Assignment | Code | Test | Unattended build | Total |
| --- | --- | --- | --- | --- |
| Generalists | 2.50 s | 2.50 s | 4.00 s | 9.00 s |
| Frontend specialist hands to QA | 1.67 s | 1.56 s | 4.00 s | 7.23 s |
| QA does everything | 3.13 s | 1.56 s | 4.00 s | 8.69 s |
| Frontend specialist does everything | 1.67 s | 2.78 s | 4.00 s | 8.45 s |

The ideal handover path saves about 1.77 seconds versus generalists before extra coordination costs. Extra handover/travel cost above that erases its latency benefit. These are continuous-time estimates; implementation tests use actual 60 Hz completion ticks.

This is **not** a prediction of round throughput. Generalists can also divide stations or process orders concurrently. Compare equal-sized teams with competent scheduling on both sides. One QA handling all tests can become the bottleneck, especially with bugs, even when code is exceptionally fast.

### Intended balance envelope

- All-generalist teams can earn three stars on every role-enabled campaign level with good play. No specialist gate or stat progression.
- On an authored specialization-friendly map, an optimized specialist or mixed composition should target roughly 10-20% greater completed-order throughput than the best measured all-generalist baseline. This is a target to validate, not a universal promise.
- On travel-heavy or disrupted maps, generalists may match or beat specialists. That is their purpose, not a balance failure.
- No fixed composition should be best across every map and ticket mix. A domain-skewed level can favor a corresponding specialist; the forecast makes that an informed choice.
- Test two-player teams separately: a coding specialist + QA cannot cover every coding domain optimally, and a platform specialist should not be mandatory for repair. Solo defaults to generalist, with no campaign penalty for that choice.
- Duplicate roles are allowed. They have no teamwide stacking bonus. Two frontend specialists can be sensible on frontend-heavy work but leave testing and other domains uncovered.
- Keep the bug/untested probabilities and zero-point bug fixes unchanged initially. Specialist throughput must not make "skip everything and farm fallout" the dominant strategy.

### Evidence and tuning method

Extend `scripts/sim.ts` and the existing pure bot harness with explicit compositions and task-assignment policies. Keep role-neutral and role-aware policies available, and do not present today's non-role-aware bots as proof specialists are weak.

Use fixed, shared seeds and the same schedules for equal-sized teams. Start with 30 seeds per scenario, widening if the measured differences remain noisy. Compare all-generalist, mixed, and specialist teams; for 2-4 players there are only 15, 35, and 70 unordered compositions respectively with five roles. Use the full sweep on small benchmark maps, then a smaller candidate set on campaign maps.

Record shipped orders by recipe/domain, expired orders, score/stars, station utilization, worker idle/travel/work time, handovers, and waiting queues. Report paired per-seed deltas and uncertainty, not just the single best score. Include authored no-travel schedules as theoretical checks, but use complete rounds and couch play for the final verdict.

Cover balanced FE/BE/infra work, single-domain work, merged fullstack work, design/pairing, review, bugs, incidents, repair, long travel, conveyors/gaps, and meetings. Test human coordination under disruption, not only perfect bots.

If specialists underperform, first inspect workload availability, QA/pipeline bottlenecks, and handover distances. If they dominate, inspect overly broad bonuses and weak off-role tradeoffs. Tune rates before changing scores, deadlines, or star thresholds. Do not inflate campaign difficulty to absorb the specialist advantage.

## 6. Character art investigation and proposed direction

### What the current art actually does

Reviewed `Characters.ts`, `pose.ts`, the model-sheet source, and the checked-in `work-code.webp` and `monorepo.webp` screenshots. The observations below concern those sources and images, not a newly captured live round.

The big hats occupy much of the readable silhouette. Faces and torso details become small at the gameplay camera; the cast reads primarily as the same pawn in different colors. Hair, cheeks, hoodie strings, and facial details cannot carry role recognition at that scale. Floating white hands and a legless rounded body reinforce the toy-pawn effect. Existing color rings and obvious carried tickets are useful and should survive.

### Proposed brief, not an approved final style

Design a **new, hat-free stylized animated office crew**: short grounded legs with visible shoes, connected simplified arms, expressive faces, and distinct upper-body outlines. Preserve the cheerful handmade office diorama; do not make realistic humans, tiny detailed avatars, or a terminal-themed costume pasted onto the same bean. None of the current beanies, party hats, graduation caps, or diamond headbands carry over.

Build three low-detail, hat-free geometry studies on `/models.html` before detailed production: a compact angular crew, a rounder stop-motion-like crew, and an exaggerated workplace-cartoon crew. Compare all under the real gameplay camera and lighting, not just portrait turntables. Select one body/face/motion language with the user; do not silently lock in this text proposal. Then create five distinct production characters, one per initial role, rather than one base person with five accessories.

Within the selected language, use these initial role briefs:

| Role | Large readable shape | Clothing/accessory cue | Motion personality |
| --- | --- | --- | --- |
| Generalist | Balanced outline, compact swept hair | Rolled-sleeve overshirt and broad cross-body strap | Relaxed stride, adaptable work pose |
| Frontend | Asymmetric hair mass, short wide jacket | Geometric color-block panel and window badge | Quick, precise taps and expressive head movement |
| Backend | Squarer shoulders, close-cropped head outline | Structured vest, high collar, stacked-block badge | Grounded stance and deliberate work rhythm |
| QA | Broad round hair/earpiece outline, narrow coat | Oversized inspection goggles and check badge | Lean-in inspection, satisfied confirmation nod |
| Platform | Wide headset arc, sturdy jacket outline | Utility vest and server-stack badge | Brisk purposeful stride and repair crouch |

These are stylized role cues, not demographic stereotypes. Do not tie profession or aptitude to skin tone, gender presentation, body type, or glasses alone. Hair/skin variants are cosmetic and available independently of role.

Player identity and role identity must remain independent:

- Player number, existing player color, and a high-contrast numbered/shape-marked floor ring say **who is mine**.
- Silhouette, outfit, and a role badge say **what they are good at**.
- Keep player-color regions substantial on every outfit; do not assign a fixed role color that competes with player colors.
- Two identical roles on screen must still be easy to distinguish. Test four copies of one role as well as four different roles.
- Show role/domain labels and icons, never color alone. Reuse those icons on lobby cards, the HUD, and tickets.

Use a shared lightweight rig with role-specific geometry, not five unrelated animation systems. Preserve common carry/throw hold points, ticket visibility, station reach, collision radius, movement timing, facing, and overlay clearance. Attached arms may require new pose outputs and joint transforms; this is a real rig/animation change, not only a mesh replacement.

Idle, walk, work, carry, dash, throw wind-up, and shove must remain distinct. Role personality is visual only: a slower-looking animation must not change work cadence or input responsiveness. Update the tallest-head/accessory bounds rather than retaining the current hardcoded hat bound.

Review criteria: identify player and role at couch distance within about two seconds; retain recognition in grayscale and from the back; no ticket/hand clipping through the full throw arc; no accessories blocking station cards; all poses readable on the busiest four-player map. Treat these as review exercises, not already-proven results.

Start with procedural models using the existing kit and shared materials. Only consider licensed rigged assets if the studies cannot reach the agreed look; that is an explicit later decision, with license/provenance in `CREDITS.md`. No external asset or image generation is required by this plan.

## 7. Selection, feedback, and online behavior

Default each joining player to generalist. Each local device controls its own role; duplicate choices are legal. Keep joining separate from confirming, so a press cannot accidentally skip selection.

The lobby shows a live model preview, role name, one-sentence strength/tradeoff, and a compact stat comparison. A detail view can show the full matrix. Retain the existing editor-window menu language from phase 20.

Because level selection currently follows the lobby, add a pre-countdown team confirmation at the level intro: show the authored work mix, role selections, and a non-blocking coverage hint. Players can revise their own role there. Changing role resets that player's ready state; starting requires all participating players ready. Freeze roles at countdown, with no mid-round swapping exploit.

In game, show a compact role icon next to the player badge and a contextual effective speed when actually working, such as `Code 1.50x` or `Test 0.90x`. Domain chips use a short label plus icon on tickets and orders. Keep workflow kinds, domain chips, and station step colors visually distinct; do not create more competing permanent HUD bars.

Local round creation and the authoritative server must consume the same validated player-role setup. Online clients request only roles for their owned player slots; the server validates ids and lobby state, owns readiness, and rejects role changes once countdown starts. Reconnect and orphaned-controller takeover preserve the existing player's role. A late spectator cannot alter the roster.

Bump the protocol for the incompatible setup/state change and cover snapshots, round-start, reconciliation/prediction, restart/retry, and next-level transitions. Keep selection stable across a session, with a chance to revise before each round. Do not add permanent stats, role unlocks, or a profile/save migration solely to remember this choice.

## 8. Implementation slices and approval gates

| Slice | Files/surfaces | Result and gate |
| --- | --- | --- |
| 21a: visual investigation | `src/modelSheet/main.ts`, `src/render/three/Characters.ts`, `pose.ts`, `layout.ts`; study helpers only if needed | Three in-engine silhouette/rig studies, including carrying and throwing at gameplay scale. User approves one before production. No gameplay changes. |
| 21b: deterministic rules and lab | New `src/sim/roles.ts` + colocated tests; `balance.ts`, `state.ts`, `tickets.ts`, `orders.ts`, `interact.ts`, `pipeline.ts`, `levels.ts`, `content.ts`, `scenes.ts`; bot/sim harness | Opt-in role/domain lab, fixed-seed benchmarks, classic all-generalist behavior preserved. No campaign-wide rebalance. |
| 21c: playable selection and final cast | `src/input/lobby.ts`, `flow/flow.ts`, `ui/lobby.ts`, `ui/onlineLobby.ts`, `ui/intro.ts`, `ui/playerBadge.ts`, `ui/hud.ts`, `ui/recipes.ts`, relevant CSS; `render/GameScene.ts`, `three/People.ts`, `Characters.ts`, `pose.ts`, `layout.ts`, ticket models/billboards; `net/protocol.ts`, snapshot/prediction consumers, `server/roomLogic.ts` | Production cast in the approved style; local/online role selection and pre-round readiness; domains readable throughout. No role is exposed without its rules, UI, and online support. |
| 21d: balance and rollout | `scripts/sim.ts`, `src/sim/bot.ts`, benchmark fixtures/tests, explicitly selected level settings, `docs/game/`, approved screenshots | Validate target envelope with humans and bots, tune, then opt in selected campaign levels. Expand only after that evidence. |

Before each slice, write a short concrete implementation plan and wait for approval as usual. Do not implement all four slices under one approval.

## Tests and completion criteria

- [ ] Generalist manual-work timing matches the current baseline; classic levels retain seeded schedules/outcomes and save progression.
- [ ] Every role/domain pair has exact completion-tick tests; faster speed is never accidentally treated as longer duration.
- [ ] Design, paired coding, review quorum, multiple testers/repairers, three-worker caps, worker-order independence, and same-tick ticket removal/replacement are covered.
- [ ] Domain survives every ticket lifecycle, including delayed bugs and merge/loss; shipping and expiry cannot cross domains.
- [ ] No extra RNG rolls occur on non-domain levels; authored domain batches meet configured counts and drought limits.
- [ ] Solo, 2/3/4-player, duplicates, generalist-only, mixed, and specialist compositions remain playable; measured specialist gains come from assignment rather than privileged scoring.
- [ ] Local and online setup, readiness invalidation, countdown lock, ownership validation, reconnect, controller takeover, retries, and spectators are tested.
- [ ] Model/pose tests cover attachment points, arm reach, head/accessory bounds, and carried-ticket clearance; geometry is disposed correctly on replacement/destruction.
- [ ] Approved art direction is legible at real gameplay scale, including four same-role characters, grayscale, rear views, and every action.
- [ ] `npm run check` and `npm run build` pass for implementation slices; manual local/online checks and couch balance trials are completed.
- [ ] Directly affected game documentation and screenshots are updated after the art and rules settle.

## Decisions still requiring approval

The roster and matrix, exact pilot levels/domain mixes, and pre-round readiness flow are recommendations. The user has approved the underlying generalist/specialist philosophy and a full, hat-free cast redesign, not those specific implementation choices.

The final body/face/animation language remains deliberately open until the visual studies. Do not treat this proposal as approved art or measured balance.
