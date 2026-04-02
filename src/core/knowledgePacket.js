function pushUniqueRelation(relations, relation) {
  const key = `${relation.from}:${relation.to}:${relation.type}:${relation.idealDistance ?? ""}`;
  if (!relations.some((entry) => `${entry.from}:${entry.to}:${entry.type}:${entry.idealDistance ?? ""}` === key)) {
    relations.push(relation);
  }
}

function createMetadata(packet) {
  return {
    demoId: packet.metadata?.demoId ?? "knowledge",
    title: packet.metadata?.title ?? "Knowledge Workspace",
    subtitle: packet.metadata?.subtitle ?? "Task demo for AI-native interfaces",
    description: packet.metadata?.description
      ?? "A knowledge surface generated from a semantic packet instead of a hand-placed UI tree.",
    intent: packet.metadata?.intent ?? "task",
    watchFor: [...(packet.metadata?.watchFor ?? [])],
    guideSteps: [...(packet.metadata?.guideSteps ?? [])],
    tasks: [...(packet.metadata?.tasks ?? [])]
  };
}

function mapClaim(packet, text) {
  if (!packet.claim) return;

  if (packet.claim.title) {
    text.push({
      id: packet.claim.titleId ?? "lead-title",
      text: packet.claim.title,
      role: "lead",
      confidence: packet.claim.titleConfidence ?? 0.98
    });
  }

  text.push({
    id: packet.claim.id ?? "answer-hypothesis",
    text: packet.claim.statement,
    role: "answer",
    confidence: packet.claim.confidence ?? 0.93,
    importance: packet.claim.importance ?? 0.94,
    stiffness: packet.claim.stiffness ?? 0.92,
    maxWidth: packet.claim.maxWidth ?? 4.5,
    lineHeight: packet.claim.lineHeight ?? 0.30,
    paddingX: packet.claim.paddingX ?? 0.20,
    paddingY: packet.claim.paddingY ?? 0.16
  });
}

function mapAnswerBlocks(packet, text) {
  for (const block of packet.answerBlocks ?? []) {
    text.push({
      id: block.id,
      text: block.text,
      role: "answer",
      confidence: block.confidence ?? 0.82,
      importance: block.importance ?? 0.80,
      stiffness: block.stiffness ?? 0.78,
      maxWidth: block.maxWidth ?? 4.2,
      lineHeight: block.lineHeight ?? 0.26
    });
  }
}

function mapEvidence(packet, text, relations) {
  for (const item of packet.evidence ?? []) {
    text.push({
      id: item.id,
      text: item.text,
      role: "evidence",
      confidence: item.confidence ?? 0.82,
      importance: item.importance ?? 0.76,
      stiffness: item.stiffness ?? (0.42 + (item.confidence ?? 0.82) * 0.44)
    });

    for (const targetId of item.supports ?? []) {
      pushUniqueRelation(relations, { from: item.id, to: targetId, type: "supports", weight: item.supportWeight ?? 0.9 });
    }

    for (const figureId of item.figures ?? []) {
      pushUniqueRelation(relations, { from: figureId, to: item.id, type: "supports", weight: 0.9 });
    }
  }
}

function mapContradictions(packet, text, relations) {
  for (const item of packet.contradictions ?? []) {
    text.push({
      id: item.id,
      text: item.text,
      role: "contradiction",
      confidence: item.confidence ?? 0.42,
      importance: item.importance ?? 0.72,
      stiffness: item.stiffness ?? (0.22 + (item.confidence ?? 0.42) * 0.30)
    });

    for (const targetId of item.targets ?? []) {
      pushUniqueRelation(relations, {
        from: item.id,
        to: targetId,
        type: "contradicts",
        weight: item.weight ?? 0.9,
        idealDistance: item.idealDistance ?? 2.3
      });
    }
  }
}

function mapCitations(packet, text, relations) {
  for (const item of packet.citations ?? []) {
    const confidence = item.confidence ?? 0.82;
    text.push({
      id: item.id,
      text: item.label,
      role: "citation",
      confidence,
      importance: item.importance ?? (0.42 + confidence * 0.2),
      stiffness: item.stiffness ?? (0.36 + confidence * 0.28)
    });

    for (const targetId of item.targets ?? []) {
      pushUniqueRelation(relations, {
        from: item.id,
        to: targetId,
        type: "cites",
        weight: item.weight ?? 0.72,
        idealDistance: item.idealDistance ?? 1.2
      });
    }
  }
}

function mapFigures(packet, images, relations) {
  for (const item of packet.figures ?? []) {
    images.push({
      id: item.id,
      imageId: item.imageId,
      role: "figure",
      clusterId: item.clusterId,
      confidence: item.confidence ?? 0.72,
      importance: item.importance ?? 0.66,
      stiffness: item.stiffness ?? 0.46,
      figureSide: item.figureSide ?? "right"
    });

    for (const targetId of item.targets ?? []) {
      pushUniqueRelation(relations, { from: item.id, to: targetId, type: "supports", weight: item.weight ?? 0.9 });
    }
  }
}

function mapTokens(packet, text, relations) {
  for (const item of packet.tokens ?? []) {
    const confidence = item.confidence ?? 0.7;
    text.push({
      id: item.id,
      text: item.text,
      role: "token",
      confidence,
      importance: item.importance ?? (0.40 + confidence * 0.28),
      stiffness: item.stiffness ?? (0.22 + confidence * 0.30),
      flowGap: item.flowGap ?? 0.08
    });

    if (item.targetId) {
      pushUniqueRelation(relations, {
        from: item.id,
        to: item.targetId,
        type: "belongs_to",
        weight: item.weight ?? 0.68,
        idealDistance: item.idealDistance ?? 0.94
      });
    }
  }
}

export function buildKnowledgeDocumentFromPacket(packet) {
  const text = [];
  const images = [];
  const relations = [];

  mapClaim(packet, text);
  mapAnswerBlocks(packet, text);
  mapEvidence(packet, text, relations);
  mapContradictions(packet, text, relations);
  mapFigures(packet, images, relations);
  mapCitations(packet, text, relations);
  mapTokens(packet, text, relations);

  for (const relation of packet.relations ?? []) {
    pushUniqueRelation(relations, { ...relation });
  }

  return {
    metadata: createMetadata(packet),
    text,
    images,
    relations,
    constraints: [...(packet.constraints ?? [])],
    viewport: packet.viewport ? { ...packet.viewport } : undefined,
    interactionField: packet.interactionField ? { ...packet.interactionField } : undefined
  };
}
