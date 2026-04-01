import { clamp, length2, normalize2, worldBoundsFromViewport } from "./utils.js";

const DEFAULT_PARAMS = {
  targetWeight: 4.2,
  overlapWeight: 2.6,
  orderWeight: 1.2,
  relationWeight: 1.0,
  viewportWeight: 1.0,
  focusWeight: 0.8,
  learningRate: 0.085,
  maxStep: 0.22,
  minimumReadableWidth: 0.34,
  minimumReadableHeight: 0.18,
  hardPadding: 0.08,
  textImagePadding: 0.14,
  projectionPasses: 2
};

function relationMultiplier(type) {
  switch (type) {
    case "supports": return 0.9;
    case "cites": return 0.72;
    case "belongs_to": return 0.6;
    case "related": return 0.55;
    case "contradicts": return 1.05;
    default: return 0.45;
  }
}

function initializeNode(node, targetPose, initialPose) {
  return {
    id: node.id,
    kind: node.kind,
    clusterId: node.clusterId ?? "default",
    importance: clamp(node.importance ?? 0.5, 0.0, 1.0),
    confidence: clamp(node.confidence ?? 0.6, 0.0, 1.0),
    stiffness: clamp(node.stiffness ?? 0.6, 0.18, 1.0),
    pinned: Boolean(node.pinned),
    bridgeRef: node.bridgeRef ?? null,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    x: initialPose.x,
    y: initialPose.y,
    width: initialPose.width,
    height: initialPose.height,
    targetX: targetPose.x,
    targetY: targetPose.y,
    targetWidth: targetPose.width,
    targetHeight: targetPose.height,
    motionX: 0.0,
    motionY: 0.0,
    visible: true,
    losses: {
      target: 0.0,
      overlap: 0.0,
      order: 0.0,
      relation: 0.0,
      viewport: 0.0,
      focus: 0.0,
      total: 0.0
    },
    activeConstraints: [],
    overlapHeat: 0.0,
    focusInfluence: 0.0
  };
}

function buildRelationLookup(scene) {
  const lookup = new Map();
  for (const relation of scene.relations ?? []) {
    if (!lookup.has(relation.from)) lookup.set(relation.from, []);
    if (!lookup.has(relation.to)) lookup.set(relation.to, []);
    lookup.get(relation.from).push(relation);
    lookup.get(relation.to).push(relation);
  }
  return lookup;
}

function resetNodeDebug(node) {
  node.losses.target = 0.0;
  node.losses.overlap = 0.0;
  node.losses.order = 0.0;
  node.losses.relation = 0.0;
  node.losses.viewport = 0.0;
  node.losses.focus = 0.0;
  node.losses.total = 0.0;
  node.activeConstraints.length = 0;
  node.overlapHeat = 0.0;
  node.focusInfluence = 0.0;
}

function rectOverlap(a, b, padding) {
  const dx = (a.width + b.width) * 0.5 + padding - Math.abs(a.x - b.x);
  const dy = (a.height + b.height) * 0.5 + padding - Math.abs(a.y - b.y);
  return { x: dx, y: dy, active: dx > 0.0 && dy > 0.0 };
}

function applyViewportGradient(node, bounds, weight, grads) {
  const marginX = node.width * 0.5;
  const marginY = node.height * 0.5;
  const left = bounds.minX + marginX;
  const right = bounds.maxX - marginX;
  const bottom = bounds.minY + marginY;
  const top = bounds.maxY - marginY;

  if (node.x < left) {
    const d = left - node.x;
    grads.x -= 2.0 * weight * d;
    node.losses.viewport += weight * d * d;
    node.activeConstraints.push("viewport");
  } else if (node.x > right) {
    const d = node.x - right;
    grads.x -= 2.0 * weight * d;
    node.losses.viewport += weight * d * d;
    node.activeConstraints.push("viewport");
  }

  if (node.y < bottom) {
    const d = bottom - node.y;
    grads.y -= 2.0 * weight * d;
    node.losses.viewport += weight * d * d;
    node.activeConstraints.push("viewport");
  } else if (node.y > top) {
    const d = node.y - top;
    grads.y -= 2.0 * weight * d;
    node.losses.viewport += weight * d * d;
    node.activeConstraints.push("viewport");
  }
}

function applyFocusGradient(node, focusNode, interactionField, weight, grads) {
  if (!focusNode && !interactionField.queryPulse) return;

  let focusScore = 0.0;
  if (focusNode) {
    if (node.id === focusNode.id) {
      focusScore = 1.0;
    } else if (node.clusterId === focusNode.clusterId) {
      focusScore = 0.65;
    } else if (node.metadata?.band === focusNode.metadata?.band) {
      focusScore = 0.28;
    }
  }

  const queryPulse = clamp(interactionField.queryPulse ?? 0.0, 0.0, 1.0);
  if (queryPulse > 0.0 && node.metadata?.queryHint) focusScore = Math.max(focusScore, node.metadata.queryHint * queryPulse);
  if (focusScore <= 0.0) return;

  const anchorX = Number.isFinite(interactionField.cursorX) ? interactionField.cursorX : (focusNode?.targetX ?? node.targetX);
  const anchorY = Number.isFinite(interactionField.cursorY) ? interactionField.cursorY : (focusNode?.targetY ?? node.targetY);
  const dx = node.x - anchorX;
  const dy = node.y - anchorY;
  const localWeight = weight * (0.18 + 0.82 * focusScore) * (0.30 + 0.70 * (1.0 - node.stiffness));

  grads.x += 2.0 * localWeight * dx;
  grads.y += 2.0 * localWeight * dy;
  node.losses.focus += localWeight * (dx * dx + dy * dy) * 0.15;
  node.focusInfluence = focusScore;
  node.activeConstraints.push("focus");
}

function applyOrderLoss(state, orderPairs, params, gradsById) {
  for (const pair of orderPairs) {
    const from = state.nodeById.get(pair.from);
    const to = state.nodeById.get(pair.to);
    if (!from || !to) continue;

    const weight = params.orderWeight * pair.weight;
    if (pair.axis === "x") {
      const delta = to.x - from.x;
      const violation = pair.gap - delta;
      if (violation > 0.0) {
        const impulse = 2.0 * weight * violation;
        gradsById.get(from.id).x += impulse;
        gradsById.get(to.id).x -= impulse;
        from.losses.order += weight * violation * violation * 0.5;
        to.losses.order += weight * violation * violation * 0.5;
        from.activeConstraints.push("reading_order");
        to.activeConstraints.push("reading_order");
      }
    } else {
      const delta = from.y - to.y;
      const violation = pair.gap - delta;
      if (violation > 0.0) {
        const impulse = 2.0 * weight * violation;
        gradsById.get(from.id).y -= impulse;
        gradsById.get(to.id).y += impulse;
        from.losses.order += weight * violation * violation * 0.5;
        to.losses.order += weight * violation * violation * 0.5;
        from.activeConstraints.push("reading_order");
        to.activeConstraints.push("reading_order");
      }
    }
  }
}

function applyRelationLoss(scene, state, params, gradsById) {
  for (const relation of scene.relations ?? []) {
    const from = state.nodeById.get(relation.from);
    const to = state.nodeById.get(relation.to);
    if (!from || !to) continue;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(length2(dx, dy), 1.0e-4);
    const dir = { x: dx / distance, y: dy / distance };
    const ideal = relation.idealDistance ?? (0.42 + (from.width + to.width) * 0.45);
    const weight = params.relationWeight * relationMultiplier(relation.type) * clamp(relation.weight ?? 0.5, 0.0, 2.0);

    if (relation.type === "contradicts") {
      const violation = Math.max(ideal - distance, 0.0);
      if (violation > 0.0) {
        const impulse = 2.0 * weight * violation;
        gradsById.get(from.id).x += dir.x * impulse;
        gradsById.get(from.id).y += dir.y * impulse;
        gradsById.get(to.id).x -= dir.x * impulse;
        gradsById.get(to.id).y -= dir.y * impulse;
        from.losses.relation += weight * violation * violation * 0.5;
        to.losses.relation += weight * violation * violation * 0.5;
      }
      continue;
    }

    const diff = distance - ideal;
    const impulse = 2.0 * weight * diff;
    gradsById.get(from.id).x -= dir.x * impulse;
    gradsById.get(from.id).y -= dir.y * impulse;
    gradsById.get(to.id).x += dir.x * impulse;
    gradsById.get(to.id).y += dir.y * impulse;
    const loss = weight * diff * diff;
    from.losses.relation += loss * 0.5;
    to.losses.relation += loss * 0.5;
    from.activeConstraints.push(relation.type);
    to.activeConstraints.push(relation.type);
  }
}

function applyOverlapLoss(state, params, gradsById) {
  const nodes = state.nodes;

  for (let left = 0; left < nodes.length; left += 1) {
    const a = nodes[left];
    for (let right = left + 1; right < nodes.length; right += 1) {
      const b = nodes[right];
      const padding = (a.kind === "image" || b.kind === "image")
        ? params.textImagePadding
        : params.hardPadding;
      const overlap = rectOverlap(a, b, padding);
      if (!overlap.active) continue;

      const area = overlap.x * overlap.y;
      const weight = params.overlapWeight * (0.55 + 0.45 * Math.max(a.importance, b.importance));
      const axis = overlap.x < overlap.y ? "x" : "y";
      const signX = a.x >= b.x ? 1.0 : -1.0;
      const signY = a.y >= b.y ? 1.0 : -1.0;
      const local = axis === "x"
        ? { x: -signX * overlap.x * weight, y: 0.0 }
        : { x: 0.0, y: -signY * overlap.y * weight };

      gradsById.get(a.id).x += local.x;
      gradsById.get(a.id).y += local.y;
      gradsById.get(b.id).x -= local.x;
      gradsById.get(b.id).y -= local.y;

      a.losses.overlap += area * weight * 0.5;
      b.losses.overlap += area * weight * 0.5;
      a.overlapHeat += area;
      b.overlapHeat += area;
      a.activeConstraints.push("non_overlap");
      b.activeConstraints.push("non_overlap");
    }
  }
}

function projectHardConstraints(state, bounds, params) {
  for (const node of state.nodes) {
    node.width = Math.max(node.width, params.minimumReadableWidth);
    node.height = Math.max(node.height, params.minimumReadableHeight);

    if (node.pinned) {
      node.x = node.targetX;
      node.y = node.targetY;
      continue;
    }

    node.x = clamp(node.x, bounds.minX + node.width * 0.5, bounds.maxX - node.width * 0.5);
    node.y = clamp(node.y, bounds.minY + node.height * 0.5, bounds.maxY - node.height * 0.5);
  }

  for (let pass = 0; pass < params.projectionPasses; pass += 1) {
    for (let left = 0; left < state.nodes.length; left += 1) {
      const a = state.nodes[left];
      for (let right = left + 1; right < state.nodes.length; right += 1) {
        const b = state.nodes[right];
        const padding = (a.kind === "image" || b.kind === "image")
          ? params.textImagePadding
          : params.hardPadding;
        const overlap = rectOverlap(a, b, padding);
        if (!overlap.active) continue;

        const axis = overlap.x < overlap.y ? "x" : "y";
        if (axis === "x") {
          const delta = overlap.x * (a.x >= b.x ? 1.0 : -1.0);
          if (a.pinned && !b.pinned) {
            b.x -= delta;
          } else if (!a.pinned && b.pinned) {
            a.x += delta;
          } else if (!a.pinned && !b.pinned) {
            a.x += delta * 0.5;
            b.x -= delta * 0.5;
          }
        } else {
          const delta = overlap.y * (a.y >= b.y ? 1.0 : -1.0);
          if (a.pinned && !b.pinned) {
            b.y -= delta;
          } else if (!a.pinned && b.pinned) {
            a.y += delta;
          } else if (!a.pinned && !b.pinned) {
            a.y += delta * 0.5;
            b.y -= delta * 0.5;
          }
        }
      }
    }
  }
}

function finalizeDebug(state, convergenceTrace, scene) {
  const totals = {
    target: 0.0,
    overlap: 0.0,
    order: 0.0,
    relation: 0.0,
    viewport: 0.0,
    focus: 0.0,
    total: 0.0
  };

  for (const node of state.nodes) {
    node.overlapHeat = clamp(node.overlapHeat * 0.42, 0.0, 1.0);
    node.losses.total = node.losses.target + node.losses.overlap + node.losses.order + node.losses.relation + node.losses.viewport + node.losses.focus;
    totals.target += node.losses.target;
    totals.overlap += node.losses.overlap;
    totals.order += node.losses.order;
    totals.relation += node.losses.relation;
    totals.viewport += node.losses.viewport;
    totals.focus += node.losses.focus;
    totals.total += node.losses.total;
  }

  convergenceTrace.push(totals.total);
  if (convergenceTrace.length > 96) convergenceTrace.shift();

  return {
    totals,
    convergenceTrace: [...convergenceTrace],
    activeConstraints: (scene.constraints ?? []).map((constraint) => ({
      id: constraint.id,
      type: constraint.type,
      mode: constraint.mode
    })),
    nodes: state.nodes.map((node) => ({
      id: node.id,
      losses: { ...node.losses },
      activeConstraints: [...new Set(node.activeConstraints)],
      motion: { x: node.motionX, y: node.motionY },
      overlapHeat: node.overlapHeat,
      focusInfluence: node.focusInfluence
    }))
  };
}

export function createHybridSolver(config = {}) {
  const params = { ...DEFAULT_PARAMS, ...(config.params ?? {}) };

  return {
    initialize(scene, scaffold) {
      const targetPoses = scaffold.targetPoses;
      const initialPoses = scaffold.initialPoses;
      const nodes = [];

      for (const node of scene.nodes ?? []) {
        const targetPose = targetPoses.get(node.id);
        const initialPose = initialPoses.get(node.id);
        if (!targetPose || !initialPose) continue;
        nodes.push(initializeNode(node, targetPose, initialPose));
      }

      return {
        nodes,
        nodeById: new Map(nodes.map((node) => [node.id, node])),
        convergenceTrace: [],
        relationLookup: buildRelationLookup(scene),
        frameIndex: 0
      };
    },

    step(state, scene, scaffold, interactionField, dt, iterations = 1) {
      const bounds = worldBoundsFromViewport(scene.viewport);
      const focusNode = interactionField.focusNodeId ? state.nodeById.get(interactionField.focusNodeId) : null;

      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const gradsById = new Map();
        for (const node of state.nodes) {
          resetNodeDebug(node);
          gradsById.set(node.id, { x: 0.0, y: 0.0 });

          const targetWeight = params.targetWeight * (0.52 + 0.48 * node.importance) * (0.40 + 0.60 * node.stiffness);
          const dx = node.x - node.targetX;
          const dy = node.y - node.targetY;
          gradsById.get(node.id).x += 2.0 * targetWeight * dx;
          gradsById.get(node.id).y += 2.0 * targetWeight * dy;
          node.losses.target += targetWeight * (dx * dx + dy * dy);
          node.activeConstraints.push(node.pinned ? "anchor" : "target");

          applyViewportGradient(node, bounds, params.viewportWeight, gradsById.get(node.id));
          applyFocusGradient(node, focusNode, interactionField, params.focusWeight, gradsById.get(node.id));
        }

        applyOverlapLoss(state, params, gradsById);
        applyOrderLoss(state, scaffold.readingOrderPairs, params, gradsById);
        applyRelationLoss(scene, state, params, gradsById);

        const scaledLearning = params.learningRate * clamp(dt * 60.0, 0.35, 1.35);
        for (const node of state.nodes) {
          const grad = gradsById.get(node.id);
          const magnitude = length2(grad.x, grad.y);
          const capped = magnitude > params.maxStep / Math.max(scaledLearning, 1.0e-6)
            ? normalize2(grad.x, grad.y)
            : null;
          const stepX = capped ? capped.x * params.maxStep : grad.x * scaledLearning;
          const stepY = capped ? capped.y * params.maxStep : grad.y * scaledLearning;
          const previousX = node.x;
          const previousY = node.y;

          if (!node.pinned) {
            node.x -= stepX;
            node.y -= stepY;
          }

          node.motionX = node.x - previousX;
          node.motionY = node.y - previousY;
        }

        projectHardConstraints(state, bounds, params);
        state.frameIndex += 1;
      }

      state.debugState = finalizeDebug(state, state.convergenceTrace, scene);
      return state.debugState;
    }
  };
}
