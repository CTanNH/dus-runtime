# DUS

Loss-driven semantic layout runtime for AI-native interfaces.

DUS is not a new button toolkit and it is not a liquid shader toy. The core idea is simpler and more dangerous:

- UI nodes are semantic objects, not box-model fragments.
- Layout is solved from targets, relations, and constraints.
- Interaction perturbs a field that the solver and renderer both understand.
- Rendering is adapter-driven. A fluid field is one surface, not the whole product.

The current repo is an experimental runtime plus three official demos:

- `field benchmark`
  a denser surface meant to show continuity, confidence gradients, and non-box motion at a glance
- `box baseline`
  a rigid control scene using the same content, pinned into a deterministic reading stack
- `knowledge workspace`
  a narrower task demo where answers, evidence, contradictions, citations, tokens, and figures co-exist inside one navigable surface

![DUS knowledge workspace](./docs/assets/knowledge-workspace.png)

## What DUS Is

DUS is a headless runtime with three layers:

1. `core`
   CPU scaffold generation, hybrid solving, scene normalization, layout/debug state.
2. `adapters`
   WebGPU renderer, DOM host bridge, future plain/native surfaces.
3. `app`
   A demo that proves the runtime can organize semantic content better than a naive box stack in at least one narrow task.

This repo currently demonstrates:

- semantic nodes with confidence, importance, stiffness, and relations
- scaffold layout plus iterative optimization
- hard readability constraints such as bounds and non-overlap
- packet-driven scene ingestion for AI/retrieval-style knowledge payloads
- `plain`, `field`, and `debug` surfaces over the same solved layout
- a DOM inspector/host bridge layered over a WebGPU canvas
- MSDF text and raster image rendering inside the same runtime

## What DUS Is Not

- not a replacement for normal app chrome, forms, or generic marketing sites
- not a finished framework API
- not a full automatic differentiation engine
- not yet a proven React/CSS replacement

The claim is narrower:

> some AI-native interfaces are a bad fit for discrete box rules, and can be better expressed as semantic nodes solved under losses and constraints.

## Why This Exists

Traditional UI stacks are strong at cards, forms, grids, and deterministic page structure. They are weak at interfaces where these properties matter at the same time:

- uncertainty
- contradiction
- evidence proximity
- semantic relations
- continuous reorganization under interaction

DUS tries to make those properties first-class instead of bolting them on after layout.

## Repository Layout

```text
src/
  core/
    benchmark.js      task benchmark harness + cross-demo result summaries
    benchmarkStudy.js offline study aggregation + markdown summaries
    contracts.js      scene contract normalization + diagnostics
    fixtures.js       deterministic headless fixture scene
    knowledgeScene.js packet-to-scene adapter + validation asset provider
    snapshot.js       serializable runtime snapshot / report export
    runtime.js        headless runtime API
    scaffold.js       deterministic target/scaffold layout
    solver.js         hybrid loss + projection solver
    utils.js          shared geometry and scene helpers
  adapters/
    webgpu/
      assetProvider.js
      renderer.js     plain/field renderer adapter
    dom/
      hostBridge.js   inspector + overlay controls
  app/
    knowledgePackets.js   built-in packet fixture catalog for workspace ingest
    knowledgeWorkspace.js
  dus.wgsl            field/text/image shader module
  main.js             demo entrypoint
index.html            minimal launcher
dist/dus-poc/         mirrored runnable artifact
```

The `.ts` files currently mirror the `.js` source-of-truth modules.

## Runtime Shape

The headless runtime is exposed through `createDusRuntime(config)` and returns an object with this shape:

- `setScene(scene)`
- `step(dt)`
- `solve(iterations, dt)`
- `getLayout()`
- `getDebugState()`
- `getSceneDiagnostics()`
- `getExplainability()`
- `explainNode(nodeId)`
- `getScene()`
- `getInteractionField()`
- `getSnapshot(options?)`
- `exportSnapshot(options?)`
- `importSnapshot(snapshot)`
- `hitTest(point)`
- `bindHostBridge(bridge)`
- `setInteractionField(field)`

The runtime consumes scenes made of:

- `nodes`
- `relations`
- `constraints`
- `viewport`
- `interactionField`

and produces solved poses plus explainability data.

The knowledge demo no longer relies on an inline hand-built scene. It now flows through:

```text
knowledge packet JSON
  -> fixture catalog / custom packet URL
  -> packet adapter
  -> semantic document
  -> normalized scene contract
  -> scaffold + solver
  -> renderer adapters
```

That packet layer is the first concrete step toward ingesting real LLM/retrieval output instead of demo-only scene objects.

The repo now ships a packet fixture catalog, not just one sample payload. Knowledge scenes can be loaded from:

- the default workspace packet
- several built-in scenario packets
- an explicit `?packet=` URL override

Packet diagnostics are preserved through ingest metadata so the runtime can surface what was dropped or normalized instead of hiding that work.

Knowledge packets now carry a formal schema identity at ingest time:

- `schemaId = dus-knowledge-packet`
- `schemaVersion = 1`

Offline validation reports packet-level errors separately from scene-contract errors, so future external adapters have a real compatibility boundary instead of a best-effort JSON convention.

Task-oriented scenes can also expose benchmark runs through scene metadata. The runtime demos now use that layer to:

- start named task runs
- time completion against explicit node targets
- record interaction counts such as focus, selection, pan, zoom, and fit
- compare `baseline` and `knowledge` runs for shared task ids

The explainability surface is now a first-class runtime export rather than only an overlay concern. It reports:

- scene-level convergence and instability summaries
- per-node dominant losses and ranked loss vectors
- active constraints and nearby neighbors
- relation summaries
- a compact narrative for "why is this node here?"

For regression work and offline debugging, the runtime can also export and restore deterministic snapshots containing:

- normalized scene state
- scene diagnostics
- scaffold target and initial poses
- solver node state
- debug totals and convergence traces
- interaction-field state
- compact scene summaries suited for diff-based review

Before solving, scenes are normalized through a contract layer:

- duplicate or missing node ids become hard errors
- dangling relations are dropped with warnings
- unknown kinds/types fall back to safe defaults
- viewport and interaction fields are normalized into a stable runtime shape

The repo now also ships a deterministic core fixture plus a runtime-level test harness:

```powershell
cd D:\Projects\DUS
npm run test:core
```

## Demo

DUS now ships three official demo lanes:

1. `field benchmark`
   The first-impression / hero scene. It is denser, tuned for `field` mode, and meant to answer: “what feels different here that box UI usually does not?”
2. `box baseline`
   The control scene. It keeps the same content pinned into a deterministic stack so DUS can be compared against a more conventional reading surface.
3. `knowledge workspace`
   The task scene. It is narrower and more explicit, meant to answer: “what problem does this runtime solve for AI-native interfaces?”

`baseline` and `knowledge workspace` now share comparable benchmark task ids so the repo can move toward proof-of-advantage instead of only side-by-side screenshots.

Both scenes can be inspected in three view presets:

- `plain` for readable structure
- `field` for continuous deformation and confidence-sensitive styling
- `debug` for heat/target overlays

## Run

Serve the repo over HTTP. Do not use `file://`.

```powershell
cd D:\Projects\DUS
npx serve . -l 8000
```

Open:

```text
http://127.0.0.1:8000/
```

Official demo URLs:

```text
http://127.0.0.1:8000/?demo=field
http://127.0.0.1:8000/?demo=baseline
http://127.0.0.1:8000/?demo=knowledge
```

The knowledge workspace can also load an alternate packet at runtime:

```text
http://127.0.0.1:8000/?demo=knowledge&packetId=incident-triage
http://127.0.0.1:8000/?demo=knowledge&packetId=model-comparison
http://127.0.0.1:8000/?demo=knowledge&packet=/absolute-or-relative-packet.json
http://127.0.0.1:8000/?demo=knowledge&bundleId=runtime-adoption
http://127.0.0.1:8000/?demo=knowledge&bundleId=retrieval-trace
http://127.0.0.1:8000/?demo=knowledge&bundle=/absolute-or-relative-bundle.json
```

Use `packetId` for built-in packet fixtures, `packet` for a custom packet override, `bundleId` for built-in upstream bundle fixtures, and `bundle` for a custom bundle override.

Validate a packet offline before opening it in the browser:

```powershell
cd D:\Projects\DUS
npm run validate:packet -- .\src\app\knowledge-packet.json
```

Validate every bundled packet fixture in one pass:

```powershell
cd D:\Projects\DUS
npm run validate:packets
```

Validate an upstream knowledge bundle before it is adapted into a DUS packet:

```powershell
cd D:\Projects\DUS
npm run validate:bundle -- .\src\app\bundles\runtime-adoption.bundle.json
```

Validate every bundled bundle fixture:

```powershell
cd D:\Projects\DUS
npm run validate:bundles
```

Export a deterministic runtime report for a packet or the core fixture:

```powershell
cd D:\Projects\DUS
npm run export:report -- workspace
npm run export:report -- incident-triage --out .\artifacts\incident-triage.report.json
npm run export:report -- bundle:runtime-adoption --out .\artifacts\runtime-adoption.report.json
npm run export:report -- fixture:core
```

Export benchmark runs from the in-browser guide and merge multiple exported reports offline:

```powershell
cd D:\Projects\DUS
npm run compare:benchmarks -- .\artifacts\knowledge.json .\artifacts\baseline.json .\artifacts\benchmark-merged.json
npm run study:benchmarks -- .\artifacts\knowledge.json .\artifacts\baseline.json
npm run benchmark:scripted -- knowledge .\artifacts\scripted-knowledge.json
npm run study:scripted
```

`compare:benchmarks` now emits a structured `dus-benchmark-study` payload, and `study:benchmarks` writes both `artifacts/benchmark-study.json` and a human-readable `artifacts/benchmark-study.md`.

`benchmark:scripted` drives the in-browser task harness through `window.__DUS__` and emits a `dus-scripted-benchmark-run` wrapper. `study:scripted` runs both `knowledge` and `baseline`, then produces a merged study plus Markdown summary in one step. The scripted path forces `?font=fallback` so CI and local automation do not stall on remote MSDF fetches.

If `serve` is unavailable:

```powershell
cd D:\Projects\DUS
py -m http.server 8000 --bind 127.0.0.1
```

If you prefer package scripts:

```powershell
cd D:\Projects\DUS
npm run serve
```

## Controls

- `1` plain
- `2` field
- `3` debug
- `b` open field benchmark
- `c` open box baseline
- `k` open knowledge workspace
- `f` fit camera to solved layout
- `h` toggle overlap heat
- `t` toggle target ghost
- `r` replay solve from seed
- `space` pause
- drag to pan
- wheel to zoom

## Current Status

This is a research-grade prototype, not a finished platform.

What is real already:

- the semantic scene model
- scaffold + solver split
- renderer adapter split
- DOM host bridge concept
- knowledge workspace wedge
- packet fixture catalog + diagnostics-preserving ingest
- repeatable browser validation scripts

What is still missing:

- stable external API
- broader test coverage
- GPU solver path for large scenes
- text selection / input / IME quality
- accessibility semantics beyond the current host bridge overlay

## Strategic Direction

The long-term bet is not “liquid UI”.

The bet is:

> UI can be expressed as semantic nodes plus targets, relations, losses, and hard constraints, with multiple renderers attached afterward.

If this direction works, DUS becomes a runtime for AI-native knowledge surfaces, not just a visual experiment.

See:

- [Manifesto](./docs/MANIFESTO.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Roadmap](./docs/ROADMAP.md)

## License

DUS is licensed under [Apache-2.0](./LICENSE).

Why Apache-2.0 for this project:

- permissive enough for broad adoption
- explicit patent grant, which matters for infrastructure work
- more comfortable for company/legal review than ultra-minimal licenses in some environments

If the project later needs a different governance model, the maintainer can revisit this, but Apache-2.0 is the current default because DUS is being positioned as open infrastructure, not source-available artware.
