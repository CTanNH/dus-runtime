import { buildScaffold } from "./scaffold.js";
import { createHybridSolver } from "./solver.js";
import { cloneScene, poseToRect, rectContainsPoint } from "./utils.js";
import { formatSceneDiagnostics, normalizeSceneContract } from "./contracts.js";
import { createExplainabilityState, explainNodeById } from "./explainability.js";
import { createRuntimeSnapshot, normalizeRuntimeSnapshot, restoreScaffoldFromSnapshot, restoreSolverStateFromSnapshot } from "./snapshot.js";

function normalizeScene(scene) {
  const normalized = normalizeSceneContract(scene);
  return {
    scene: cloneScene(normalized.scene),
    diagnostics: normalized.diagnostics
  };
}

function materializeLayout(scene, solverState) {
  const sceneNodeById = new Map(scene.nodes.map((node) => [node.id, node]));
  const nodePoses = solverState.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    targetX: node.targetX,
    targetY: node.targetY,
    targetWidth: node.targetWidth,
    targetHeight: node.targetHeight,
    confidence: node.confidence,
    importance: node.importance,
    stiffness: node.stiffness,
    clusterId: node.clusterId,
    bridgeRef: node.bridgeRef,
    contentRef: sceneNodeById.get(node.id)?.contentRef ?? null,
    rendererPayload: sceneNodeById.get(node.id)?.rendererPayload ?? null,
    metadata: sceneNodeById.get(node.id)?.metadata ?? null,
    visible: node.visible,
    overlapHeat: node.overlapHeat,
    focusInfluence: node.focusInfluence,
    motionX: node.motionX,
    motionY: node.motionY
  }));

  return {
    nodePoses,
    visibility: new Map(nodePoses.map((pose) => [pose.id, pose.visible])),
    debugLosses: solverState.debugState?.nodes ?? [],
    debugConstraintState: solverState.debugState?.activeConstraints ?? []
  };
}

export function createDusRuntime(config = {}) {
  const solver = config.solver ?? createHybridSolver(config);
  const runtimeConfig = {
    seed: config.seed ?? 1,
    iterationsPerFrame: config.iterationsPerFrame ?? 1,
    params: { ...(config.params ?? {}) }
  };

  const initial = normalizeScene({ nodes: [], relations: [], constraints: [] });
  let scene = initial.scene;
  let sceneDiagnostics = initial.diagnostics;
  let scaffold = null;
  let solverState = null;
  let layout = { nodePoses: [], visibility: new Map(), debugLosses: [], debugConstraintState: [] };
  let debugState = { totals: {}, convergenceTrace: [], nodes: [], activeConstraints: [], sceneDiagnostics };
  let explainability = createExplainabilityState(scene, layout, debugState, sceneDiagnostics, {});
  let interactionField = {
    cursorX: 0.0,
    cursorY: 0.0,
    cursorVx: 0.0,
    cursorVy: 0.0,
    focusNodeId: null,
    selectedNodeId: null,
    queryPulse: 0.0
  };
  let hostBridge = null;

  function refreshExplainability() {
    explainability = createExplainabilityState(scene, layout, debugState, sceneDiagnostics, interactionField);
  }

  function publish() {
    layout = materializeLayout(scene, solverState);
    debugState = {
      ...(solverState.debugState ?? debugState),
      sceneDiagnostics
    };
    refreshExplainability();
    if (hostBridge?.update) {
      hostBridge.update({ scene, layout, debugState, explainability, interactionField });
    } else if (hostBridge?.mount) {
      hostBridge.mount({ scene, layout, debugState, explainability, interactionField });
    }
  }

  return {
    setScene(nextScene) {
      const normalized = normalizeScene(nextScene);
      if (normalized.diagnostics.errors.length > 0) {
        throw new Error(`Invalid DUS scene contract: ${formatSceneDiagnostics(normalized.diagnostics)}`);
      }

      scene = normalized.scene;
      sceneDiagnostics = normalized.diagnostics;
      interactionField = {
        ...interactionField,
        ...(scene.interactionField ?? {})
      };
      scaffold = buildScaffold(scene, { seed: config.seed ?? 1 });
      solverState = solver.initialize(scene, scaffold);
      solverState.debugState = {
        totals: {},
        convergenceTrace: [],
        nodes: [],
        activeConstraints: []
      };
      publish();
    },

    step(dt = 1.0 / 60.0) {
      if (!solverState) return layout;
      solver.step(solverState, scene, scaffold, interactionField, dt, config.iterationsPerFrame ?? 1);
      publish();
      return layout;
    },

    solve(iterations = 1, dt = 1.0 / 60.0) {
      if (!solverState) return layout;
      solver.step(solverState, scene, scaffold, interactionField, dt, iterations);
      publish();
      return layout;
    },

    getLayout() {
      return layout;
    },

    getDebugState() {
      return debugState;
    },

    getSceneDiagnostics() {
      return sceneDiagnostics;
    },

    getScene() {
      return cloneScene(scene);
    },

    getInteractionField() {
      return { ...interactionField };
    },

    getExplainability() {
      return explainability;
    },

    getSnapshot(options = {}) {
      return createRuntimeSnapshot({
        config: runtimeConfig,
        scene,
        sceneDiagnostics,
        scaffold,
        solverState,
        interactionField,
        debugState,
        explainability
      }, options);
    },

    exportSnapshot(options = {}) {
      return this.getSnapshot(options);
    },

    importSnapshot(snapshot) {
      const normalizedSnapshot = normalizeRuntimeSnapshot(snapshot);
      const normalized = normalizeScene(normalizedSnapshot.scene);
      if (normalized.diagnostics.errors.length > 0) {
        throw new Error(`Invalid DUS snapshot scene: ${formatSceneDiagnostics(normalized.diagnostics)}`);
      }

      scene = normalized.scene;
      sceneDiagnostics = normalizedSnapshot.sceneDiagnostics.errors.length > 0 || normalizedSnapshot.sceneDiagnostics.warnings.length > 0
        ? normalizedSnapshot.sceneDiagnostics
        : normalized.diagnostics;
      interactionField = {
        cursorX: 0.0,
        cursorY: 0.0,
        cursorVx: 0.0,
        cursorVy: 0.0,
        focusNodeId: null,
        selectedNodeId: null,
        queryPulse: 0.0,
        ...(scene.interactionField ?? {}),
        ...normalizedSnapshot.interactionField
      };
      scaffold = restoreScaffoldFromSnapshot(normalizedSnapshot.scaffold)
        ?? buildScaffold(scene, { seed: normalizedSnapshot.runtime.seed ?? runtimeConfig.seed });
      solverState = solver.initialize(scene, scaffold);
      restoreSolverStateFromSnapshot(solverState, normalizedSnapshot);
      debugState = normalizedSnapshot.debugState;
      publish();
      return layout;
    },

    explainNode(nodeId) {
      return explainNodeById(explainability, nodeId);
    },

    hitTest(point) {
      const poses = layout.nodePoses.slice().sort((left, right) => {
        const selectedDelta = (right.id === interactionField.selectedNodeId ? 1 : 0) - (left.id === interactionField.selectedNodeId ? 1 : 0);
        if (selectedDelta !== 0) return selectedDelta;
        return right.importance - left.importance;
      });

      for (const pose of poses) {
        const rect = poseToRect(pose);
        if (rectContainsPoint(rect, point.x, point.y)) return pose;
      }
      return null;
    },

    bindHostBridge(bridge) {
      hostBridge = bridge;
      if (hostBridge?.mount) {
        refreshExplainability();
        hostBridge.mount({ scene, layout, debugState, explainability, interactionField });
      }
    },

    setInteractionField(nextField) {
      interactionField = {
        ...interactionField,
        ...nextField
      };
      refreshExplainability();
      if (hostBridge?.update) {
        hostBridge.update({ scene, layout, debugState, explainability, interactionField });
      }
    }
  };
}
