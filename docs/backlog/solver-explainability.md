# Build explainability tooling for solver decisions

## Problem

DUS only becomes trustworthy if it can explain why nodes moved, overlapped, separated, or stayed pinned. At the moment the debug surface is promising, but still too thin for serious adoption.

## Goal

Turn explainability into a first-class product feature of the runtime.

## Deliverables

- per-node loss contribution breakdowns with directional vectors
- target pose vs solved pose overlay
- overlap heatmap improvements
- replayable seeded solver trace
- a “why is this here?” inspector mode for selected nodes

## Exit Criteria

- a user can inspect a node and understand the top forces/losses acting on it
- layout changes are diagnosable instead of feeling magical
- debug output becomes stable enough to support regression tests and benchmark runs
