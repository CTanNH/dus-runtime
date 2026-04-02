export function createFixtureScene() {
  return {
    metadata: {
      demoId: "fixture",
      title: "Core Fixture",
      subtitle: "Deterministic headless runtime fixture",
      description: "A small semantic scene used to verify scene normalization, scaffold determinism, and solver stability."
    },
    nodes: [
      {
        id: "claim",
        kind: "text",
        contentRef: "claim",
        intrinsicSize: { width: 2.8, height: 0.74 },
        confidence: 0.94,
        importance: 0.96,
        stiffness: 0.88,
        clusterId: "answer",
        pinned: false,
        bridgeRef: "claim",
        rendererPayload: { type: "text" },
        metadata: { role: "answer", band: "answer", orderKey: 0, queryHint: 0.9 }
      },
      {
        id: "support",
        kind: "text",
        contentRef: "support",
        intrinsicSize: { width: 2.4, height: 0.62 },
        confidence: 0.86,
        importance: 0.78,
        stiffness: 0.72,
        clusterId: "evidence",
        pinned: false,
        bridgeRef: "support",
        rendererPayload: { type: "text" },
        metadata: { role: "evidence", band: "evidence", orderKey: 1, queryHint: 0.8 }
      },
      {
        id: "risk",
        kind: "text",
        contentRef: "risk",
        intrinsicSize: { width: 2.0, height: 0.58 },
        confidence: 0.38,
        importance: 0.66,
        stiffness: 0.34,
        clusterId: "risk",
        pinned: false,
        bridgeRef: "risk",
        rendererPayload: { type: "text" },
        metadata: { role: "contradiction", band: "contradiction", orderKey: 2, queryHint: 0.42 }
      },
      {
        id: "figure",
        kind: "image",
        contentRef: "figure",
        intrinsicSize: { width: 2.1, height: 1.0 },
        confidence: 0.72,
        importance: 0.62,
        stiffness: 0.46,
        clusterId: "evidence",
        pinned: false,
        bridgeRef: "figure",
        rendererPayload: { type: "image" },
        metadata: { role: "figure", band: "figure", orderKey: 3, figureSide: "right", queryHint: 0.64 }
      },
      {
        id: "citation",
        kind: "text",
        contentRef: "citation",
        intrinsicSize: { width: 1.9, height: 0.42 },
        confidence: 0.9,
        importance: 0.58,
        stiffness: 0.92,
        clusterId: "citation",
        pinned: true,
        bridgeRef: "citation",
        rendererPayload: { type: "text" },
        metadata: { role: "citation", band: "citation", orderKey: 4, queryHint: 0.74 }
      }
    ],
    relations: [
      { from: "support", to: "claim", type: "supports", weight: 0.9, idealDistance: 1.48 },
      { from: "risk", to: "claim", type: "contradicts", weight: 0.84, idealDistance: 2.1 },
      { from: "figure", to: "support", type: "supports", weight: 0.78, idealDistance: 1.36 },
      { from: "citation", to: "support", type: "cites", weight: 0.72, idealDistance: 1.02 }
    ],
    constraints: [
      { id: "viewport-hard", type: "viewport", mode: "hard", params: { padding: 0.18 } },
      { id: "non-overlap-hard", type: "non_overlap", mode: "hard", params: { padding: 0.08 } },
      { id: "reading-order-soft", type: "reading_order", mode: "soft", params: { weight: 1.0 } },
      { id: "relation-soft", type: "related", mode: "soft", params: { weight: 0.8 } }
    ],
    viewport: {
      minX: -5.5,
      maxX: 5.5,
      minY: -3.4,
      maxY: 3.4
    },
    interactionField: {
      cursorX: 0.0,
      cursorY: 0.0,
      cursorVx: 0.0,
      cursorVy: 0.0,
      focusNodeId: null,
      selectedNodeId: null,
      queryPulse: 0.0
    }
  };
}
