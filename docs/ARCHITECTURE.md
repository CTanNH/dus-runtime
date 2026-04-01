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

The input scene is normalized and cloned so downstream stages can mutate solver state without mutating user input.

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

Why this wedge:

- answers and evidence need co-visibility
- contradictions need distance without disconnection
- confidence should affect behavior, not just color
- figures should be first-class nodes
- a plain card stack tends to flatten the semantics

## Explainability

DUS only becomes viable if it can explain itself.

Current debug surface already exposes:

- convergence trace
- total loss
- per-node loss breakdown
- active constraints
- selected node motion

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
