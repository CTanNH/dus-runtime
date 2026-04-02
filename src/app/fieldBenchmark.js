export async function buildFieldBenchmarkScene(assetProvider) {
  let order = 0;
  const nodes = [];
  const relations = [];
  const constraints = [
    { id: "viewport-hard", type: "viewport", mode: "hard", params: { padding: 0.18 } },
    { id: "non-overlap-hard", type: "non_overlap", mode: "hard", params: { padding: 0.06 } },
    { id: "reading-order-soft", type: "reading_order", mode: "soft", params: { weight: 0.72 } },
    { id: "relation-soft", type: "related", mode: "soft", params: { weight: 1.0 } }
  ];

  function addTextNode(definition) {
    const run = assetProvider.createTextRun(definition.id, definition.text, {
      maxWidth: definition.maxWidth,
      lineHeight: definition.lineHeight,
      lineAdvance: definition.lineAdvance,
      paddingX: definition.paddingX,
      paddingY: definition.paddingY,
      tracking: definition.tracking
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
        scatter: definition.scatter
      }
    });
    order += 1;
  }

  function addImageNode(definition) {
    const image = assetProvider.getImage(definition.imageId);
    const baseHeight = definition.height ?? 1.08;
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
        figureSide: definition.figureSide,
        scatter: definition.scatter
      }
    });
    order += 1;
  }

  addTextNode({
    id: "benchmark-title",
    text: "DUS field benchmark",
    role: "lead",
    band: "lead",
    clusterId: "lead",
    maxWidth: 3.8,
    lineHeight: 0.42,
    paddingX: 0.26,
    paddingY: 0.18,
    confidence: 0.99,
    importance: 1.0,
    stiffness: 0.98,
    pinned: true,
    scatter: 0.0
  });

  addTextNode({
    id: "benchmark-subtitle",
    text: "A continuous surface benchmark: dense semantic nodes, no box layout, no DOM stacking.",
    role: "answer",
    band: "answer",
    clusterId: "lead",
    maxWidth: 4.8,
    lineHeight: 0.24,
    paddingX: 0.18,
    paddingY: 0.14,
    confidence: 0.93,
    importance: 0.86,
    stiffness: 0.84,
    pinned: true,
    scatter: 0.0
  });

  const clusterDefinitions = [
    {
      id: "retrieval",
      label: "retrieval ridge",
      band: "evidence",
      role: "evidence",
      confidence: 0.88,
      importance: 0.82,
      stiffness: 0.74,
      words: [
        "vector index", "query trace", "semantic cache", "reranker", "recall band",
        "hit cluster", "evidence map", "citation path", "retrieval prior", "trace merge",
        "memory shard", "source grain", "lookup basin", "result plume", "anchor set",
        "evidence flow", "context slice", "cache horizon"
      ]
    },
    {
      id: "uncertainty",
      label: "uncertainty ridge",
      band: "contradiction",
      role: "contradiction",
      confidence: 0.38,
      importance: 0.70,
      stiffness: 0.28,
      words: [
        "low confidence", "hallucination edge", "missing source", "claim drift", "weak entailment",
        "counter signal", "unclear step", "evidence gap", "trace fracture", "uncertain span",
        "conflict pocket", "ambiguous token", "soft contradiction", "confidence leak", "latent doubt",
        "fragile bridge", "support erosion", "hot zone"
      ]
    },
    {
      id: "planning",
      label: "planner basin",
      band: "evidence",
      role: "answer",
      confidence: 0.82,
      importance: 0.76,
      stiffness: 0.68,
      words: [
        "plan stack", "tool graph", "execution lane", "delegate node", "repair loop",
        "branch choice", "intent parse", "goal binding", "task flow", "route solve",
        "agent relay", "rollback gate", "actuator hint", "planner seam", "state fork",
        "search budget", "call chain", "action ridge"
      ]
    },
    {
      id: "reasoning",
      label: "reasoning field",
      band: "evidence",
      role: "evidence",
      confidence: 0.91,
      importance: 0.82,
      stiffness: 0.76,
      words: [
        "premise lock", "support chain", "counterpoint", "proof path", "logic seam",
        "claim spine", "inference braid", "evidence pulse", "support basin", "reason graph",
        "confidence slope", "causal strand", "source witness", "constraint weave", "fact anchor",
        "semantic pull", "proof lattice", "reason trace"
      ]
    },
    {
      id: "interface",
      label: "surface layer",
      band: "token",
      role: "token",
      confidence: 0.72,
      importance: 0.68,
      stiffness: 0.54,
      words: [
        "field mode", "plain mode", "debug heat", "target ghost", "focus ring",
        "semantic node", "surface adapter", "loss graph", "view transform", "camera fit",
        "host bridge", "selection layer", "glyph atlas", "msdf text", "heat overlay",
        "interaction field", "non-box", "fluid shell", "readable core", "surface warp"
      ]
    },
    {
      id: "runtime",
      label: "runtime core",
      band: "citation",
      role: "citation",
      confidence: 0.86,
      importance: 0.66,
      stiffness: 0.74,
      words: [
        "scaffold seed", "target pose", "hard clamp", "soft loss", "projection pass",
        "solver step", "layout trace", "seed replay", "relation map", "viewport gate",
        "overlap cost", "order penalty", "focus bias", "constraint list", "runtime tick",
        "pose publish", "scene graph", "adapter edge"
      ]
    }
  ];

  for (const cluster of clusterDefinitions) {
    addTextNode({
      id: `cluster-${cluster.id}`,
      text: cluster.label,
      role: cluster.role,
      band: cluster.band,
      clusterId: cluster.id,
      maxWidth: 2.0,
      lineHeight: 0.22,
      paddingX: 0.16,
      paddingY: 0.12,
      confidence: cluster.confidence,
      importance: cluster.importance,
      stiffness: cluster.stiffness,
      scatter: 0.45
    });

    for (let index = 0; index < cluster.words.length; index += 1) {
      const word = cluster.words[index];
      const jitter = (index % 6) / 5;
      addTextNode({
        id: `${cluster.id}-${index}`,
        text: word,
        role: cluster.role === "citation" ? "citation" : "token",
        band: cluster.band === "citation" ? "citation" : "token",
        clusterId: cluster.id,
        maxWidth: 1.64,
        lineHeight: 0.17 + (cluster.band === "citation" ? 0.01 : 0.0),
        paddingX: 0.10,
        paddingY: 0.08,
        tracking: 0.008,
        flowGap: 0.05,
        confidence: Math.max(0.16, Math.min(0.98, cluster.confidence - 0.14 + jitter * 0.18)),
        importance: Math.max(0.32, Math.min(0.94, cluster.importance - 0.16 + jitter * 0.12)),
        stiffness: Math.max(0.20, Math.min(0.94, cluster.stiffness - 0.18 + jitter * 0.16)),
        scatter: cluster.band === "contradiction" ? 2.6 : 2.2
      });

      relations.push({
        from: `cluster-${cluster.id}`,
        to: `${cluster.id}-${index}`,
        type: "belongs_to",
        weight: cluster.band === "contradiction" ? 0.58 : 0.72,
        idealDistance: 0.86 + (index % 4) * 0.04
      });

      if (index > 0) {
        relations.push({
          from: `${cluster.id}-${index - 1}`,
          to: `${cluster.id}-${index}`,
          type: cluster.band === "contradiction" ? "contradicts" : "related",
          weight: cluster.band === "contradiction" ? 0.44 : 0.56,
          idealDistance: cluster.band === "contradiction" ? 1.16 : 0.92
        });
      }
    }
  }

  addImageNode({
    id: "benchmark-figure-flow",
    imageId: "evidence-flow",
    role: "figure",
    band: "figure",
    clusterId: "retrieval",
    confidence: 0.84,
    importance: 0.72,
    stiffness: 0.52,
    figureSide: "right",
    scatter: 1.4
  });

  addImageNode({
    id: "benchmark-figure-uncertainty",
    imageId: "uncertainty-ridge",
    role: "figure",
    band: "figure",
    clusterId: "uncertainty",
    confidence: 0.40,
    importance: 0.60,
    stiffness: 0.28,
    figureSide: "left",
    scatter: 1.8
  });

  relations.push({ from: "benchmark-figure-flow", to: "cluster-retrieval", type: "supports", weight: 0.88, idealDistance: 1.34 });
  relations.push({ from: "benchmark-figure-uncertainty", to: "cluster-uncertainty", type: "supports", weight: 0.76, idealDistance: 1.28 });
  relations.push({ from: "cluster-runtime", to: "cluster-interface", type: "supports", weight: 0.72, idealDistance: 1.54 });
  relations.push({ from: "cluster-interface", to: "cluster-reasoning", type: "supports", weight: 0.82, idealDistance: 1.42 });
  relations.push({ from: "cluster-uncertainty", to: "cluster-reasoning", type: "contradicts", weight: 0.84, idealDistance: 2.08 });
  relations.push({ from: "cluster-planning", to: "cluster-retrieval", type: "related", weight: 0.70, idealDistance: 1.66 });

  return {
    metadata: {
      demoId: "field",
      title: "Field Benchmark",
      subtitle: "Continuous surface benchmark",
      description: "A denser scene tuned to show non-box flow, confidence gradients, and continuous interaction before explanation.",
      intent: "hero",
      watchFor: [
        "Dense nodes should separate into clusters without a single CSS layout rule.",
        "Cold, high-confidence regions should feel structurally harder than warm, low-confidence regions.",
        "Cursor interaction should pull local neighborhoods without collapsing the whole surface into one blob."
      ],
      guideSteps: [
        {
          id: "retrieval",
          label: "Retrieval cluster",
          nodeId: "cluster-retrieval",
          description: "A denser evidence basin. It should hold together visually while individual nodes still dodge and settle."
        },
        {
          id: "uncertainty",
          label: "Hot uncertainty zone",
          nodeId: "cluster-uncertainty",
          description: "This cluster is intentionally low-confidence. It should feel softer, warmer, and easier to perturb."
        },
        {
          id: "surface",
          label: "Surface adapter seam",
          nodeId: "cluster-interface",
          description: "This area names the runtime concepts directly: surface adapter, view transform, host bridge, field mode."
        },
        {
          id: "runtime",
          label: "Runtime core",
          nodeId: "cluster-runtime",
          description: "The lower band names the non-visual machinery: scaffold, losses, projection, relation map, replay."
        }
      ],
      tasks: [
        {
          id: "stiffness-gradient",
          title: "Compare hard vs soft regions",
          prompt: "Jump between retrieval and uncertainty to compare how confidence changes the surface feel.",
          nodeIds: ["cluster-retrieval", "cluster-uncertainty", "benchmark-figure-uncertainty"]
        },
        {
          id: "runtime-seam",
          title: "See where the runtime shows through",
          prompt: "Inspect the surface and runtime clusters together. This is where the benchmark names the actual machinery, not just the look.",
          nodeIds: ["cluster-interface", "cluster-runtime", "cluster-reasoning"]
        }
      ]
    },
    nodes,
    relations,
    constraints,
    viewport: {
      minX: -9.5,
      maxX: 9.5,
      minY: -5.4,
      maxY: 5.4
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
