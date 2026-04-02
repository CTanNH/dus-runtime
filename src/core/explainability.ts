import { clamp, length2 } from "./utils.js";

const LOSS_KEYS = ["target", "overlap", "order", "relation", "viewport", "focus"];

function rankLosses(losses) {
  return LOSS_KEYS
    .map((key) => ({ key, value: Number(losses?.[key] ?? 0) }))
    .sort((left, right) => right.value - left.value);
}

function relationSummary(pose, relatedPose, relation) {
  const dx = (relatedPose?.x ?? 0) - pose.x;
  const dy = (relatedPose?.y ?? 0) - pose.y;
  const distance = relatedPose ? length2(dx, dy) : null;
  return {
    otherId: relation.from === pose.id ? relation.to : relation.from,
    type: relation.type,
    weight: Number(relation.weight ?? 0),
    idealDistance: Number(relation.idealDistance ?? 0),
    distance: distance === null ? null : Number(distance.toFixed(6))
  };
}

function neighborSummary(pose, other) {
  const dx = other.x - pose.x;
  const dy = other.y - pose.y;
  return {
    id: other.id,
    role: other.metadata?.role ?? other.kind,
    distance: Number(length2(dx, dy).toFixed(6)),
    confidence: Number(other.confidence.toFixed(3)),
    importance: Number(other.importance.toFixed(3))
  };
}

function constraintHistogram(nodes) {
  const counts = new Map();
  for (const node of nodes) {
    for (const constraint of node.activeConstraints ?? []) {
      counts.set(constraint, (counts.get(constraint) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

function classifyStability(node) {
  if (node.confidence >= 0.85 && node.stiffness >= 0.8) return "rigid";
  if (node.confidence <= 0.5 || node.stiffness <= 0.45) return "fluid";
  return "mixed";
}

function buildNarrative({ pose, debugNode, dominantLoss, targetDistance, sceneNode }) {
  const role = sceneNode?.metadata?.role ?? pose.kind;
  const stability = classifyStability(pose);
  const anchorState = pose.id === debugNode?.id && sceneNode?.pinned ? "anchored" : "free";

  if (dominantLoss.value <= 1.0e-6) {
    return `${role} node is ${anchorState} and currently near equilibrium.`;
  }

  if (dominantLoss.key === "target") {
    return `${role} node is ${anchorState} and still paying target loss; it remains ${targetDistance > 0.12 ? "meaningfully displaced" : "slightly displaced"} from its scaffold pose.`;
  }

  if (dominantLoss.key === "overlap") {
    return `${role} node is ${anchorState} and mainly under overlap pressure; the runtime is still negotiating space around it.`;
  }

  if (dominantLoss.key === "relation") {
    return `${role} node is ${anchorState} and mainly driven by semantic relation pressure rather than scaffold position.`;
  }

  if (dominantLoss.key === "order") {
    return `${role} node is ${anchorState} and currently constrained by reading-order preservation.`;
  }

  if (dominantLoss.key === "focus") {
    return `${role} node is ${stability} and currently being pulled by the interaction field.`;
  }

  return `${role} node is ${stability} and currently dominated by ${dominantLoss.key} pressure.`;
}

export function createExplainabilityState(scene, layout, debugState, sceneDiagnostics, interactionField) {
  const poses = layout?.nodePoses ?? [];
  const poseById = new Map(poses.map((pose) => [pose.id, pose]));
  const debugById = new Map((debugState?.nodes ?? []).map((node) => [node.id, node]));
  const sceneNodeById = new Map((scene?.nodes ?? []).map((node) => [node.id, node]));

  const nodes = poses.map((pose) => {
    const debugNode = debugById.get(pose.id) ?? {
      losses: {},
      activeConstraints: [],
      overlapHeat: 0,
      focusInfluence: 0
    };
    const sceneNode = sceneNodeById.get(pose.id);
    const ranked = rankLosses(debugNode.losses);
    const dominantLoss = ranked[0] ?? { key: "none", value: 0 };
    const targetDx = pose.x - pose.targetX;
    const targetDy = pose.y - pose.targetY;
    const targetDistance = length2(targetDx, targetDy);

    const relations = (scene?.relations ?? [])
      .filter((relation) => relation.from === pose.id || relation.to === pose.id)
      .map((relation) => {
        const otherId = relation.from === pose.id ? relation.to : relation.from;
        return relationSummary(pose, poseById.get(otherId), relation);
      })
      .sort((left, right) => (right.weight - left.weight) || left.otherId.localeCompare(right.otherId));

    const nearby = poses
      .filter((other) => other.id !== pose.id)
      .map((other) => neighborSummary(pose, other))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 4);

    return {
      id: pose.id,
      role: sceneNode?.metadata?.role ?? pose.kind,
      kind: pose.kind,
      stability: classifyStability(pose),
      pinned: Boolean(sceneNode?.pinned),
      confidence: Number(pose.confidence.toFixed(3)),
      importance: Number(pose.importance.toFixed(3)),
      stiffness: Number(pose.stiffness.toFixed(3)),
      targetOffset: {
        dx: Number(targetDx.toFixed(6)),
        dy: Number(targetDy.toFixed(6)),
        distance: Number(targetDistance.toFixed(6))
      },
      motion: {
        x: Number((pose.motionX ?? 0).toFixed(6)),
        y: Number((pose.motionY ?? 0).toFixed(6))
      },
      focusInfluence: Number((debugNode.focusInfluence ?? 0).toFixed(6)),
      overlapHeat: Number((debugNode.overlapHeat ?? 0).toFixed(6)),
      dominantLoss: {
        key: dominantLoss.key,
        value: Number(dominantLoss.value.toFixed(6))
      },
      rankedLosses: ranked.map((entry) => ({
        key: entry.key,
        value: Number(entry.value.toFixed(6))
      })),
      activeConstraints: [...new Set(debugNode.activeConstraints ?? [])],
      relations,
      nearby,
      narrative: buildNarrative({ pose, debugNode, dominantLoss, targetDistance, sceneNode })
    };
  });

  const totalLoss = Number((debugState?.totals?.total ?? 0).toFixed(6));
  const topUnstable = [...nodes]
    .sort((left, right) => right.dominantLoss.value - left.dominantLoss.value || right.targetOffset.distance - left.targetOffset.distance)
    .slice(0, 5)
    .map((node) => ({
      id: node.id,
      role: node.role,
      dominantLoss: node.dominantLoss,
      targetOffset: node.targetOffset.distance
    }));

  return {
    scene: {
      nodeCount: poses.length,
      relationCount: (scene?.relations ?? []).length,
      constraintCount: (scene?.constraints ?? []).length,
      totalLoss,
      activeConstraintPressure: constraintHistogram(debugState?.nodes ?? []),
      topUnstableNodes: topUnstable,
      focusedNodeId: interactionField?.focusNodeId ?? null,
      selectedNodeId: interactionField?.selectedNodeId ?? null,
      diagnostics: {
        errors: sceneDiagnostics?.errors ?? [],
        warnings: sceneDiagnostics?.warnings ?? [],
        warningCount: sceneDiagnostics?.warnings?.length ?? 0
      },
      convergenceTail: (debugState?.convergenceTrace ?? []).slice(-12).map((value) => Number(value.toFixed(6)))
    },
    nodes
  };
}

export function explainNodeById(explainability, nodeId) {
  if (!nodeId) return null;
  return explainability?.nodes?.find((node) => node.id === nodeId) ?? null;
}
