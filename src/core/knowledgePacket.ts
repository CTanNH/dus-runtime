function pushUniqueRelation(relations, relation) {
  const key = `${relation.from}:${relation.to}:${relation.type}:${relation.idealDistance ?? ""}`;
  if (!relations.some((entry) => `${entry.from}:${entry.to}:${entry.type}:${entry.idealDistance ?? ""}` === key)) {
    relations.push(relation);
  }
}

function createPacketDiagnostics() {
  return { errors: [], warnings: [] };
}

function warnPacket(diagnostics, path, message) {
  diagnostics.warnings.push({ path, message });
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEntry(listName, item, index, options, diagnostics) {
  const id = trimString(item?.id);
  if (!id) {
    warnPacket(diagnostics, `${listName}[${index}].id`, `Dropped ${listName} entry without a stable id.`);
    return null;
  }

  const payloadKey = options.payloadKey;
  const payload = trimString(item?.[payloadKey]);
  if (options.requirePayload && !payload) {
    warnPacket(diagnostics, `${listName}[${index}].${payloadKey}`, `Dropped ${id} because ${payloadKey} was empty.`);
    return null;
  }

  return {
    ...item,
    id,
    [payloadKey]: payload || item?.[payloadKey]
  };
}

function filterTargetIds(ids, knownIds, diagnostics, path) {
  const next = [];
  for (const rawId of ids ?? []) {
    const id = trimString(rawId);
    if (!id) continue;
    if (!knownIds.has(id)) {
      warnPacket(diagnostics, path, `Dropped unknown target "${id}".`);
      continue;
    }
    next.push(id);
  }
  return [...new Set(next)];
}

export function normalizeKnowledgePacket(packet) {
  const diagnostics = createPacketDiagnostics();
  const normalized = {
    metadata: { ...(packet?.metadata ?? {}) },
    claim: packet?.claim ? { ...packet.claim } : null,
    answerBlocks: [],
    evidence: [],
    contradictions: [],
    figures: [],
    citations: [],
    tokens: [],
    relations: [...(packet?.relations ?? [])],
    constraints: [...(packet?.constraints ?? [])],
    viewport: packet?.viewport ? { ...packet.viewport } : undefined,
    interactionField: packet?.interactionField ? { ...packet.interactionField } : undefined
  };

  if (normalized.claim) {
    normalized.claim.id = trimString(normalized.claim.id) || "answer-hypothesis";
    normalized.claim.statement = trimString(normalized.claim.statement);
    normalized.claim.title = trimString(normalized.claim.title);
    if (!normalized.claim.statement) {
      warnPacket(diagnostics, "claim.statement", "Claim statement was empty and was dropped.");
      normalized.claim = null;
    }
  }

  normalized.answerBlocks = (packet?.answerBlocks ?? [])
    .map((item, index) => normalizeEntry("answerBlocks", item, index, { payloadKey: "text", requirePayload: true }, diagnostics))
    .filter(Boolean);
  normalized.evidence = (packet?.evidence ?? [])
    .map((item, index) => normalizeEntry("evidence", item, index, { payloadKey: "text", requirePayload: true }, diagnostics))
    .filter(Boolean);
  normalized.contradictions = (packet?.contradictions ?? [])
    .map((item, index) => normalizeEntry("contradictions", item, index, { payloadKey: "text", requirePayload: true }, diagnostics))
    .filter(Boolean);
  normalized.figures = (packet?.figures ?? [])
    .map((item, index) => {
      const next = normalizeEntry("figures", item, index, { payloadKey: "imageId", requirePayload: true }, diagnostics);
      if (!next) return null;
      next.imageId = trimString(next.imageId);
      return next.imageId ? next : null;
    })
    .filter(Boolean);
  normalized.citations = (packet?.citations ?? [])
    .map((item, index) => normalizeEntry("citations", item, index, { payloadKey: "label", requirePayload: true }, diagnostics))
    .filter(Boolean);
  normalized.tokens = (packet?.tokens ?? [])
    .map((item, index) => normalizeEntry("tokens", item, index, { payloadKey: "text", requirePayload: true }, diagnostics))
    .filter(Boolean);

  const knownIds = new Set();
  if (normalized.claim) {
    knownIds.add(normalized.claim.id);
    if (normalized.claim.title) {
      knownIds.add(trimString(normalized.claim.titleId) || "lead-title");
    }
  }
  for (const collection of [normalized.answerBlocks, normalized.evidence, normalized.contradictions, normalized.figures, normalized.citations, normalized.tokens]) {
    for (const item of collection) knownIds.add(item.id);
  }

  for (let index = 0; index < normalized.evidence.length; index += 1) {
    const item = normalized.evidence[index];
    item.supports = filterTargetIds(item.supports, knownIds, diagnostics, `evidence[${index}].supports`);
    item.figures = filterTargetIds(item.figures, knownIds, diagnostics, `evidence[${index}].figures`);
  }
  for (let index = 0; index < normalized.contradictions.length; index += 1) {
    normalized.contradictions[index].targets = filterTargetIds(normalized.contradictions[index].targets, knownIds, diagnostics, `contradictions[${index}].targets`);
  }
  for (let index = 0; index < normalized.figures.length; index += 1) {
    normalized.figures[index].targets = filterTargetIds(normalized.figures[index].targets, knownIds, diagnostics, `figures[${index}].targets`);
  }
  for (let index = 0; index < normalized.citations.length; index += 1) {
    normalized.citations[index].targets = filterTargetIds(normalized.citations[index].targets, knownIds, diagnostics, `citations[${index}].targets`);
  }
  for (let index = 0; index < normalized.tokens.length; index += 1) {
    const targetId = trimString(normalized.tokens[index].targetId);
    if (targetId && !knownIds.has(targetId)) {
      warnPacket(diagnostics, `tokens[${index}].targetId`, `Dropped unknown target "${targetId}".`);
      normalized.tokens[index].targetId = undefined;
    } else {
      normalized.tokens[index].targetId = targetId || undefined;
    }
  }

  normalized.relations = (normalized.relations ?? []).filter((relation, index) => {
    const from = trimString(relation?.from);
    const to = trimString(relation?.to);
    const type = trimString(relation?.type);
    if (!from || !to || !type) {
      warnPacket(diagnostics, `relations[${index}]`, "Dropped relation with missing endpoints or type.");
      return false;
    }
    if (!knownIds.has(from) || !knownIds.has(to)) {
      warnPacket(diagnostics, `relations[${index}]`, `Dropped relation "${from}" -> "${to}" because at least one endpoint was unknown.`);
      return false;
    }
    relation.from = from;
    relation.to = to;
    relation.type = type;
    return true;
  });

  return { packet: normalized, diagnostics };
}

function createPacketSummary(packet, diagnostics, source) {
  return {
    sourceId: source?.id ?? null,
    sourceLabel: source?.label ?? null,
    sourceKind: source?.type ?? "packet",
    sourceHref: source?.href ?? null,
    warningCount: diagnostics.warnings.length,
    warnings: diagnostics.warnings.slice(0, 6).map((entry) => ({ ...entry })),
    counts: {
      answerBlocks: packet.answerBlocks.length,
      evidence: packet.evidence.length,
      contradictions: packet.contradictions.length,
      figures: packet.figures.length,
      citations: packet.citations.length,
      tokens: packet.tokens.length,
      relations: packet.relations.length
    }
  };
}

function createMetadata(packet, diagnostics, source) {
  return {
    demoId: packet.metadata?.demoId ?? "knowledge",
    title: packet.metadata?.title ?? "Knowledge Workspace",
    subtitle: packet.metadata?.subtitle ?? "Task demo for AI-native interfaces",
    description: packet.metadata?.description
      ?? "A knowledge surface generated from a semantic packet instead of a hand-placed UI tree.",
    intent: packet.metadata?.intent ?? "task",
    watchFor: [...(packet.metadata?.watchFor ?? [])],
    guideSteps: [...(packet.metadata?.guideSteps ?? [])],
    tasks: [...(packet.metadata?.tasks ?? [])],
    packet: createPacketSummary(packet, diagnostics, source)
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

export function buildKnowledgeDocumentFromPacket(packet, options = {}) {
  const normalized = normalizeKnowledgePacket(packet);
  packet = normalized.packet;
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
    metadata: createMetadata(packet, normalized.diagnostics, options.source),
    text,
    images,
    relations,
    constraints: [...(packet.constraints ?? [])],
    viewport: packet.viewport ? { ...packet.viewport } : undefined,
    interactionField: packet.interactionField ? { ...packet.interactionField } : undefined
  };
}
