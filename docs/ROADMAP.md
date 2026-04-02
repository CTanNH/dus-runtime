# DUS Roadmap

## Current Stage

DUS is in the **prototype kernel** phase.

That means:

- there is a real runtime architecture
- the wedge demo is meaningful
- the direction is coherent
- the API and engineering envelope are not stable yet

## The Real Goal

Not:

- “replace every frontend framework”
- “make buttons liquid”

Yes:

- prove that some interfaces are better expressed as semantic nodes solved under constraints and losses
- build a reusable runtime around that idea

## Milestone 1: Prove One Sharp Use Case

Target:

- an AI knowledge workspace that beats a naive card/list UI on one concrete task

Candidate benchmark tasks:

- trace evidence behind a claim
- spot contradictions faster
- identify weak-confidence regions in a generated answer

Exit criteria:

- users can explain why the layout helps
- the benefit is not only aesthetic
- `plain` mode remains readable and useful

## Milestone 2: Stabilize the Runtime Contract

Target:

- a small headless API other people can program against

Need:

- stable scene types
- stable layout/debug output shape
- deterministic replay
- test fixtures for scaffold and solve

Progress so far:

- scene normalization and contract diagnostics are now explicit in core
- deterministic headless fixture scenes now exist
- runtime-level deterministic checks now run in `npm run test:core`

Exit criteria:

- another developer could build a new renderer or host bridge without editing core solver logic

## Milestone 3: Make Explainability a Product Feature

Target:

- users and developers can ask “why is this here?” and get an answer

Need:

- richer debug overlays
- loss contribution inspection
- constraint projection visibility
- solver trace export

Exit criteria:

- layout changes feel inspectable, not magical

## Milestone 4: Scale the Solve

Target:

- hundreds of visible nodes remain interactive
- larger scenes degrade gracefully

Need:

- spatial partitioning
- chunked/progressive solve
- possible GPU relaxation path
- viewport-aware culling

Exit criteria:

- larger knowledge fields are practical, not just technically possible

## Milestone 5: Real Editing and Host Integration

Target:

- the surface is not only for viewing, but for working

Need:

- host bridge for selection and annotation
- text input / IME strategy
- accessibility semantics
- pinned slots for normal UI controls where needed

Exit criteria:

- DUS can participate in real workflows, not only demo playback

## Open Source Strategy

Recommended near-term strategy:

1. keep building in the open
2. keep the promise narrow
3. avoid claiming total frontend replacement
4. document the problem sharply
5. let the runtime lead, not the shader spectacle

Recommended public positioning:

- “loss-driven semantic layout runtime”
- “AI-native interface infrastructure”
- “semantic surfaces, not box stacks”

Not recommended yet:

- “React killer”
- “CSS replacement”
- “general-purpose web app framework”

## Publication Criteria

The repo is ready for broader public attention when all of these are true:

- the demo runs reliably on a normal machine
- the README states a narrow honest claim
- the runtime API is understandable
- the wedge task advantage is visible
- the project has at least one explainability surface

## Immediate Next Work

- make the solver/debug layers easier to inspect
- harden the scene/constraint schema beyond the current normalization layer
- export explainability data as a real runtime surface, not only an overlay
- benchmark baseline vs knowledge workspace on one explicit task
- refine the knowledge workspace into a real task demo
- decide what belongs in core vs adapter vs app
