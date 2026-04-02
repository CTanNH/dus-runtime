export async function buildKnowledgeWorkspaceScene(assetProvider) {
  let order = 0;
  const nodes = [];
  const relations = [];
  const constraints = [
    { id: "viewport-hard", type: "viewport", mode: "hard", params: { padding: 0.20 } },
    { id: "non-overlap-hard", type: "non_overlap", mode: "hard", params: { padding: 0.08 } },
    { id: "reading-order-soft", type: "reading_order", mode: "soft", params: { weight: 1.1 } },
    { id: "relation-soft", type: "related", mode: "soft", params: { weight: 0.8 } }
  ];

  function addTextNode(definition) {
    const run = assetProvider.createTextRun(definition.id, definition.text, {
      maxWidth: definition.maxWidth,
      lineHeight: definition.lineHeight,
      lineAdvance: definition.lineAdvance,
      paddingX: definition.paddingX,
      paddingY: definition.paddingY
    });

    nodes.push({
      id: definition.id,
      kind: "text",
      contentRef: run.id,
      intrinsicSize: { width: run.paddedWidth, height: run.paddedHeight },
      targetPose: null,
      confidence: definition.confidence,
      importance: definition.importance,
      stiffness: definition.stiffness,
      clusterId: definition.clusterId,
      pinned: Boolean(definition.pinned),
      bridgeRef: definition.bridgeRef ?? definition.id,
      rendererPayload: { type: "text", textRunId: run.id },
      metadata: {
        role: definition.role,
        band: definition.band,
        orderKey: order,
        queryHint: definition.queryHint ?? definition.confidence,
        flowGap: definition.flowGap,
        figureSide: definition.figureSide
      }
    });
    order += 1;
  }

  function addImageNode(definition) {
    const image = assetProvider.getImage(definition.imageId);
    const baseHeight = definition.height ?? 1.06;
    const width = baseHeight * (image?.aspect ?? 1.8);

    nodes.push({
      id: definition.id,
      kind: "image",
      contentRef: definition.imageId,
      intrinsicSize: { width, height: baseHeight },
      targetPose: null,
      confidence: definition.confidence,
      importance: definition.importance,
      stiffness: definition.stiffness,
      clusterId: definition.clusterId,
      pinned: false,
      bridgeRef: definition.bridgeRef ?? definition.id,
      rendererPayload: { type: "image", imageId: definition.imageId },
      metadata: {
        role: definition.role,
        band: definition.band,
        orderKey: order,
        queryHint: definition.queryHint ?? definition.confidence,
        figureSide: definition.figureSide
      }
    });
    order += 1;
  }

  addTextNode({
    id: "lead-title",
    text: "Differentiable UI Surface",
    role: "lead",
    band: "lead",
    clusterId: "lead",
    maxWidth: 3.2,
    lineHeight: 0.38,
    paddingX: 0.24,
    paddingY: 0.18,
    confidence: 0.98,
    importance: 1.0,
    stiffness: 0.96
  });

  addTextNode({
    id: "answer-hypothesis",
    text: "Answers stabilize when evidence, counter-evidence, and uncertainty stay co-visible inside one navigable field.",
    role: "answer",
    band: "answer",
    clusterId: "answer",
    maxWidth: 4.1,
    lineHeight: 0.26,
    paddingX: 0.20,
    paddingY: 0.16,
    confidence: 0.93,
    importance: 0.94,
    stiffness: 0.92
  });

  addTextNode({
    id: "answer-system",
    text: "The runtime is not a card stack. It solves toward readable targets while continuously negotiating collision, order, relation, and focus.",
    role: "answer",
    band: "answer",
    clusterId: "answer",
    maxWidth: 4.0,
    lineHeight: 0.23,
    paddingX: 0.18,
    paddingY: 0.15,
    confidence: 0.88,
    importance: 0.86,
    stiffness: 0.82
  });

  addTextNode({
    id: "answer-risk",
    text: "Low-confidence phrases remain visually unstable, but they no longer break the reading surface.",
    role: "answer",
    band: "answer",
    clusterId: "answer",
    maxWidth: 3.6,
    lineHeight: 0.23,
    paddingX: 0.18,
    paddingY: 0.14,
    confidence: 0.74,
    importance: 0.74,
    stiffness: 0.62
  });

  const evidenceNodes = [
    ["evidence-anchor", "Citation-linked scaffolds preserve reading order under interaction.", 0.92, 0.88],
    ["evidence-focus", "Semantic focus pulls related nodes into a local basin without collapsing the global layout.", 0.84, 0.78],
    ["evidence-debug", "Per-node loss accounting makes the runtime explainable instead of magical.", 0.89, 0.84],
    ["evidence-bridge", "DOM overlays can attach to solved poses for selection, annotation, and accessibility.", 0.86, 0.80],
    ["evidence-image", "Figures behave like first-class evidence nodes instead of decorative sidecars.", 0.77, 0.72],
    ["evidence-plain", "A plain renderer keeps the system readable when fluid styling is disabled.", 0.95, 0.90]
  ];

  for (const [id, text, confidence, importance] of evidenceNodes) {
    addTextNode({
      id,
      text,
      role: "evidence",
      band: "evidence",
      clusterId: "evidence",
      maxWidth: 3.2,
      lineHeight: 0.21,
      paddingX: 0.16,
      paddingY: 0.13,
      confidence,
      importance,
      stiffness: 0.42 + confidence * 0.44
    });
  }

  const contradictionNodes = [
    ["contradiction-ui", "A pure field renderer can obscure text if readability constraints are too weak.", 0.34, 0.66],
    ["contradiction-scale", "Naive all-pairs optimization will stall before thousand-node scenes are pleasant.", 0.42, 0.72],
    ["contradiction-adoption", "If the runtime cannot explain itself, teams will retreat to deterministic boxes.", 0.51, 0.78]
  ];

  for (const [id, text, confidence, importance] of contradictionNodes) {
    addTextNode({
      id,
      text,
      role: "contradiction",
      band: "contradiction",
      clusterId: "contradiction",
      maxWidth: 2.5,
      lineHeight: 0.20,
      paddingX: 0.16,
      paddingY: 0.14,
      confidence,
      importance,
      stiffness: 0.22 + confidence * 0.30
    });
  }

  addImageNode({
    id: "figure-retrieval-map",
    imageId: "retrieval-map",
    role: "figure",
    band: "figure",
    clusterId: "figure-support",
    confidence: 0.82,
    importance: 0.70,
    stiffness: 0.54,
    figureSide: "right"
  });

  addImageNode({
    id: "figure-uncertainty-ridge",
    imageId: "uncertainty-ridge",
    role: "figure",
    band: "figure",
    clusterId: "figure-contradiction",
    confidence: 0.44,
    importance: 0.62,
    stiffness: 0.30,
    figureSide: "right"
  });

  addImageNode({
    id: "figure-citation-lattice",
    imageId: "citation-lattice",
    role: "figure",
    band: "figure",
    clusterId: "figure-evidence",
    confidence: 0.76,
    importance: 0.66,
    stiffness: 0.46,
    figureSide: "left"
  });

  const citationNodes = [
    ["citation-a", "[A] Retrieval trace · 128 runs", 0.88],
    ["citation-b", "[B] Counter-evidence log · 14 contradictions", 0.70],
    ["citation-c", "[C] Confidence decay probe · 2.4s window", 0.58],
    ["citation-d", "[D] Layout replay seed · 11", 0.94],
    ["citation-e", "[E] Host bridge audit · DOM overlay attached", 0.86]
  ];

  for (const [id, text, confidence] of citationNodes) {
    addTextNode({
      id,
      text,
      role: "citation",
      band: "citation",
      clusterId: "citation",
      maxWidth: 2.2,
      lineHeight: 0.18,
      paddingX: 0.12,
      paddingY: 0.10,
      confidence,
      importance: 0.42 + confidence * 0.2,
      stiffness: 0.36 + confidence * 0.28
    });
  }

  const tokenNodes = [
    ["token-co-visible", "co-visible", 0.95],
    ["token-uncertainty", "uncertainty", 0.40],
    ["token-readable", "readable", 0.90],
    ["token-constraint", "constraint", 0.84],
    ["token-overlap", "overlap", 0.52],
    ["token-focus", "focus field", 0.72],
    ["token-loss", "loss graph", 0.88],
    ["token-bridge", "host bridge", 0.64]
  ];

  for (const [id, text, confidence] of tokenNodes) {
    addTextNode({
      id,
      text,
      role: "token",
      band: "token",
      clusterId: "token",
      maxWidth: 1.24,
      lineHeight: 0.17,
      paddingX: 0.12,
      paddingY: 0.09,
      confidence,
      importance: 0.40 + confidence * 0.28,
      stiffness: 0.22 + confidence * 0.30,
      flowGap: 0.08
    });
  }

  const supports = [
    ["evidence-anchor", "answer-hypothesis"],
    ["evidence-focus", "answer-system"],
    ["evidence-debug", "answer-system"],
    ["evidence-bridge", "answer-system"],
    ["evidence-image", "answer-hypothesis"],
    ["evidence-plain", "answer-risk"],
    ["figure-retrieval-map", "evidence-anchor"],
    ["figure-uncertainty-ridge", "contradiction-ui"],
    ["figure-citation-lattice", "evidence-debug"]
  ];
  for (const [from, to] of supports) relations.push({ from, to, type: "supports", weight: 0.9 });

  relations.push({ from: "contradiction-ui", to: "answer-hypothesis", type: "contradicts", weight: 1.0, idealDistance: 2.3 });
  relations.push({ from: "contradiction-scale", to: "answer-system", type: "contradicts", weight: 0.9, idealDistance: 2.4 });
  relations.push({ from: "contradiction-adoption", to: "answer-system", type: "contradicts", weight: 0.72, idealDistance: 2.2 });

  relations.push({ from: "citation-a", to: "evidence-anchor", type: "cites", weight: 0.82, idealDistance: 1.4 });
  relations.push({ from: "citation-b", to: "contradiction-ui", type: "cites", weight: 0.70, idealDistance: 1.2 });
  relations.push({ from: "citation-c", to: "answer-risk", type: "cites", weight: 0.62, idealDistance: 1.3 });
  relations.push({ from: "citation-d", to: "evidence-debug", type: "cites", weight: 0.76, idealDistance: 1.3 });
  relations.push({ from: "citation-e", to: "evidence-bridge", type: "cites", weight: 0.72, idealDistance: 1.1 });

  relations.push({ from: "token-co-visible", to: "answer-hypothesis", type: "belongs_to", weight: 0.75, idealDistance: 1.0 });
  relations.push({ from: "token-uncertainty", to: "answer-risk", type: "belongs_to", weight: 0.72, idealDistance: 0.92 });
  relations.push({ from: "token-readable", to: "evidence-plain", type: "belongs_to", weight: 0.66, idealDistance: 0.96 });
  relations.push({ from: "token-constraint", to: "answer-system", type: "belongs_to", weight: 0.74, idealDistance: 0.92 });
  relations.push({ from: "token-overlap", to: "contradiction-scale", type: "belongs_to", weight: 0.56, idealDistance: 1.08 });
  relations.push({ from: "token-focus", to: "evidence-focus", type: "belongs_to", weight: 0.68, idealDistance: 0.94 });
  relations.push({ from: "token-loss", to: "evidence-debug", type: "belongs_to", weight: 0.72, idealDistance: 0.94 });
  relations.push({ from: "token-bridge", to: "evidence-bridge", type: "belongs_to", weight: 0.64, idealDistance: 0.94 });

  return {
    metadata: {
      demoId: "knowledge",
      title: "Knowledge Workspace",
      subtitle: "Task demo for AI-native interfaces",
      description: "A narrower workspace that tries to prove usefulness: answers, evidence, contradictions, figures, and citations share one solvable reading surface.",
      intent: "task",
      watchFor: [
        "The hypothesis should remain readable while evidence and contradiction nodes negotiate around it.",
        "Low-confidence contradiction fragments should feel warmer and less rigid than the cold, high-confidence answer blocks.",
        "The same solved layout should stay coherent in plain, field, and debug views."
      ],
      guideSteps: [
        {
          id: "hypothesis",
          label: "Main claim",
          nodeId: "answer-hypothesis",
          description: "Start here. This is the statement the workspace is trying to stabilize without collapsing surrounding evidence."
        },
        {
          id: "support",
          label: "Support chain",
          nodeId: "evidence-anchor",
          description: "These evidence nodes should settle near the answer, preserving proximity without becoming a fixed card stack."
        },
        {
          id: "risk",
          label: "Low-confidence risk",
          nodeId: "contradiction-ui",
          description: "This contradiction node is intentionally weaker and hotter. It should stay legible without dominating the answer."
        },
        {
          id: "figure",
          label: "Figure anchor",
          nodeId: "figure-uncertainty-ridge",
          description: "Images behave as first-class evidence. They are anchored by relation, not by a side panel."
        },
        {
          id: "citation",
          label: "Citation band",
          nodeId: "citation-b",
          description: "Citations should remain nearby and ordered, but they are still part of the same solved surface."
        }
      ]
    },
    nodes,
    relations,
    constraints,
    viewport: {
      minX: -7.0,
      maxX: 7.0,
      minY: -4.6,
      maxY: 4.6
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
