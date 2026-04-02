import { clamp } from "./utils.js";

const NODE_KINDS = new Set(["text", "image", "slot"]);
const RELATION_TYPES = new Set(["supports", "contradicts", "cites", "sequence", "belongs_to", "related"]);
const CONSTRAINT_TYPES = new Set(["bounds", "non_overlap", "reading_order", "anchor", "align", "cluster", "viewport", "related"]);
const CONSTRAINT_MODES = new Set(["hard", "soft"]);

const DEFAULT_VIEWPORT = {
  minX: -6.8,
  maxX: 6.8,
  minY: -4.4,
  maxY: 4.4
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

function pushDiagnostic(store, level, path, message) {
  store[level].push({ path, message });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteOrFallback(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeSize(size, diagnostics, path) {
  const source = isPlainObject(size) ? size : {};
  const width = finiteOrFallback(source.width, 1.0);
  const height = finiteOrFallback(source.height, 0.4);

  if (!Number.isFinite(source.width) || source.width <= 0.0) {
    pushDiagnostic(diagnostics, "warnings", `${path}.width`, "Expected a positive finite width; defaulted to 1.0.");
  }

  if (!Number.isFinite(source.height) || source.height <= 0.0) {
    pushDiagnostic(diagnostics, "warnings", `${path}.height`, "Expected a positive finite height; defaulted to 0.4.");
  }

  return {
    width: Math.max(width, 1.0e-3),
    height: Math.max(height, 1.0e-3)
  };
}

function normalizePose(pose, diagnostics, path, fallbackSize) {
  if (!isPlainObject(pose)) return undefined;

  return {
    x: finiteOrFallback(pose.x, 0.0),
    y: finiteOrFallback(pose.y, 0.0),
    width: Math.max(finiteOrFallback(pose.width, fallbackSize.width), 1.0e-3),
    height: Math.max(finiteOrFallback(pose.height, fallbackSize.height), 1.0e-3)
  };
}

function normalizeMetadata(metadata) {
  return isPlainObject(metadata) ? { ...metadata } : undefined;
}

function normalizeRendererPayload(payload) {
  return isPlainObject(payload) ? { ...payload } : undefined;
}

function normalizeNode(node, index, knownIds, diagnostics) {
  if (!isPlainObject(node)) {
    pushDiagnostic(diagnostics, "errors", `nodes[${index}]`, "Node must be an object.");
    return null;
  }

  const id = typeof node.id === "string" ? node.id.trim() : "";
  if (!id) {
    pushDiagnostic(diagnostics, "errors", `nodes[${index}].id`, "Node id must be a non-empty string.");
    return null;
  }

  if (knownIds.has(id)) {
    pushDiagnostic(diagnostics, "errors", `nodes[${index}].id`, `Duplicate node id "${id}".`);
    return null;
  }
  knownIds.add(id);

  let kind = typeof node.kind === "string" ? node.kind : "text";
  if (!NODE_KINDS.has(kind)) {
    pushDiagnostic(diagnostics, "warnings", `nodes[${index}].kind`, `Unknown node kind "${kind}", defaulted to "text".`);
    kind = "text";
  }

  const intrinsicSize = normalizeSize(node.intrinsicSize, diagnostics, `nodes[${index}].intrinsicSize`);

  return {
    id,
    kind,
    contentRef: node.contentRef ?? null,
    intrinsicSize,
    targetPose: normalizePose(node.targetPose, diagnostics, `nodes[${index}].targetPose`, intrinsicSize),
    confidence: clamp(finiteOrFallback(node.confidence, 0.6), 0.0, 1.0),
    importance: clamp(finiteOrFallback(node.importance, 0.5), 0.0, 1.0),
    stiffness: clamp(finiteOrFallback(node.stiffness, 0.6), 0.0, 1.0),
    clusterId: typeof node.clusterId === "string" ? node.clusterId : undefined,
    pinned: Boolean(node.pinned),
    bridgeRef: typeof node.bridgeRef === "string" ? node.bridgeRef : node.bridgeRef ?? null,
    rendererPayload: normalizeRendererPayload(node.rendererPayload),
    metadata: normalizeMetadata(node.metadata)
  };
}

function normalizeRelation(relation, index, nodeIds, diagnostics) {
  if (!isPlainObject(relation)) {
    pushDiagnostic(diagnostics, "warnings", `relations[${index}]`, "Relation must be an object and was dropped.");
    return null;
  }

  const from = typeof relation.from === "string" ? relation.from.trim() : "";
  const to = typeof relation.to === "string" ? relation.to.trim() : "";
  if (!from || !to) {
    pushDiagnostic(diagnostics, "warnings", `relations[${index}]`, "Relation endpoints must be non-empty strings; relation was dropped.");
    return null;
  }

  if (!nodeIds.has(from) || !nodeIds.has(to)) {
    pushDiagnostic(diagnostics, "warnings", `relations[${index}]`, `Relation "${from}" -> "${to}" references unknown node ids and was dropped.`);
    return null;
  }

  let type = typeof relation.type === "string" ? relation.type : "related";
  if (!RELATION_TYPES.has(type)) {
    pushDiagnostic(diagnostics, "warnings", `relations[${index}].type`, `Unknown relation type "${type}", defaulted to "related".`);
    type = "related";
  }

  return {
    from,
    to,
    type,
    weight: clamp(finiteOrFallback(relation.weight, 0.5), 0.0, 2.0),
    idealDistance: Number.isFinite(relation.idealDistance) ? relation.idealDistance : undefined
  };
}

function normalizeConstraint(constraint, index, diagnostics) {
  if (!isPlainObject(constraint)) {
    pushDiagnostic(diagnostics, "warnings", `constraints[${index}]`, "Constraint must be an object and was dropped.");
    return null;
  }

  let type = typeof constraint.type === "string" ? constraint.type : "related";
  if (!CONSTRAINT_TYPES.has(type)) {
    pushDiagnostic(diagnostics, "warnings", `constraints[${index}].type`, `Unknown constraint type "${type}", defaulted to "related".`);
    type = "related";
  }

  let mode = typeof constraint.mode === "string" ? constraint.mode : "soft";
  if (!CONSTRAINT_MODES.has(mode)) {
    pushDiagnostic(diagnostics, "warnings", `constraints[${index}].mode`, `Unknown constraint mode "${mode}", defaulted to "soft".`);
    mode = "soft";
  }

  return {
    id: typeof constraint.id === "string" && constraint.id.trim() ? constraint.id.trim() : `constraint-${index}`,
    type,
    mode,
    params: isPlainObject(constraint.params) ? { ...constraint.params } : {}
  };
}

function normalizeViewport(viewport, diagnostics) {
  if (!isPlainObject(viewport)) {
    pushDiagnostic(diagnostics, "warnings", "viewport", "Viewport was missing or invalid; defaulted to the runtime viewport.");
    return { ...DEFAULT_VIEWPORT };
  }

  const minX = finiteOrFallback(viewport.minX, DEFAULT_VIEWPORT.minX);
  const maxX = finiteOrFallback(viewport.maxX, DEFAULT_VIEWPORT.maxX);
  const minY = finiteOrFallback(viewport.minY, DEFAULT_VIEWPORT.minY);
  const maxY = finiteOrFallback(viewport.maxY, DEFAULT_VIEWPORT.maxY);

  if (minX >= maxX || minY >= maxY) {
    pushDiagnostic(diagnostics, "warnings", "viewport", "Viewport bounds were invalid; defaulted to the runtime viewport.");
    return { ...DEFAULT_VIEWPORT };
  }

  return { minX, maxX, minY, maxY };
}

function normalizeInteractionField(field) {
  const source = isPlainObject(field) ? field : {};
  return {
    cursorX: finiteOrFallback(source.cursorX, DEFAULT_INTERACTION_FIELD.cursorX),
    cursorY: finiteOrFallback(source.cursorY, DEFAULT_INTERACTION_FIELD.cursorY),
    cursorVx: finiteOrFallback(source.cursorVx, DEFAULT_INTERACTION_FIELD.cursorVx),
    cursorVy: finiteOrFallback(source.cursorVy, DEFAULT_INTERACTION_FIELD.cursorVy),
    focusNodeId: typeof source.focusNodeId === "string" ? source.focusNodeId : null,
    selectedNodeId: typeof source.selectedNodeId === "string" ? source.selectedNodeId : null,
    queryPulse: clamp(finiteOrFallback(source.queryPulse, DEFAULT_INTERACTION_FIELD.queryPulse), 0.0, 1.0)
  };
}

export function normalizeSceneContract(scene) {
  const diagnostics = {
    errors: [],
    warnings: [],
    summary: {
      nodes: 0,
      relations: 0,
      constraints: 0
    }
  };

  const source = isPlainObject(scene) ? scene : {};
  const knownIds = new Set();
  const nodes = [];
  for (let index = 0; index < (source.nodes ?? []).length; index += 1) {
    const normalized = normalizeNode(source.nodes[index], index, knownIds, diagnostics);
    if (normalized) nodes.push(normalized);
  }

  const relations = [];
  for (let index = 0; index < (source.relations ?? []).length; index += 1) {
    const normalized = normalizeRelation(source.relations[index], index, knownIds, diagnostics);
    if (normalized) relations.push(normalized);
  }

  const constraints = [];
  for (let index = 0; index < (source.constraints ?? []).length; index += 1) {
    const normalized = normalizeConstraint(source.constraints[index], index, diagnostics);
    if (normalized) constraints.push(normalized);
  }

  diagnostics.summary.nodes = nodes.length;
  diagnostics.summary.relations = relations.length;
  diagnostics.summary.constraints = constraints.length;

  return {
    scene: {
      metadata: normalizeMetadata(source.metadata),
      nodes,
      relations,
      constraints,
      viewport: normalizeViewport(source.viewport, diagnostics),
      interactionField: normalizeInteractionField(source.interactionField)
    },
    diagnostics
  };
}

export function formatSceneDiagnostics(diagnostics) {
  const parts = [];

  if (diagnostics.errors.length > 0) {
    parts.push(`errors: ${diagnostics.errors.map((entry) => `${entry.path} ${entry.message}`).join(" | ")}`);
  }

  if (diagnostics.warnings.length > 0) {
    parts.push(`warnings: ${diagnostics.warnings.map((entry) => `${entry.path} ${entry.message}`).join(" | ")}`);
  }

  return parts.join(" || ");
}
