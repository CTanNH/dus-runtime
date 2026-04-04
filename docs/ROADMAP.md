# DUS Roadmap

## Progress Map

DUS is currently in **Phase 1.5: prototype kernel plus upstream ingest seam**.

That means the project is no longer only a visual proof:

- there is a real headless runtime architecture
- scaffold, solve, explainability, snapshot, and packet ingest are distinct layers
- browser validation and deterministic core tests exist
- the engineering direction is coherent
- the runtime contract, solver envelope, and host capabilities are still early

## Phase Map

### Phase 0: Surface Shock

Goal:

- prove that a non-box, continuous UI surface can feel materially different

Status:

- done as a research proof
- strategically demoted from “the product” to “one renderer language”

What survived:

- WebGPU pipeline experience
- continuous interaction field ideas
- confidence-sensitive styling

What did not survive:

- the assumption that spectacle alone explains the project

### Phase 1: Prototype Kernel

Goal:

- establish DUS as a runtime, not a shader demo

Status:

- mostly complete

Completed:

- scene contract normalization
- deterministic scaffold and fixture scenes
- hybrid solver runtime
- explainability export
- snapshot/export/import
- benchmark harness foundation
- browser validation pipeline

Exit criteria:

- another developer can inspect the core and understand where scene, scaffold, solver, and adapter boundaries live

### Phase 1.5: Upstream Ingest

Goal:

- let DUS consume structured AI/retrieval outputs instead of only hand-authored scene objects

Status:

- in progress

Completed:

- packet schema (`dus-knowledge-packet@1`)
- packet fixture catalog
- packet validator
- packet -> semantic document -> scene contract pipeline
- benchmark study/report seam for cross-demo comparison
- scripted browser benchmark pipeline

Next:

- less-DUS-specific bundle/source adapters
- better diagnostics at the ingest seam
- fixture diversity beyond the current packet family

Exit criteria:

- DUS can ingest at least two upstream-facing knowledge formats, not only its own packet format

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
- packet fixture catalogs and offline packet validation now exist

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

Progress so far:

- explainability is now exported from the runtime as data, not only painted in the overlay
- per-node narratives and scene-level instability summaries are available to adapters and tests

## Milestone 3.5: Prove Advantage Against the Control

Target:

- benchmark the same semantic tasks across `box baseline` and `knowledge workspace`

Need:

- shared task ids between control and solver-driven scenes
- timed task runs
- comparable interaction counts
- persistent result summaries

Exit criteria:

- DUS can show at least one measurable advantage over the rigid control scene

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

1. grow ingest beyond packet-only inputs
   - add a less-DUS-specific knowledge bundle adapter
   - validate and catalog those fixtures
   - keep packet as the normalized internal handoff, not the only public seam
2. deepen the benchmark harness into a repeatable evaluation workflow
   - export runs
   - compare runs across demo lanes
   - archive result summaries
3. stabilize readability-first surfaces
   - text rendering should be trustworthy in `plain`
   - field mode should become secondary, not mandatory
4. keep strengthening core contracts
   - tighter schemas
   - more deterministic fixtures
   - clearer diagnostics and snapshot diffs
5. only then push further on scale, editing, and broader SDK ambitions

## Near-Term Sequence

### Next 2 Weeks

- finish upstream bundle ingest
- keep hardening browser validation
- make benchmark exports easy to compare offline

### Next 4 to 6 Weeks

- formalize benchmark tasks and control-vs-runtime result reporting
- improve plain-mode text/image readability enough that the demo can be judged on utility, not only novelty
- add more fixture scenes and ingest samples

### Next 2 to 3 Months

- refine the runtime contract toward a small SDK surface
- improve explainability exports and replay tooling
- begin attacking scaling work, especially solve partitioning and larger scene behavior
