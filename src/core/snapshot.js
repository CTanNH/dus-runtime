import { clamp, cloneScene } from "./utils.js";

const SNAPSHOT_VERSION = 2;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneDiagnostics(diagnostics = {}) {
  return {
    errors: Array.isArray(diagnostics.errors)
      ? diagnostics.errors.map((entry) => ({ ...entry }))
      : [],
    warnings: Array.isArray(diagnostics.warnings)
      ? diagnostics.warnings.map((entry) => ({ ...entry }))
      : [],
    summary: isPlainObject(diagnostics.summary)
      ? { ...diagnostics.summary }
      : { nodes: 0, relations: 0, constraints: 0 }
  };
}

function cloneLosses(losses = {}) {
  return {
    target: Number(losses.target ?? 0.0),
    overlap: Number(losses.overlap ?? 0.0),
    order: Number(losses.order ?? 0.0),
    relation: Number(losses.relation ?? 0.0),
    viewport: Number(losses.viewport ?? 0.0),
    focus: Number(losses.focus ?? 0.0),
    total: Number(losses.total ?? 0.0)
  };
}

function cloneDebugNode(node = {}) {
  return {
    id: typeof node.id === "string" ? node.id : "",
    losses: cloneLosses(node.losses),
    activeConstraints: Array.isArray(node.activeConstraints)
      ? [...new Set(node.activeConstraints.filter((entry) => typeof entry === "string" && entry))]
      : [],
    motion: isPlainObject(node.motion)
      ? {
          x: Number(node.motion.x ?? 0.0),
          y: Number(node.motion.y ?? 0.0)
        }
      : { x: 0.0, y: 0.0 },
    overlapHeat: Number(node.overlapHeat ?? 0.0),
    focusInfluence: Number(node.focusInfluence ?? 0.0)
  };
}

function cloneDebugState(debugState = {}) {
  return {
    totals: cloneLosses(debugState.totals),
    convergenceTrace: Array.isArray(debugState.convergenceTrace)
      ? debugState.convergenceTrace.map((value) => Number(value ?? 0.0))
      : [],
    activeConstraints: Array.isArray(debugState.activeConstraints)
      ? debugState.activeConstraints.map((entry) => ({
          id: typeof entry.id === "string" ? entry.id : "",
          type: typeof entry.type === "string" ? entry.type : "related",
          mode: typeof entry.mode === "string" ? entry.mode : "soft"
        }))
      : [],
    nodes: Array.isArray(debugState.nodes)
      ? debugState.nodes.map(cloneDebugNode)
      : []
  };
}

function cloneInteractionField(interactionField = {}) {
  return {
    cursorX: Number(interactionField.cursorX ?? 0.0),
    cursorY: Number(interactionField.cursorY ?? 0.0),
    cursorVx: Number(interactionField.cursorVx ?? 0.0),
    cursorVy: Number(interactionField.cursorVy ?? 0.0),
    focusNodeId: typeof interactionField.focusNodeId === "string" ? interactionField.focusNodeId : null,
    selectedNodeId: typeof interactionField.selectedNodeId === "string" ? interactionField.selectedNodeId : null,
    queryPulse: clamp(Number(interactionField.queryPulse ?? 0.0), 0.0, 1.0)
  };
}

function serializePoseEntries(map) {
  return [...(map?.entries?.() ?? [])]
    .map(([id, pose]) => ({
      id,
      x: Number(pose?.x ?? 0.0),
      y: Number(pose?.y ?? 0.0),
      width: Number(pose?.width ?? 0.0),
      height: Number(pose?.height ?? 0.0)
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function serializeClusterSeeds(map) {
  return [...(map?.entries?.() ?? [])]
    .map(([id, seed]) => ({
      id,
      x: Number(seed?.x ?? 0.0),
      y: Number(seed?.y ?? 0.0),
      count: Number(seed?.count ?? 0)
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function serializeScaffold(scaffold) {
  if (!scaffold) return null;
  return {
    seed: Number(scaffold.seed ?? 1),
    bounds: scaffold.bounds ? { ...scaffold.bounds } : null,
    bandLayout: scaffold.bandLayout ? { ...scaffold.bandLayout } : {},
    targetPoses: serializePoseEntries(scaffold.targetPoses),
    initialPoses: serializePoseEntries(scaffold.initialPoses),
    readingOrderPairs: Array.isArray(scaffold.readingOrderPairs)
      ? scaffold.readingOrderPairs.map((entry) => ({ ...entry }))
      : [],
    clusterSeeds: serializeClusterSeeds(scaffold.clusterSeeds)
  };
}

function serializeNodeState(node) {
  return {
    id: node.id,
    x: Number(node.x ?? 0.0),
    y: Number(node.y ?? 0.0),
    width: Number(node.width ?? 0.0),
    height: Number(node.height ?? 0.0),
    targetX: Number(node.targetX ?? 0.0),
    targetY: Number(node.targetY ?? 0.0),
    targetWidth: Number(node.targetWidth ?? 0.0),
    targetHeight: Number(node.targetHeight ?? 0.0),
    importance: Number(node.importance ?? 0.0),
    confidence: Number(node.confidence ?? 0.0),
    stiffness: Number(node.stiffness ?? 0.0),
    visible: node.visible !== false,
    overlapHeat: Number(node.overlapHeat ?? 0.0),
    focusInfluence: Number(node.focusInfluence ?? 0.0),
    motionX: Number(node.motionX ?? 0.0),
    motionY: Number(node.motionY ?? 0.0),
    losses: cloneLosses(node.losses),
    activeConstraints: Array.isArray(node.activeConstraints)
      ? [...new Set(node.activeConstraints.filter((entry) => typeof entry === "string" && entry))]
      : []
  };
}

function poseEntriesToMap(entries) {
  if (entries instanceof Map) {
    return new Map(
      [...entries.entries()].map(([id, pose]) => [id, {
        x: Number(pose?.x ?? 0.0),
        y: Number(pose?.y ?? 0.0),
        width: Number(pose?.width ?? 0.0),
        height: Number(pose?.height ?? 0.0)
      }])
    );
  }

  const map = new Map();
  for (const entry of entries ?? []) {
    if (typeof entry?.id !== "string" || !entry.id) continue;
    map.set(entry.id, {
      x: Number(entry.x ?? 0.0),
      y: Number(entry.y ?? 0.0),
      width: Number(entry.width ?? 0.0),
      height: Number(entry.height ?? 0.0)
    });
  }
  return map;
}

function clusterSeedEntriesToMap(entries) {
  if (entries instanceof Map) {
    return new Map(
      [...entries.entries()].map(([id, seed]) => [id, {
        x: Number(seed?.x ?? 0.0),
        y: Number(seed?.y ?? 0.0),
        count: Number(seed?.count ?? 0)
      }])
    );
  }

  const map = new Map();
  for (const entry of entries ?? []) {
    if (typeof entry?.id !== "string" || !entry.id) continue;
    map.set(entry.id, {
      x: Number(entry.x ?? 0.0),
      y: Number(entry.y ?? 0.0),
      count: Number(entry.count ?? 0)
    });
  }
  return map;
}

function normalizeScaffoldSnapshot(scaffold) {
  if (!isPlainObject(scaffold)) return null;
  if (scaffold.targetPoses instanceof Map && scaffold.initialPoses instanceof Map) {
    return {
      seed: Number(scaffold.seed ?? 1),
      bounds: isPlainObject(scaffold.bounds) ? { ...scaffold.bounds } : null,
      bandLayout: isPlainObject(scaffold.bandLayout) ? { ...scaffold.bandLayout } : {},
      targetPoses: new Map(scaffold.targetPoses),
      initialPoses: new Map(scaffold.initialPoses),
      readingOrderPairs: Array.isArray(scaffold.readingOrderPairs)
        ? scaffold.readingOrderPairs.map((entry) => ({ ...entry }))
        : [],
      clusterSeeds: scaffold.clusterSeeds instanceof Map
        ? new Map(scaffold.clusterSeeds)
        : clusterSeedEntriesToMap(scaffold.clusterSeeds)
    };
  }

  return {
    seed: Number(scaffold.seed ?? 1),
    bounds: isPlainObject(scaffold.bounds) ? { ...scaffold.bounds } : null,
    bandLayout: isPlainObject(scaffold.bandLayout) ? { ...scaffold.bandLayout } : {},
    targetPoses: poseEntriesToMap(scaffold.targetPoses),
    initialPoses: poseEntriesToMap(scaffold.initialPoses),
    readingOrderPairs: Array.isArray(scaffold.readingOrderPairs)
      ? scaffold.readingOrderPairs.map((entry) => ({ ...entry }))
      : [],
    clusterSeeds: clusterSeedEntriesToMap(scaffold.clusterSeeds)
  };
}

function createSummary(scene, debugState, sceneDiagnostics) {
  const nodes = scene?.nodes ?? [];
  const debugNodes = debugState?.nodes ?? [];

  return {
    metadata: scene?.metadata ? { ...scene.metadata } : {},
    viewport: scene?.viewport ? { ...scene.viewport } : {},
    nodeCount: nodes.length,
    relationCount: (scene?.relations ?? []).length,
    constraintCount: (scene?.constraints ?? []).length,
    diagnostics: {
      errorCount: sceneDiagnostics?.errors?.length ?? 0,
      warningCount: sceneDiagnostics?.warnings?.length ?? 0
    },
    topLossNodes: debugNodes
      .map((node) => ({
        id: node.id,
        total: Number(node.losses?.total ?? 0.0)
      }))
      .sort((left, right) => right.total - left.total || left.id.localeCompare(right.id))
      .slice(0, 5)
  };
}

export function createRuntimeSnapshot({
  config = {},
  scene,
  sceneDiagnostics,
  scaffold,
  solverState,
  debugState,
  interactionField
}) {
  return {
    version: SNAPSHOT_VERSION,
    runtime: {
      seed: Number(scaffold?.seed ?? config.seed ?? 1),
      iterationsPerFrame: Number(config.iterationsPerFrame ?? 1),
      params: isPlainObject(config.params) ? { ...config.params } : {}
    },
    summary: createSummary(scene, debugState, sceneDiagnostics),
    scene: cloneScene(scene ?? { nodes: [], relations: [], constraints: [] }),
    sceneDiagnostics: cloneDiagnostics(sceneDiagnostics),
    interactionField: cloneInteractionField(interactionField),
    scaffold: serializeScaffold(scaffold),
    solverState: solverState
      ? {
          frameIndex: Number(solverState.frameIndex ?? 0),
          convergenceTrace: Array.isArray(solverState.convergenceTrace)
            ? solverState.convergenceTrace.map((value) => Number(value ?? 0.0))
            : [],
          nodes: Array.isArray(solverState.nodes)
            ? solverState.nodes.map(serializeNodeState)
            : []
        }
      : null,
    debugState: cloneDebugState(debugState ?? solverState?.debugState)
  };
}

export function normalizeRuntimeSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw new Error("DUS snapshot must be an object.");
  }
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(`Unsupported DUS snapshot version "${snapshot.version}".`);
  }
  if (!isPlainObject(snapshot.scene)) {
    throw new Error("DUS snapshot is missing a scene payload.");
  }

  return {
    version: SNAPSHOT_VERSION,
    runtime: {
      seed: Number(snapshot.runtime?.seed ?? 1),
      iterationsPerFrame: Number(snapshot.runtime?.iterationsPerFrame ?? 1),
      params: isPlainObject(snapshot.runtime?.params) ? { ...snapshot.runtime.params } : {}
    },
    summary: isPlainObject(snapshot.summary) ? { ...snapshot.summary } : {},
    scene: cloneScene(snapshot.scene),
    sceneDiagnostics: cloneDiagnostics(snapshot.sceneDiagnostics),
    interactionField: cloneInteractionField(snapshot.interactionField),
    scaffold: normalizeScaffoldSnapshot(snapshot.scaffold),
    solverState: isPlainObject(snapshot.solverState)
      ? {
          frameIndex: Number(snapshot.solverState.frameIndex ?? 0),
          convergenceTrace: Array.isArray(snapshot.solverState.convergenceTrace)
            ? snapshot.solverState.convergenceTrace.map((value) => Number(value ?? 0.0))
            : [],
          nodes: Array.isArray(snapshot.solverState.nodes)
            ? snapshot.solverState.nodes.map((node) => ({
                ...serializeNodeState(node)
              }))
            : []
        }
      : null,
    debugState: cloneDebugState(snapshot.debugState)
  };
}

export function restoreSolverStateFromSnapshot(state, snapshot) {
  if (!state?.nodes || !snapshot?.solverState) return state;

  const snapshotNodes = new Map(snapshot.solverState.nodes.map((node) => [node.id, node]));
  if (snapshotNodes.size !== state.nodes.length) {
    throw new Error("DUS snapshot node count does not match the current scene.");
  }

  for (const node of state.nodes) {
    const saved = snapshotNodes.get(node.id);
    if (!saved) {
      throw new Error(`DUS snapshot is missing solver state for node "${node.id}".`);
    }

    node.x = saved.x;
    node.y = saved.y;
    node.width = saved.width;
    node.height = saved.height;
    node.targetX = saved.targetX;
    node.targetY = saved.targetY;
    node.targetWidth = saved.targetWidth;
    node.targetHeight = saved.targetHeight;
    node.importance = saved.importance;
    node.confidence = saved.confidence;
    node.stiffness = saved.stiffness;
    node.visible = saved.visible !== false;
    node.overlapHeat = saved.overlapHeat;
    node.focusInfluence = saved.focusInfluence;
    node.motionX = saved.motionX;
    node.motionY = saved.motionY;
    node.losses = cloneLosses(saved.losses);
    node.activeConstraints = [...saved.activeConstraints];
  }

  state.nodeById = new Map(state.nodes.map((node) => [node.id, node]));
  state.frameIndex = Number(snapshot.solverState.frameIndex ?? 0);
  state.convergenceTrace = [...(snapshot.solverState.convergenceTrace ?? [])];
  state.debugState = cloneDebugState(snapshot.debugState ?? state.debugState);
  return state;
}

export function restoreScaffoldFromSnapshot(snapshot) {
  return normalizeScaffoldSnapshot(snapshot);
}
