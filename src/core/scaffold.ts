import { clamp, hashString, lerp, seededPoint, worldBoundsFromViewport } from "./utils.js";

const BAND_ORDER = ["lead", "answer", "evidence", "contradiction", "figure", "citation", "token", "misc"];

function defaultBandName(node) {
  if (node.metadata?.band) return node.metadata.band;
  if (node.kind === "image") return "figure";
  if (node.kind === "slot") return "misc";
  return "evidence";
}

function sortNodesForBand(a, b) {
  const aOrder = a.metadata?.orderKey ?? 0;
  const bOrder = b.metadata?.orderKey ?? 0;
  if (aOrder !== bOrder) return aOrder - bOrder;
  const aImportance = a.importance ?? 0.5;
  const bImportance = b.importance ?? 0.5;
  if (aImportance !== bImportance) return bImportance - aImportance;
  return a.id.localeCompare(b.id);
}

function buildBandLayout(bounds) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const left = bounds.minX + width * 0.08;
  const right = bounds.minX + width * 0.58;
  const side = bounds.minX + width * 0.68;
  const bottom = bounds.minY + height * 0.10;
  const top = bounds.maxY - height * 0.12;

  return {
    lead: { x: left, y: top, width: width * 0.46, lineGap: 0.18 },
    answer: { x: left, y: top - 1.10, width: width * 0.46, lineGap: 0.14 },
    evidence: { x: left, y: top - 2.45, width: width * 0.44, lineGap: 0.14 },
    contradiction: { x: side, y: top - 1.25, width: width * 0.22, lineGap: 0.16 },
    figure: { x: side, y: top + 0.10, width: width * 0.22, lineGap: 0.24 },
    citation: { x: left, y: bottom + 0.88, width: width * 0.78, lineGap: 0.10 },
    token: { x: left, y: bottom + 0.18, width: width * 0.78, lineGap: 0.08 },
    misc: { x: right, y: bottom + 1.1, width: width * 0.18, lineGap: 0.14 }
  };
}

function flowBand(nodes, band, targetPoses, clusterSeeds) {
  if (!nodes.length) return;

  let penX = band.x;
  let penY = band.y;
  let lineHeight = 0.0;

  for (const node of nodes) {
    const width = node.intrinsicSize.width;
    const height = node.intrinsicSize.height;

    if (penX > band.x && penX + width > band.x + band.width) {
      penX = band.x;
      penY -= lineHeight + band.lineGap;
      lineHeight = 0.0;
    }

    const centerX = penX + width * 0.5;
    const centerY = penY - height * 0.5;
    targetPoses.set(node.id, {
      x: centerX,
      y: centerY,
      width,
      height
    });

    const clusterId = node.clusterId ?? node.metadata?.band ?? "default";
    if (!clusterSeeds.has(clusterId)) {
      clusterSeeds.set(clusterId, { x: centerX, y: centerY, count: 0 });
    }
    const seed = clusterSeeds.get(clusterId);
    seed.x += centerX;
    seed.y += centerY;
    seed.count += 1;

    penX += width + (node.metadata?.flowGap ?? 0.10);
    lineHeight = Math.max(lineHeight, height);
  }
}

function anchorFigures(nodes, scene, targetPoses, bandLayout) {
  const relationMap = new Map();
  for (const relation of scene.relations ?? []) {
    if (!relationMap.has(relation.from)) relationMap.set(relation.from, []);
    if (!relationMap.has(relation.to)) relationMap.set(relation.to, []);
    relationMap.get(relation.from).push(relation);
    relationMap.get(relation.to).push(relation);
  }

  for (const node of nodes) {
    if (node.kind !== "image") continue;
    const pose = targetPoses.get(node.id);
    if (!pose) continue;

    const relations = relationMap.get(node.id) ?? [];
    const anchorRelation = relations.find((relation) => relation.type === "supports" || relation.type === "related" || relation.type === "belongs_to");
    if (!anchorRelation) continue;

    const otherId = anchorRelation.from === node.id ? anchorRelation.to : anchorRelation.from;
    const anchorPose = targetPoses.get(otherId);
    if (!anchorPose) continue;

    const side = node.metadata?.figureSide === "left" ? -1.0 : 1.0;
    pose.x = clamp(anchorPose.x + side * (anchorPose.width * 0.65 + pose.width * 0.55 + 0.22), bandLayout.figure.x, bandLayout.figure.x + bandLayout.figure.width - pose.width * 0.5);
    pose.y = anchorPose.y + lerp(0.12, -0.18, hashString(node.id, 3));
  }
}

function buildReadingOrderPairs(nodes, targetPoses) {
  const orderPairs = [];
  const grouped = new Map();

  for (const node of nodes) {
    const band = defaultBandName(node);
    if (!grouped.has(band)) grouped.set(band, []);
    grouped.get(band).push(node);
  }

  for (const bandName of grouped.keys()) {
    const ordered = grouped.get(bandName).slice().sort((a, b) => {
      const poseA = targetPoses.get(a.id);
      const poseB = targetPoses.get(b.id);
      const lineDelta = (poseB?.y ?? 0.0) - (poseA?.y ?? 0.0);
      if (Math.abs(lineDelta) > 0.22) return lineDelta > 0 ? -1 : 1;
      return (poseA?.x ?? 0.0) - (poseB?.x ?? 0.0);
    });

    for (let index = 0; index < ordered.length - 1; index += 1) {
      const from = ordered[index];
      const to = ordered[index + 1];
      const poseA = targetPoses.get(from.id);
      const poseB = targetPoses.get(to.id);
      const axis = Math.abs((poseB?.x ?? 0.0) - (poseA?.x ?? 0.0)) >= Math.abs((poseB?.y ?? 0.0) - (poseA?.y ?? 0.0)) ? "x" : "y";
      const gap = axis === "x"
        ? Math.max((poseA?.width ?? 0.0) * 0.5 + (poseB?.width ?? 0.0) * 0.5 + 0.06, 0.18)
        : Math.max((poseA?.height ?? 0.0) * 0.5 + (poseB?.height ?? 0.0) * 0.5 + 0.08, 0.22);

      orderPairs.push({
        from: from.id,
        to: to.id,
        axis,
        gap,
        weight: bandName === "citation" || bandName === "token" ? 0.5 : 1.0
      });
    }
  }

  return orderPairs;
}

export function buildScaffold(scene, options = {}) {
  const seed = options.seed ?? 1;
  const bounds = worldBoundsFromViewport(scene.viewport);
  const targetPoses = new Map();
  const initialPoses = new Map();
  const clusterSeeds = new Map();
  const bandLayout = buildBandLayout(bounds);

  const grouped = new Map();
  for (const node of scene.nodes ?? []) {
    const bandName = defaultBandName(node);
    if (!grouped.has(bandName)) grouped.set(bandName, []);
    grouped.get(bandName).push(node);
  }

  for (const bandName of BAND_ORDER) {
    const nodes = (grouped.get(bandName) ?? []).slice().sort(sortNodesForBand);
    flowBand(nodes, bandLayout[bandName] ?? bandLayout.misc, targetPoses, clusterSeeds);
  }

  anchorFigures(scene.nodes ?? [], scene, targetPoses, bandLayout);

  for (const [clusterId, seedPose] of clusterSeeds.entries()) {
    if (seedPose.count > 0) {
      seedPose.x /= seedPose.count;
      seedPose.y /= seedPose.count;
      clusterSeeds.set(clusterId, seedPose);
    }
  }

  for (const node of scene.nodes ?? []) {
    const target = targetPoses.get(node.id);
    if (!target) continue;

    const clusterId = node.clusterId ?? defaultBandName(node);
    const seedPose = clusterSeeds.get(clusterId) ?? { x: target.x, y: target.y };
    const spread = node.metadata?.scatter ?? 1.0;
    const random = seededPoint(node.id, seed, 2.2 * spread, 1.4 * spread);
    const initial = {
      x: clamp(seedPose.x + random.x, bounds.minX + target.width * 0.5, bounds.maxX - target.width * 0.5),
      y: clamp(seedPose.y + random.y, bounds.minY + target.height * 0.5, bounds.maxY - target.height * 0.5),
      width: target.width,
      height: target.height
    };
    if (node.pinned) {
      initial.x = target.x;
      initial.y = target.y;
    }
    initialPoses.set(node.id, initial);
  }

  return {
    seed,
    bounds,
    bandLayout,
    targetPoses,
    initialPoses,
    readingOrderPairs: buildReadingOrderPairs(scene.nodes ?? [], targetPoses),
    clusterSeeds
  };
}
