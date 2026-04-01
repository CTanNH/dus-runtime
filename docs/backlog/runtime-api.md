# Stabilize the public runtime API

## Problem

The core abstractions exist, but the outward-facing contract is still too fluid for outside adoption. Right now the runtime is usable by the demo, yet not documented or typed tightly enough for a second renderer or app to depend on it with confidence.

## Goal

Define and freeze a minimal v0 runtime contract around:

- scene shape
- node and relation semantics
- constraint shape
- layout output
- debug output
- host bridge contract

## Deliverables

- formal scene schema documentation
- explicit API surface for `createDusRuntime(config)`
- deterministic fixture scenes and expected layout tolerances
- one additional adapter or app consuming the runtime without reaching into internals

## Exit Criteria

- another developer can build against the runtime without editing core files
- README and architecture docs match the actual exported contract
- the runtime has a narrow, defendable public API instead of “whatever the demo uses today”
