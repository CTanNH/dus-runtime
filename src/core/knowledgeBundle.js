import { KNOWLEDGE_PACKET_SCHEMA_ID, KNOWLEDGE_PACKET_SCHEMA_VERSION, normalizeKnowledgePacket } from "./knowledgePacket.js";

export const KNOWLEDGE_BUNDLE_SCHEMA_ID = "dus-knowledge-bundle";
export const KNOWLEDGE_BUNDLE_SCHEMA_VERSION = 1;

function createBundleDiagnostics() {
  return { errors: [], warnings: [] };
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clamp01(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.0, Math.min(1.0, numeric));
}

function warnBundle(diagnostics, path, message) {
  diagnostics.warnings.push({ path, message });
}

function errorBundle(diagnostics, path, message) {
  diagnostics.errors.push({ path, message });
}

function slugify(value) {
  return trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function makeGeneratedId(prefix, seed, index, usedIds, diagnostics, path) {
  const slug = slugify(seed);
  let candidate = slug ? `${prefix}-${slug}` : `${prefix}-${index + 1}`;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${slug ? `${prefix}-${slug}` : `${prefix}-${index + 1}`}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  warnBundle(diagnostics, path, `Generated stable id "${candidate}" for ${prefix}.`);
  return candidate;
}

function normalizeBundleMetadata(metadata, diagnostics) {
  const next = { ...(metadata ?? {}) };
  const schemaId = trimString(next.schemaId) || KNOWLEDGE_BUNDLE_SCHEMA_ID;
  const rawSchemaVersion = next.schemaVersion ?? KNOWLEDGE_BUNDLE_SCHEMA_VERSION;
  const schemaVersion = Number(rawSchemaVersion);

  if (schemaId !== KNOWLEDGE_BUNDLE_SCHEMA_ID) {
    errorBundle(diagnostics, "metadata.schemaId", `Unsupported bundle schema "${schemaId}". Expected "${KNOWLEDGE_BUNDLE_SCHEMA_ID}".`);
  }

  if (!Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    errorBundle(diagnostics, "metadata.schemaVersion", "Bundle schemaVersion must be a positive integer.");
  } else if (schemaVersion !== KNOWLEDGE_BUNDLE_SCHEMA_VERSION) {
    errorBundle(
      diagnostics,
      "metadata.schemaVersion",
      `Unsupported bundle schemaVersion "${schemaVersion}". Expected "${KNOWLEDGE_BUNDLE_SCHEMA_VERSION}".`
    );
  }

  next.schemaId = schemaId;
  next.schemaVersion = Number.isInteger(schemaVersion) && schemaVersion > 0
    ? schemaVersion
    : KNOWLEDGE_BUNDLE_SCHEMA_VERSION;
  return next;
}

function splitParagraphs(text) {
  return trimString(text)
    .replace(/\r/g, "")
    .split(/\n\s*\n/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function filterKnownIds(ids, knownIds, diagnostics, path) {
  const next = [];
  for (const rawId of ids ?? []) {
    const id = trimString(rawId);
    if (!id) continue;
    if (!knownIds.has(id)) {
      warnBundle(diagnostics, path, `Dropped unknown target "${id}".`);
      continue;
    }
    next.push(id);
  }
  return [...new Set(next)];
}

function normalizeAnswer(answer, diagnostics, usedIds) {
  const next = { ...(answer ?? {}) };
  const bodyParagraphs = splitParagraphs(next.body);
  const statement = trimString(next.statement) || bodyParagraphs[0] || "";
  if (!statement) {
    errorBundle(diagnostics, "answer.statement", "Bundle answer requires a statement or a non-empty body.");
    return null;
  }

  const id = trimString(next.id) || makeGeneratedId("answer", next.title || statement, 0, usedIds, diagnostics, "answer.id");
  const title = trimString(next.title) || "Knowledge synthesis";
  const blocks = [];
  const rawBlocks = Array.isArray(next.blocks) && next.blocks.length > 0
    ? next.blocks
    : bodyParagraphs.slice(statement === bodyParagraphs[0] ? 1 : 0).map((text) => ({ text }));

  for (let index = 0; index < rawBlocks.length; index += 1) {
    const block = rawBlocks[index] ?? {};
    const text = trimString(block.text);
    if (!text) continue;
    const blockId = trimString(block.id) || makeGeneratedId("answer-block", text, index, usedIds, diagnostics, `answer.blocks[${index}].id`);
    blocks.push({
      id: blockId,
      text,
      confidence: clamp01(block.confidence, clamp01(next.confidence, 0.78)),
      importance: clamp01(block.importance, 0.74),
      stiffness: clamp01(block.stiffness, 0.74)
    });
  }

  const lowConfidencePhrases = [];
  for (let index = 0; index < (next.lowConfidencePhrases ?? []).length; index += 1) {
    const phrase = next.lowConfidencePhrases[index] ?? {};
    const text = trimString(phrase.text);
    if (!text) continue;
    const phraseId = trimString(phrase.id) || makeGeneratedId("token", text, index, usedIds, diagnostics, `answer.lowConfidencePhrases[${index}].id`);
    lowConfidencePhrases.push({
      id: phraseId,
      text,
      confidence: clamp01(phrase.confidence, 0.36),
      importance: clamp01(phrase.importance, 0.52),
      stiffness: clamp01(phrase.stiffness, 0.30),
      targetId: trimString(phrase.targetId) || id
    });
  }

  return {
    id,
    title,
    statement,
    confidence: clamp01(next.confidence, 0.84),
    importance: clamp01(next.importance, 0.92),
    stiffness: clamp01(next.stiffness, 0.88),
    blocks,
    lowConfidencePhrases
  };
}

function normalizeEvidence(evidence, diagnostics, usedIds) {
  const next = [];
  for (let index = 0; index < (evidence ?? []).length; index += 1) {
    const item = evidence[index] ?? {};
    const excerpt = trimString(item.excerpt) || trimString(item.text);
    if (!excerpt) {
      warnBundle(diagnostics, `evidence[${index}].excerpt`, "Dropped evidence item without excerpt text.");
      continue;
    }

    const id = trimString(item.id) || makeGeneratedId("evidence", item.title || excerpt, index, usedIds, diagnostics, `evidence[${index}].id`);
    next.push({
      id,
      title: trimString(item.title),
      excerpt,
      confidence: clamp01(item.confidence, 0.82),
      importance: clamp01(item.importance, 0.74),
      stiffness: clamp01(item.stiffness, 0.72),
      supports: [...new Set((item.supports ?? []).map(trimString).filter(Boolean))],
      figureId: trimString(item.figureId),
      source: item.source
        ? {
            label: trimString(item.source.label) || trimString(item.source.title),
            url: trimString(item.source.url)
          }
        : null
    });
  }
  return next;
}

function normalizeIssues(issues, diagnostics, usedIds) {
  const next = [];
  for (let index = 0; index < (issues ?? []).length; index += 1) {
    const item = issues[index] ?? {};
    const text = trimString(item.text);
    if (!text) {
      warnBundle(diagnostics, `issues[${index}].text`, "Dropped issue without text.");
      continue;
    }
    const id = trimString(item.id) || makeGeneratedId("issue", text, index, usedIds, diagnostics, `issues[${index}].id`);
    next.push({
      id,
      text,
      confidence: clamp01(item.confidence, 0.34),
      importance: clamp01(item.importance, 0.72),
      stiffness: clamp01(item.stiffness, 0.26),
      targets: [...new Set((item.targets ?? []).map(trimString).filter(Boolean))]
    });
  }
  return next;
}

function normalizeFigures(figures, diagnostics, usedIds) {
  const next = [];
  for (let index = 0; index < (figures ?? []).length; index += 1) {
    const item = figures[index] ?? {};
    const imageId = trimString(item.imageId);
    if (!imageId) {
      warnBundle(diagnostics, `figures[${index}].imageId`, "Dropped figure without imageId.");
      continue;
    }
    const id = trimString(item.id) || makeGeneratedId("figure", item.caption || imageId, index, usedIds, diagnostics, `figures[${index}].id`);
    next.push({
      id,
      imageId,
      caption: trimString(item.caption),
      confidence: clamp01(item.confidence, 0.70),
      importance: clamp01(item.importance, 0.68),
      stiffness: clamp01(item.stiffness, 0.46),
      targets: [...new Set((item.targets ?? []).map(trimString).filter(Boolean))]
    });
  }
  return next;
}

export function normalizeKnowledgeBundle(bundle) {
  const diagnostics = createBundleDiagnostics();
  const usedIds = new Set();
  const normalized = {
    metadata: normalizeBundleMetadata(bundle?.metadata, diagnostics),
    query: trimString(bundle?.query?.text ?? bundle?.query),
    answer: normalizeAnswer(bundle?.answer, diagnostics, usedIds),
    evidence: [],
    issues: [],
    figures: [],
    relations: [...(bundle?.relations ?? [])],
    viewport: bundle?.viewport ? { ...bundle.viewport } : undefined,
    interactionField: bundle?.interactionField ? { ...bundle.interactionField } : undefined
  };

  if (!normalized.answer) {
    return { bundle: normalized, diagnostics };
  }

  normalized.evidence = normalizeEvidence(bundle?.evidence, diagnostics, usedIds);
  normalized.issues = normalizeIssues(bundle?.issues, diagnostics, usedIds);
  normalized.figures = normalizeFigures(bundle?.figures, diagnostics, usedIds);

  const knownIds = new Set([
    normalized.answer.id,
    ...normalized.answer.blocks.map((entry) => entry.id),
    ...normalized.answer.lowConfidencePhrases.map((entry) => entry.id),
    ...normalized.evidence.map((entry) => entry.id),
    ...normalized.issues.map((entry) => entry.id),
    ...normalized.figures.map((entry) => entry.id)
  ]);

  for (let index = 0; index < normalized.evidence.length; index += 1) {
    const entry = normalized.evidence[index];
    const supports = filterKnownIds(entry.supports, knownIds, diagnostics, `evidence[${index}].supports`);
    entry.supports = supports.length > 0 ? supports : [normalized.answer.id];
    if (entry.figureId && !knownIds.has(entry.figureId)) {
      warnBundle(diagnostics, `evidence[${index}].figureId`, `Dropped unknown figure "${entry.figureId}".`);
      entry.figureId = "";
    }
  }

  for (let index = 0; index < normalized.issues.length; index += 1) {
    const entry = normalized.issues[index];
    const targets = filterKnownIds(entry.targets, knownIds, diagnostics, `issues[${index}].targets`);
    entry.targets = targets.length > 0 ? targets : [normalized.answer.id];
  }

  for (let index = 0; index < normalized.figures.length; index += 1) {
    const entry = normalized.figures[index];
    entry.targets = filterKnownIds(entry.targets, knownIds, diagnostics, `figures[${index}].targets`);
  }

  for (let index = 0; index < normalized.answer.lowConfidencePhrases.length; index += 1) {
    const entry = normalized.answer.lowConfidencePhrases[index];
    if (!knownIds.has(entry.targetId)) {
      warnBundle(diagnostics, `answer.lowConfidencePhrases[${index}].targetId`, `Dropped unknown target "${entry.targetId}".`);
      entry.targetId = normalized.answer.id;
    }
  }

  normalized.relations = (normalized.relations ?? []).filter((relation, index) => {
    const from = trimString(relation?.from);
    const to = trimString(relation?.to);
    const type = trimString(relation?.type);
    if (!from || !to || !type) {
      warnBundle(diagnostics, `relations[${index}]`, "Dropped relation with missing endpoints or type.");
      return false;
    }
    if (!knownIds.has(from) || !knownIds.has(to)) {
      warnBundle(diagnostics, `relations[${index}]`, `Dropped relation "${from}" -> "${to}" because at least one endpoint was unknown.`);
      return false;
    }
    relation.from = from;
    relation.to = to;
    relation.type = type;
    return true;
  });

  return { bundle: normalized, diagnostics };
}

function createAutoCitationId(evidenceId) {
  return `citation-${evidenceId}`;
}

export function buildKnowledgePacketFromBundle(bundle, options = {}) {
  const normalized = normalizeKnowledgeBundle(bundle);
  const input = normalized.bundle;
  if (!input.answer) {
    return {
      bundle: input,
      bundleDiagnostics: normalized.diagnostics,
      packet: normalizeKnowledgePacket({
        metadata: {
          schemaId: KNOWLEDGE_PACKET_SCHEMA_ID,
          schemaVersion: KNOWLEDGE_PACKET_SCHEMA_VERSION,
          title: input.metadata?.title ?? "Knowledge Workspace"
        }
      }).packet,
      packetDiagnostics: normalizeKnowledgePacket({
        metadata: {
          schemaId: KNOWLEDGE_PACKET_SCHEMA_ID,
          schemaVersion: KNOWLEDGE_PACKET_SCHEMA_VERSION,
          title: input.metadata?.title ?? "Knowledge Workspace"
        }
      }).diagnostics
    };
  }

  const packet = {
    metadata: {
      ...input.metadata,
      schemaId: KNOWLEDGE_PACKET_SCHEMA_ID,
      schemaVersion: KNOWLEDGE_PACKET_SCHEMA_VERSION,
      sourceSchemaId: input.metadata.schemaId,
      sourceSchemaVersion: input.metadata.schemaVersion,
      sourceKind: "bundle",
      title: input.metadata.title ?? "Knowledge Workspace",
      subtitle: input.metadata.subtitle ?? "Task demo for AI-native interfaces",
      description: input.metadata.description ?? "A knowledge surface synthesized from an upstream bundle instead of a hand-authored packet."
    },
    claim: {
      id: input.answer.id,
      title: input.answer.title,
      statement: input.answer.statement,
      confidence: input.answer.confidence,
      importance: input.answer.importance,
      stiffness: input.answer.stiffness
    },
    answerBlocks: input.answer.blocks.map((entry) => ({
      id: entry.id,
      text: entry.text,
      confidence: entry.confidence,
      importance: entry.importance,
      stiffness: entry.stiffness
    })),
    evidence: input.evidence.map((entry) => ({
      id: entry.id,
      text: entry.excerpt,
      confidence: entry.confidence,
      importance: entry.importance,
      stiffness: entry.stiffness,
      supports: entry.supports,
      figures: entry.figureId ? [entry.figureId] : []
    })),
    contradictions: input.issues.map((entry) => ({
      id: entry.id,
      text: entry.text,
      confidence: entry.confidence,
      importance: entry.importance,
      stiffness: entry.stiffness,
      targets: entry.targets
    })),
    figures: input.figures.map((entry) => ({
      id: entry.id,
      imageId: entry.imageId,
      confidence: entry.confidence,
      importance: entry.importance,
      stiffness: entry.stiffness,
      targets: entry.targets
    })),
    citations: input.evidence
      .filter((entry) => entry.source?.label || entry.source?.url)
      .map((entry) => ({
        id: createAutoCitationId(entry.id),
        label: entry.source.label || entry.source.url,
        confidence: Math.max(0.6, entry.confidence),
        importance: 0.52,
        stiffness: 0.56,
        targets: [entry.id]
      })),
    tokens: input.answer.lowConfidencePhrases.map((entry) => ({
      id: entry.id,
      text: entry.text,
      confidence: entry.confidence,
      importance: entry.importance,
      stiffness: entry.stiffness,
      targetId: entry.targetId
    })),
    relations: [...input.relations],
    viewport: input.viewport ? { ...input.viewport } : undefined,
    interactionField: input.interactionField ? { ...input.interactionField } : undefined
  };

  const normalizedPacket = normalizeKnowledgePacket(packet);
  return {
    bundle: input,
    bundleDiagnostics: normalized.diagnostics,
    packet: normalizedPacket.packet,
    packetDiagnostics: normalizedPacket.diagnostics
  };
}
