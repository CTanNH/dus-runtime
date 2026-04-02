const DEFAULT_CONSTRAINTS = [
  { id: "viewport-hard", type: "viewport", mode: "hard", params: { padding: 0.20 } },
  { id: "non-overlap-hard", type: "non_overlap", mode: "hard", params: { padding: 0.08 } },
  { id: "reading-order-soft", type: "reading_order", mode: "soft", params: { weight: 1.1 } },
  { id: "relation-soft", type: "related", mode: "soft", params: { weight: 0.8 } }
];

const DEFAULT_VIEWPORT = {
  minX: -7.0,
  maxX: 7.0,
  minY: -4.6,
  maxY: 4.6
};

const DEFAULT_INTERACTION_FIELD = {
  cursorX: 0.0,
  cursorY: 0.0,
  cursorVx: 0.0,
  cursorVy: 0.0,
  focusNodeId: null,
  selectedNodeId: null,
  queryPulse: 0.0
};

const TEXT_ROLE_DEFAULTS = {
  lead: { band: "lead", clusterId: "lead", maxWidth: 3.2, lineHeight: 0.38, paddingX: 0.24, paddingY: 0.18, importance: 1.0, stiffness: 0.96 },
  answer: { band: "answer", clusterId: "answer", maxWidth: 4.4, lineHeight: 0.27, paddingX: 0.18, paddingY: 0.15, importance: 0.82, stiffness: 0.82 },
  evidence: { band: "evidence", clusterId: "evidence", maxWidth: 3.5, lineHeight: 0.23, paddingX: 0.16, paddingY: 0.13, importance: 0.74, stiffness: 0.72 },
  contradiction: { band: "contradiction", clusterId: "contradiction", maxWidth: 2.8, lineHeight: 0.22, paddingX: 0.16, paddingY: 0.14, importance: 0.68, stiffness: 0.34 },
  citation: { band: "citation", clusterId: "citation", maxWidth: 2.2, lineHeight: 0.18, paddingX: 0.12, paddingY: 0.10, importance: 0.56, stiffness: 0.64 },
  token: { band: "token", clusterId: "token", maxWidth: 1.24, lineHeight: 0.17, paddingX: 0.12, paddingY: 0.09, importance: 0.54, stiffness: 0.42 }
};

const IMAGE_ROLE_DEFAULTS = {
  figure: { band: "figure", clusterId: "figure", height: 1.06, importance: 0.66, stiffness: 0.46 }
};

function mergedTextDefinition(definition) {
  return {
    ...TEXT_ROLE_DEFAULTS[definition.role] ?? TEXT_ROLE_DEFAULTS.answer,
    ...definition
  };
}

function mergedImageDefinition(definition) {
  return {
    ...IMAGE_ROLE_DEFAULTS[definition.role] ?? IMAGE_ROLE_DEFAULTS.figure,
    ...definition
  };
}

export function buildKnowledgeSceneFromDocument(document, assetProvider) {
  let order = 0;
  const nodes = [];

  const addTextNode = (definition) => {
    const resolved = mergedTextDefinition(definition);
    const run = assetProvider.createTextRun(resolved.id, resolved.text, {
      maxWidth: resolved.maxWidth,
      lineHeight: resolved.lineHeight,
      lineAdvance: resolved.lineAdvance,
      paddingX: resolved.paddingX,
      paddingY: resolved.paddingY
    });

    nodes.push({
      id: resolved.id,
      kind: "text",
      contentRef: run.id,
      intrinsicSize: { width: run.paddedWidth, height: run.paddedHeight },
      targetPose: null,
      confidence: resolved.confidence,
      importance: resolved.importance,
      stiffness: resolved.stiffness,
      clusterId: resolved.clusterId,
      pinned: Boolean(resolved.pinned),
      bridgeRef: resolved.bridgeRef ?? resolved.id,
      rendererPayload: { type: "text", textRunId: run.id },
      metadata: {
        role: resolved.role,
        band: resolved.band,
        orderKey: order,
        queryHint: resolved.queryHint ?? resolved.confidence,
        flowGap: resolved.flowGap,
        figureSide: resolved.figureSide
      }
    });
    order += 1;
  };

  const addImageNode = (definition) => {
    const resolved = mergedImageDefinition(definition);
    const image = assetProvider.getImage(resolved.imageId);
    const baseHeight = resolved.height ?? 1.06;
    const width = baseHeight * (image?.aspect ?? 1.8);

    nodes.push({
      id: resolved.id,
      kind: "image",
      contentRef: resolved.imageId,
      intrinsicSize: { width, height: baseHeight },
      targetPose: null,
      confidence: resolved.confidence,
      importance: resolved.importance,
      stiffness: resolved.stiffness,
      clusterId: resolved.clusterId,
      pinned: Boolean(resolved.pinned),
      bridgeRef: resolved.bridgeRef ?? resolved.id,
      rendererPayload: { type: "image", imageId: resolved.imageId },
      metadata: {
        role: resolved.role,
        band: resolved.band,
        orderKey: order,
        queryHint: resolved.queryHint ?? resolved.confidence,
        figureSide: resolved.figureSide
      }
    });
    order += 1;
  };

  for (const definition of document.text ?? []) addTextNode(definition);
  for (const definition of document.images ?? []) addImageNode(definition);

  return {
    metadata: {
      ...document.metadata,
      demoId: document.metadata?.demoId ?? "knowledge"
    },
    nodes,
    relations: [...(document.relations ?? [])],
    constraints: [...(document.constraints ?? DEFAULT_CONSTRAINTS)],
    viewport: { ...(document.viewport ?? DEFAULT_VIEWPORT) },
    interactionField: { ...(document.interactionField ?? DEFAULT_INTERACTION_FIELD) }
  };
}
