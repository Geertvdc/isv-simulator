# Phase 7: Pipeline failure

**Goal:** the first source of real panic: forget a finished build and the build machine breaks.

## Sim

- A finished build left in the pipeline for longer than `PIPELINE_FAIL_TICKS` breaks the pipeline. A warning state (`PIPELINE_WARN_TICKS` before failing) lets the render flash
- The ticket that was in it stays on the broken pipeline, but its `pipeline` step resets to 0: it has to be built again
- A broken pipeline doesn't build and won't take a ticket. The ticket on it can still be picked up
- Repairing: hold work while facing a broken pipeline with no ticket on it; it's fixed after `REPAIR_TICKS`. Progress stays when you stop, like coding and testing. Two players repairing the same pipeline don't stack
- A repaired pipeline works as before: put the ticket back in and it builds again
- Events (`pipelineBroke`, `pipelineRepaired`) for the render and UI to react to
- Bots pick up a ticket stuck on a broken pipeline and repair it, so `npm run sim` keeps working

## Render

- Warning flash on a pipeline about to fail
- Placeholder broken look on a broken pipeline, with the usual progress bar while repairing

## Tests

- Timing: warning and failure ticks, a build picked up in time never fails
- Failing resets only the `pipeline` step and leaves the ticket on the pipeline
- A broken pipeline doesn't build and won't take a ticket, but gives back the one on it
- Repairing: needs the work button, needs the pipeline empty, takes `REPAIR_TICKS`, the pipeline builds again afterwards

## Done when

- [ ] Ignoring a finished build breaks the pipeline
- [ ] Recovering is possible but costs enough time to hurt the score
- [x] `npm run check` passes
