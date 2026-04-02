# DUS Architecture

## One Sentence

DUS is a headless semantic layout runtime with renderer adapters.

The runtime solves where content should live. The adapters decide how that solved state is surfaced.

## System Layers

```text
scene
  -> scaffold
  -> hybrid solver
  -> solved layout + debug state
  -> renderer adapter(s) + host bridge
```

The current knowledge demo also has a higher-level ingest path:

```text
knowledge packet
  -> packet adapter
  -> semantic document
  -> normalized scene
  -> scaffold
  -> solver
  -> adapters
```

## Scene Model

The solver does not operate on DOM elements or CSS boxes. It operates on semantic nodes:

- `text`
- `image`
- `slot`

Each node carries:

- intrinsic size
- ideal target pose
- confidence
- importance
- stiffness
- cluster membership
- optional bridge reference
- renderer payload

Relations connect nodes with meaning:

- `supports`
- `contradicts`
- `cites`
- `belongs_to`
- `related`

Constraints provide the runtime's operating envelope:

- `viewport`
- `non_overlap`
- `reading_order`
- relation-derived spacing
- anchors/pinned nodes

## Runtime Flow

### 1. Scene normalization

`src/core/runtime.js`

The input scene is normalized, validated, and cloned so downstream stages can mutate solver state without mutating user input.

That contract layer now lives in `src/core/contracts.js`.

Its current job is pragmatic, not ornamental:

- reject duplicate or missing node ids
- drop relations that point at unknown nodes
- clamp or default unstable numeric inputs
- normalize viewport and interaction-field shape
- surface warnings/errors through runtime diagnostics

This matters because DUS is trying to become infrastructure. If the scene contract is vague, every adapter and every demo quietly invents its own rules.

### 1.5 Packet ingest

`src/core/knowledgePacket.js`

The runtime now has a first upstream-facing adapter layer for knowledge packets. This layer is intentionally narrow:

- claim
- answer blocks
- evidence
- contradictions
- citations
- figures
- tokens

The packet adapter expands that structure into a semantic document, which is then converted into the scene contract consumed by the runtime.

This is strategically important. It means DUS is starting to own an input pipeline for AI-native surfaces instead of only consuming hand-authored demo scenes.

### 2. Scaffold build

`src/core/scaffold.js`

The scaffold is deterministic. It builds target poses and reading-order relationships before iterative solving starts.

Today the scaffold is CPU-side and intentionally explicit:

- line/paragraph flow
- band placement
- citation and figure seeding
- target positions used by later optimization

This matters because DUS is not “pure chaos plus repulsion”. It always has an ideal reading structure underneath the field.

### 3. Hybrid solve

`src/core/solver.js`

Current solver design:

- soft losses handled by iterative gradient-like updates
- hard constraints handled by projection/clamping passes

Current loss components:

- `target`
- `overlap`
- `order`
- `relation`
- `viewport`
- `focus`

Current hard constraints:

- minimum readable width/height
- viewport bounds
- non-overlap projection
- pin/anchor preservation

Important truth: the solver is currently CPU-driven. The renderer is GPU-driven. DUS is already architected for a future GPU solver, but that is not what ships today.

### 4. Layout materialization

`src/core/runtime.js`

Solver state is materialized into:

- `layout.nodePoses`
- `visibility`
- per-node debug losses
- active constraint state

This is the contract between the headless runtime and any surface adapter.

### 5. Explainability export

`src/core/explainability.js`

Explainability is now generated as a runtime surface, not only as a visual overlay.

The runtime exposes:

- `getExplainability()`
- `explainNode(nodeId)`

That export packages:

- scene-level totals, convergence tail, and unstable-node summaries
- per-node ranked losses
- active constraints
- nearby-neighbor and relation summaries
- compact node narratives

This matters because a loss-driven interface runtime will not be trusted if it only solves and never explains why it solved that way.

## Surface Adapters

## WebGPU renderer

`src/adapters/webgpu/renderer.js`

The current renderer is not the runtime. It is one adapter over solved node poses.

It supports:

- panel/background surfaces
- MSDF text
- raster images
- plain mode
- field mode
- debug overlays
- pan/zoom camera

The most important architectural property here is that `plain` and `field` both read the same solved layout.

## DOM host bridge

`src/adapters/dom/hostBridge.js`

The host bridge is where selection, callouts, accessibility overlays, and future editable surfaces attach.

That bridge exists outside the solver. The solver owns positions. The host bridge consumes them.

This split is essential if DUS is to become infrastructure instead of only a visual demo.

## Demo App

`src/app/knowledgeWorkspace.js`

The current wedge is intentionally narrow: an AI knowledge workspace.

That workspace is now fed by a local `knowledge-packet.json` asset rather than a hard-coded inline scene object, and it can be overridden with a `?packet=` query parameter for external packet experiments.

Why this wedge:

- answers and evidence need co-visibility
- contradictions need distance without disconnection
- confidence should affect behavior, not just color
- figures should be first-class nodes
- a plain card stack tends to flatten the semantics

## Benchmark Harness

`src/core/benchmark.js`

The benchmark harness sits above the runtime and below the demo chrome.

Its purpose is to turn demo claims into measurable runs:

- start a named task
- track focus, selection, pan, zoom, fit, and replay counts
- record elapsed time until completion
- persist comparable results across demo lanes for shared task ids

This matters because DUS cannot become infrastructure on novelty alone. It needs a path to proving advantage against a rigid control surface.

## Explainability

DUS only becomes viable if it can explain itself.

Current debug surface already exposes:

- convergence trace
- total loss
- per-node loss breakdown
- active constraints
- selected node motion

The important shift is that explainability is no longer trapped inside the DOM overlay. It now exists as runtime data that adapters and tests can consume.

Future explainability work should include:

- explicit loss contribution vectors
- overlap heatmaps as first-class data
- replayable seeded traces
- “why is this node here?” inspection

## What Will Likely Change

- exact scene schema
- adapter contracts
- solver implementation details
- shader organization

## What Should Remain Stable

- semantic nodes as the fundamental unit
- scaffold before solve
- hard constraints plus soft losses
- renderer adapters over solved poses
- explainability as a first-class requirement

## Mental Model

Do not think of DUS as “WebGPU UI”.

Think of it as:

1. a semantic scene graph
2. a loss/constraint runtime
3. one or more surfaces that read the solved state

That is the actual architecture.
