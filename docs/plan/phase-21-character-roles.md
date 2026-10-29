# Phase 21 proposal: character roles, ticket domains, and a new cast

**Status:** 21a visual investigation and 21b rules/lab are complete. The user accepted the revised gender-neutral production cast ("Approve the revised cast and continue"), passing the 21c visual gate. The separately approved selection/readiness/feedback implementation is now playable locally and online; its verification is recorded below. The 21d benchmark, policy-diagnosis, and evidence-only tuning slice is approved and recorded below; campaign rollout remains explicitly held for separate approval and human couch trials. Hats remain optional, non-default accessories, not a blanket prohibition. Numbers below are starting hypotheses unless identified as measured results.

**Goal:** a team of generalists is dependable and can earn three stars; a well-coordinated specialist team has a higher ceiling because it assigns work and hands tickets over well. Mixed teams should be a useful middle ground. Replace the current character silhouette, not just its hats.

## Confirmed direction

- Generalists and specialists coexist in the same game, not separate casual/expert modes.
- Specialists should theoretically outperform generalists when they stay on their strengths and coordinate perfectly. Their opportunity cost is inflexibility, travel, queues, and handovers.
- The original 25% coding / 150% testing example was illustrative, not a required stat line.
- Redesign the cast with new bodies, faces, outfits, and animation personalities, using the selected compact angular foundation. Differentiate roles through clothing, hair, facial hair, glasses, headphones, and occasional hats. Hats are optional accessories, not the default or the primary identity system. The current silhouette is not a constraint.
- The 21a study scope and compact angular foundation are approved. Final cast production remains in 21c and requires that subphase's approval.

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

### Selected foundation and future cast brief

Design a **new compact angular stylized animated office crew**: short grounded legs with visible shoes, connected simplified arms, expressive faces, and distinct upper-body outlines. Preserve the cheerful handmade office diorama; do not make realistic humans, tiny detailed avatars, or a terminal-themed costume pasted onto the same bean. Hats may appear on some characters, like glasses, facial hair, or headphones, but must not be the default or replace body/outfit/hair variation as the identity system.

21a built three low-detail, hat-free geometry studies on `/models.html`: a compact angular crew, a rounder stop-motion-like crew, and an exaggerated workplace-cartoon crew. They were compared under the real gameplay camera and lighting, not just portrait turntables. The user selected compact angular: "I like the compact angular crew. and you can do variations on the clothing, hair, accessories etc to create the different classes". The user also clarified: "it is possible for some characters to have a hat but it shouldn't be the default. a hat is an accessory like glasses, facial hair, headphones, you name it". Keep the hat-free studies as historical comparison evidence; this is not a production hat ban. In the separately approved production slice, develop the five role characters from that foundation using these variations, not hats as the default distinction.

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
| 21b: deterministic rules and lab | New `src/sim/roles.ts` + colocated tests; `balance.ts`, `state.ts`, `tickets.ts`, `orders.ts`, `interact.ts`, `pipeline.ts`, `levels.ts`, `content.ts`, map-look entry; initial bot/sim role-lab harness | Opt-in role/domain lab, fixed-seed benchmarks, classic all-generalist behavior preserved. No campaign-wide rebalance. |
| 21c: playable selection and final cast | `src/input/lobby.ts`, `flow/flow.ts`, `ui/lobby.ts`, `ui/onlineLobby.ts`, `ui/intro.ts`, `ui/playerBadge.ts`, `ui/hud.ts`, `ui/recipes.ts`, relevant CSS; `render/GameScene.ts`, `three/People.ts`, `Characters.ts`, `pose.ts`, `layout.ts`, ticket models/billboards; `net/protocol.ts`, snapshot/prediction consumers, `server/roomLogic.ts` | Production cast in the approved style; local/online role selection and pre-round readiness; domains readable throughout. No role is exposed without its rules, UI, and online support. |
| 21d: balance and rollout | Extend `scripts/sim.ts`, `src/sim/bot.ts`, benchmark fixtures/tests beyond the 21b lab; explicitly selected level settings, `docs/game/`, approved screenshots | Validate target envelope with humans and bots, tune, then opt in selected campaign levels. Expand only after that evidence. |

Before each slice, write a short concrete implementation plan and wait for approval as usual. Do not implement all four slices under one approval.

### 21a study review

Open `/models.html?studies` with `npm run dev`. The existing office-kit page remains at `/models.html`, and the playable cast is unchanged. The studies are dev-only, not included in the production game bundle.

The three alternatives are **Compact angular** (cut overshirt, swept block hair, short stride), **Rounded stop-motion** (pear jacket, scalloped curls, soft waddle), and **Workplace cartoon** (broad shoulders, narrow waist, quiff, exaggerated stride). The user selected **Compact angular** as the foundation. The other studies remain comparison evidence, not approved roles or a final cast.

- [x] Three procedural, hat-free studies with new bodies/faces, attached jointed arms, split legs and grounded shoes.
- [x] Idle, walk, work, carry, dash, throw wind-up/release, and shove pose loops; pause and scrub the loop for inspection.
- [x] Enlarged front/rear comparisons, four copies of each study in player colors, and grayscale/rear toggles.
- [x] Isolated Monorepo office comparisons use the actual map geometry, gameplay camera fit, lighting, materials and low-quality renderer, without changing simulation or production characters.
- [x] Tests cover shoulder/elbow/wrist attachment under translated/rotated roots, bounded arm extension, grounded feet, study head bounds, actual folder-tab/flap clearance against head/jacket triangles, hand clearance against the head, 101 wind-up samples per style, and owned-geometry disposal.
- [x] `npm run check` and `npm run build` pass; desktop and narrow-window study captures and an unchanged real-game reference were inspected.
- [x] Independent critic review is clean (two rounds). A final stronger actual-folder-envelope check exposed an early cartoon-jacket intersection; a small rearward torso adjustment fixed it, then full validation and the second critic review passed.
- [x] User chooses the compact angular language as the foundation, with clothing, hair, and accessory variations for the future roles.
- [ ] Human two-second couch readability is **not yet verified**.

Useful reproducible views:

| Review | URL |
| --- | --- |
| All three, front/rear | `/models.html?studies&still&action=carry&time=900` |
| Compact angular, four players | `/models.html?studies&view=office&style=angular&still` |
| Rounded stop-motion, four players | `/models.html?studies&view=office&style=clay&still` |
| Workplace cartoon, four players | `/models.html?studies&view=office&style=cartoon&still` |
| Rear/grayscale example | `/models.html?studies&view=office&style=clay&rear&gray&still` |
| Throw scrub example | `/models.html?studies&action=throw&still&time=900` |

Capture the comparison set with `npx vite-node scripts/characterStudies.ts --out=/absolute/output/directory` (optional `--base=http://localhost:5173`). These are study evidence, not replacements for approved game documentation images. The script also captures `/?scene=level-monorepo&quality=low` as an unchanged actual-game reference.

The shared study rig keeps `carryPoint` and the existing hand targets unchanged. Its torso bends out of the ticket arc and its rubber-hose arms extend for wind-up; these are investigation choices, not a production rig decision. The released-ticket path is illustrative, explicitly labeled, and does not change the sim's throw. No rates, domains, role selection, online behavior, final cast, or campaign tuning are implemented here.

### 21b implementation status

The approved 21b slice adds plain-data role ids and ticket domains, role-aware manual work and repair rates, domain-aware order compatibility/lifecycle, and the opt-in `lab-roles` level. Existing campaign levels remain without a domain schedule. Full-stack orders remain `mixed`; their FE/BE ingredients have their respective domains and are excluded from the exact-count batches, which apply to ordinary feature orders. Incidents use their authored incident domain. The lab borrows the scale-up world look and has no production UI or network role-selection path.

Verification completed: `npm run check` (80 test files, 1,108 tests) and `npm run build` pass. The lab batch tests verify exact configured counts and drought bounds; classic-level tests verify that domain selection makes no additional RNG draws. Exact 60 Hz code/test completion tests cover every role/domain pair; pairing, design composition, strongest-worker selection, repair, worker-order permutation, and same-tick ticket replacement are also covered.

`npm run sim -- --role-lab --players=N 30 1` compares same-policy generalist, mixed, and specialist bots across the same 30 seeds, printing per-seed score deltas, throughput, expired work, stars, station work, travel/idle, handovers, queues, and recipe/domain counts. For role-neutral assignment, mixed/specialist mean score deltas versus generalists were +2.5/+6.2 (2 players), +12.9/+13.9 (3), and +18.8/+4.3 (4); all six 95% normal-approximation intervals crossed zero. With role-aware assignment, the deltas were -3.6/-4.0 (2 players), -66.5/-2.2 (3), and +2.2/+14.9 (4); five of those six intervals crossed zero, while the 3-player mixed team was materially worse (-112.5 to -20.5). Role-neutral mean shipped orders for generalist/mixed/specialist teams were 10.6/10.6/10.6 (2 players), 14.1/14.4/14.6 (3), and 16.2/16.8/16.3 (4). These noisy lab results do not establish the proposed 10–20% throughput target, three-star campaign viability, or couch-play balance; the full round results show incident expiries, broad per-seed score swings, and a role-aware bot-policy regression for one composition that needs further diagnosis before 21d tuning.

### Tests and completion criteria

- [ ] Generalist manual-work timing matches the current baseline; classic levels retain seeded schedules/outcomes and save progression.
- [ ] Every role/domain pair has exact completion-tick tests; faster speed is never accidentally treated as longer duration.
- [ ] Design, paired coding, review quorum, multiple testers/repairers, three-worker caps, worker-order independence, and same-tick ticket removal/replacement are covered.
- [ ] Domain survives every ticket lifecycle, including delayed bugs and merge/loss; shipping and expiry cannot cross domains.
- [ ] No extra RNG rolls occur on non-domain levels; authored domain batches meet configured counts and drought limits.
- [ ] Solo, 2/3/4-player, duplicates, generalist-only, mixed, and specialist compositions remain playable; measured specialist gains come from assignment rather than privileged scoring.
- [x] Local and online setup, readiness invalidation, countdown lock, ownership validation, reconnect, controller takeover, retries, and spectators are tested.
- [x] Model/pose tests cover attachment points, arm reach, head/accessory bounds, and carried-ticket clearance; geometry is disposed correctly on replacement/destruction.
- [ ] Approved art direction is legible at real gameplay scale, including four same-role characters, grayscale, rear views, and every action.
- [ ] `npm run check` and `npm run build` pass for implementation slices; manual local/online checks and couch balance trials are completed.
- [ ] Directly affected game documentation and screenshots are updated after the art and rules settle.

## Decisions still requiring approval

The user approved the 21b rules/lab scope and its proposed role matrix as hypotheses to measure, not as proven balance. The user then chose **"Approve 21c with the cast approval checkpoint"**: the cast PR stops for visual acceptance before the separate selection/readiness/feedback PR begins. The user has separately approved 21d benchmarks and evidence-justified tuning only; campaign opt-in and rollout remain held pending human validation and separate approval.

Do not treat production implementation or screenshots as final art acceptance, verified couch readability, campaign rollout, or measured balance.

### 21c first part: production cast review

The user redirected the cast to **one gender-neutral crew**, replacing the earlier binary variants. Every role uses the same face design and supports swept, cropped, long and tied hairstyles, without a gender field or male/female switch. Hair length/style, skin and hair color are person cosmetics, independent of profession. Normal four-player casts use all four hairstyles. Role outfits remain distinct: rolled-sleeve/strap generalist, asymmetric cropped frontend jacket, square-collared backend vest, narrow QA coat with inspection glasses, and platform utility jacket with headset. Faces, outfits, rig targets and work/movement behavior do not change with hairstyle. No appearance-selection UI or extra sim/network field is added here. This first set uses hair, clothes and accessories rather than default hats; occasional future hats remain permitted.

`DeveloperRig.ts` owns only production geometry and the common attached-limb rig; no study geometry or model-sheet imports enter the game. `Characters.ts` retains the manager/extras' original body behavior. `People.ts` selects from authoritative `roleId` state, including interpolated/spectator views, and replaces/disposes owned geometry when a role changes in the viewed state. This is rendering support, not a mid-round role-selection feature. Player color, floor-tab number and owner shape stay independent of outfit/badge identity. Normal rounds default to the new generalist.

Common hand/ticket targets, smoothed-facing alignment, movement, collision, station reach, gait frequency and sim throw rules remain shared. The torso ducks left and back around the unchanged folder arc. The new dash/carry regression test also verifies wrists after dash removes walk bob. Overlays use an animated head/hair/headset envelope rather than the obsolete tallest-hat assumption.

- [x] Five production role models with shared gender-neutral faces and four independent hairstyles each; normal game uses the new generalist without adding a selection path.
- [x] All seven actions, attached arm joints, split grounded legs, common carry/throw alignment.
- [x] Tests cover all four hairstyles of every role, shared face geometry, translated/rotated roots, arm segment reach, feet, animated head/accessory bounds, and all 101 wind-up samples against the actual folder/tab/flap envelope while still, walking, dashing and shoved.
- [x] Tests cover independent owner colors/cosmetics, unique role geometry, stable same-role sync, replacement/removal disposal, and smoothed-facing ticket/wrist alignment. Renderer sync leaves state unchanged.
- [x] Enlarged front/rear, grayscale, all-action and duplicate-role model comparisons; real four-player gameplay scenes show HUD/stations, carried tickets, actual wind-up and actual flight.
- [x] `npm run check` (81 files, 1,179 tests) and `npm run build` pass after the gender-neutral revision.
- [x] Independent critic completed three bounded rounds, including revised code and real gameplay/rear/grayscale evidence in the final round. No substantive defects remain; final round's non-blocking caption mismatch was corrected to describe swept/cropped and long/tied rows accurately. Two earlier rounds reviewed rig correctness and improved gameplay-fixture readability; the previous binary variants are superseded.
- [x] User accepts the revised production cast: "Approve the revised cast and continue".
- [ ] Human two-second couch readability, rear/grayscale recognition and four-identical-role play verified.

The couch-readability box remains intentionally unchecked. Captures demonstrate geometry and game integration, not human recognition or balance. The first-part cast PR changed no campaign settings, scores, role rates, bots, lobby/readiness/network UI or 21d tuning.

| Review | URL |
| --- | --- |
| Five roles, varied hair | `/models.html?cast&still&action=idle&time=900` (swept/cropped back row, long/tied front row) |
| Every role/hairstyle | `/models.html` (office kit lists all twenty combinations) |
| All actions, pause/scrub | `/models.html?cast&action=throw` |
| Rear/grayscale | `/models.html?cast&still&action=idle&rear&gray` |
| Four copies of a role | `/models.html?cast&role=generalist&still&action=carry` (also `frontend`, `backend`, `qa`, `platform`) |
| Actual mixed gameplay | `/?scene=cast-mixed&quality=low` |
| Actual platform/QA gameplay | `/?scene=cast-platform&quality=low` |
| Actual four generalists | `/?scene=cast-duplicates&quality=low` |
| Actual sim throw | `/?scene=cast-windup&quality=low`, `/?scene=cast-release&quality=low` |

Capture with `npx vite-node scripts/characterCast.ts --base=http://127.0.0.1:5198 --out=/absolute/evidence/directory` (optional `--cdp-port=9361`). The script uses a private headless Chrome profile, waits for real scene completion and includes a narrow review-page capture. It does not replace the approved `docs/game/` screenshot catalog. The model-sheet release remains illustrative and is labeled as such; actual gameplay flight comes from the unchanged sim.

### 21c second part: role selection and feedback

The local lobby and online couch slots default to generalist. Each bound device cycles its own role with left/right; mouse buttons send the same commands. Following the user's no-scroll correction, all five roles have a compact live preview of the accepted production rig, a strength/tradeoff summary and always-visible skill bars for every coding domain, testing, design and repair. Bars share a scale, mark the 1.00x baseline and give exact multipliers; there is no ambiguous "peak" summary or expandable stats. Four players use four columns on desktop and a two-by-two layout on narrow screens. Cosmetics stay independent of role and owner-based; there is no gender or appearance control.

The level intro is now team confirmation. It puts the authored workload ahead of the tutorial, including ordinary feature-domain batch counts when enabled, both full-stack coding parts, incidents, design/review, returning bugs and unattended builds. Coverage is advisory, never a class gate. Each participating connected player readies separately; changing that player's role clears only their readiness. Countdown locks the authoritative role map and recreates the prepared round with its original seed. Retry/restart/next-level confirmation keeps roles and resets readiness.

The compact forecast stays visible while **Level guide** swaps the team area for tutorial/recipes and full workload details in place; **Back to team**, or up/down on keyboard/controller, returns to the role cards. No selection surface requires scrolling. The four-seat layout verifier checks visible content against both viewport and individual card bounds, including online room/sound/status controls, at 1440x900, 1280x720, 740x900 and 640x720 (24 local/online lobby, confirmation and guide cases). Real captures were inspected; injected gamepad readings exercise the menu path but are not a physical-controller test.

Shared plain-data roster helpers serve local flow and server setup. Protocol 6 validates role/ready/takeover requests; only an owner can configure their own slots, only before countdown. Reconnect and orphaned-gamepad takeover preserve player identity and role. A disconnected owner's readiness is cleared and does not block the connected team; rejoining before countdown requires fresh ready. Late spectators cannot change the active roster.

In-round player badges show role labels/icons; orders and tickets show domain labels/icons separately from workflow names and station steps. Effective rates come from the sim's actual resolved contributors, including design and pairing factors. Only the strongest manual worker or the top two paired coders receive a speed label and work animation; a review reports its quorum rather than inventing a speed bonus. Builds remain unattended and role-neutral.

- [x] Shared local/server role setup, defaults, duplicates, per-device ownership and readiness invalidation.
- [x] Solo and 2/3/4-slot readiness, countdown locks, connected-owner handling, reconnect, orphan-controller takeover, retry/restart and snapshot/prediction role preservation covered by colocated tests.
- [x] Real isolated Chrome local gameplay and a real authoritative room with two clients verify selection through countdown into actual roles, movement, page reconnect and late-spectator safety.
- [x] Desktop and narrow captures inspected for lobby, confirmation/forecast, and real sim-driven domain/rate feedback; online lobby, confirmation, gameplay and spectator captures inspected.
- [x] `npm run check` (86 files, 1,205 tests) and `npm run build` pass.
- [x] Independent selection/feedback critic completed three bounded rounds; final review found no significant issues. Round 1 exposed join-only Enter readying keyboard slots, fixed with interact-only readiness plus pure/browser regressions. Round 2 exposed old one-host-press assumptions in online/prediction/screenshot scripts, fixed and verified end to end.
- [ ] Physical gamepads, multi-human couch play, two-second recognition and human balance trials completed.

Development entry: `/?lab=lab-roles&quality=low` opens a playable local lab without save progression or campaign migration (dev builds only). `/?scene=roles-work&quality=low` freezes actual sim work: a designed matching pair contributes 2.28x each / 4.56x total, QA tests at 1.60x and platform repairs at 1.25x.

With Vite pointing to a running local server, reproduce scoped browser evidence with `npx vite-node scripts/verifyRoles.ts --base=http://127.0.0.1:5217 --out=/absolute/evidence/directory --cdp-port=9371`. It uses private Chrome profiles and closes its browsers. It does not retake the full docs catalog. The 21c selection/feedback slice changed no role stats, scoring, bot policy, domain schedules or campaign opt-ins; the separately approved 21d policy diagnosis and benchmark evidence follow.

Reproduce the compact four-player layout evidence with `npx vite-node scripts/verifyRoleLayout.ts --base=http://127.0.0.1:5217 --out=/absolute/evidence/directory`. The user-directed compact revision was checked directly after the three-round critic gauntlet; the earlier critic review does not cover the revised layout.

The existing online and prediction verifiers now confirm each owned slot before starting/restarting; the round-start screenshot flow readies both keyboards and requires a real countdown before capture. `npm run verify:online` passes 13/13 checks (drop/reload, host succession, next-round join and grace expiry), and `npm run verify:prediction` passes 16/16 (lagged input, reconciliation, carry/pause and restarted countdown). The online reload check explicitly waits for a new document rather than accidentally accepting the old pre-unload debug handle. The scoped `screens/round-start` capture passes and its intro/countdown/hints/pause images were inspected and updated. Physical gamepads and multiple humans remain untested.

### 21d: benchmark results and tuning decision

The approved 21d slice corrects the role-aware bot policy and measures balance; it does not roll domains into campaign play. The policy regression was reproduced before changing role rates: on the original 180-second, 30-seed, three-player role lab, role-aware mixed teams waited 7,567 aggregate player-ticks behind non-head queue tickets, shipped 11.4 orders versus 13.9 for role-aware generalists, and scored 66.5 fewer points (paired 95% normal interval [-112.5, -20.5]). A bot could reserve a later ticket in a queue and wait for its head, consuming a worker; assignment also compared work in ticks against travel in seconds. Role-aware dispatch now reserves queue heads only, releases stale non-head reservations, and compares role-adjusted work and walking distance in simulation ticks. Neutral assignment remains unchanged.

On the same full-length lab after the fixes, the role-aware mixed team shipped 14.5 orders versus 13.9 for generalists (paired Δ +0.63 orders, 95% normal interval [+0.07, +1.20]); score Δ was +14.3 [−9.6, +38.2], and measured non-head queue wait was zero. This removes the diagnosed bot regression; it does not establish a general balance advantage.

The reproducible matrix ran 30 shared fixed seeds under both assignment policies, producing 9,960 run/seed records:

| Fixture | Duration | Compositions |
| --- | ---: | --- |
| Balanced role lab | 90 s bounded fixture | Generalist-only solo; all 15, 35, and 70 unordered 2-, 3-, and 4-player compositions |
| Frontend-skew | 180 s | Generalist, mixed, and specialist candidates |
| Infra incidents | 180 s | Generalist, mixed, and specialist candidates |
| Design pairing (`design-sprint`) | 180 s | Generalist, mixed, and specialist candidates |
| Conveyor/gaps (`monorepo`) | 180 s | Generalist, mixed, and specialist candidates |
| Meetings/incidents (`the-reorg`) | 180 s | Generalist, mixed, and specialist candidates |

Candidate fixtures use authored domain schedules and, for campaign-derived maps, preserve the source map's duration and other level settings. They are benchmark fixtures, not a campaign opt-in. The balanced lab's shorter duration bounds the exhaustive composition sweep. Comparisons are paired by seed and policy; intervals are 95% normal approximations and seat positions rotate over seeds. A one-seed smoke run reports its interval as unavailable rather than presenting a zero-width confidence interval.

The balanced sweep found only small, inconsistent throughput effects. Against same-policy generalists, role-aware mixed-team shipped deltas were +0.03 [−0.03, +0.10] at two players, +0.10 [−0.01, +0.21] at three, and +0.03 [−0.11, +0.18] at four. Candidate maps varied: design-pairing showed a small three-player mixed gain (+0.33 to +0.37 shipped orders), while meetings/disruptions often favored generalists. These results do not support the proposed general 10–20% specialization throughput hypothesis. Orders created, shipped, expired, and left open are reported together so capped or sparse demand is visible; incident expiries and repair opportunities were especially sparse, with zero repair work in the infra-only fixture and too little repair activity elsewhere to justify tuning.

Benchmark work ticks are counted from `GameState.workFeedback`, so they include only actual resolved contributors (including both paired coders or review-quorum workers), not every bot holding a work input. Manual station utilization is active station-ticks divided by the number of matching work-station tiles times the full round duration; simultaneous contributors on one station count as one busy station-tick. Pipeline repair utilization covers repair work only; unattended build occupancy is excluded. Travel counts player-ticks with movement; idle counts stationary ticks without resolved work or interaction, including unsuccessful work attempts. The raw per-seed JSON retains full summaries, including recipe/domain order counts; text output summarizes station work/utilization, travel/idle, queue waits, handovers, max queues, order totals, per-domain shipments/expiries, incident expiries, meetings, score, and stars.

The no-travel frontend-feature timing check remains theoretical: generalist code/test/build 9.00 s; frontend hands off to QA 7.23 s; QA does both 8.69 s; frontend does both 8.44 s. These estimates omit travel, queues and handovers and are not whole-round measurements. No role rates, scoring, deadlines, order schedules, star thresholds, or campaign opt-ins were changed: measured evidence does not justify tuning rates, and the sparse repair data cannot establish a platform repair-rate target. No bot result proves human couch balance or three-star campaign viability.

Reproduce the matrix with `npm run sim -- --role-bench 30 1 --json=/absolute/path/role-benchmarks.json`; reproduce the full-length three-player diagnosis with `npm run sim -- --role-lab --players=3 30 1`. The per-seed JSON is retained as a session evidence artifact rather than committed to the repository.

- [x] Diagnose and regression-test queue-head starvation and travel-unit mismatch before making any role-rate decision.
- [x] Run the bounded fixed-seed matrix with both policies, explicit compositions, candidate workload fixtures, paired intervals, and per-seed output.
- [x] Record actual resolved station work, player travel/idle, queue waits, handovers, order demand/expiry, and domain/recipe outcomes.
- [x] Preserve role rates, classic seeded behavior, score, deadlines, star thresholds, campaign schedules, and campaign opt-in.
- [ ] Human couch trials and campaign rollout reviewed and separately approved; campaign rollout remains held.
