import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { getKnowledgeBundleFixtureById, listKnowledgeBundleFixtures } from "../src/app/knowledgeBundles.js";
import { KNOWLEDGE_PACKET_SPECS } from "../src/app/knowledgePackets.js";
import { normalizeSceneContract } from "../src/core/contracts.js";
import { createBenchmarkHarness, createBenchmarkReport } from "../src/core/benchmark.js";
import {
  buildKnowledgePacketFromBundle,
  KNOWLEDGE_BUNDLE_SCHEMA_ID,
  KNOWLEDGE_BUNDLE_SCHEMA_VERSION,
  normalizeKnowledgeBundle
} from "../src/core/knowledgeBundle.js";
import { createFixtureScene } from "../src/core/fixtures.js";
import { buildKnowledgeSceneFromDocument } from "../src/core/ingest.js";
import { buildKnowledgeSceneFromBundle, buildKnowledgeSceneFromPacket } from "../src/core/knowledgeScene.js";
import {
  buildKnowledgeDocumentFromPacket,
  KNOWLEDGE_PACKET_SCHEMA_ID,
  KNOWLEDGE_PACKET_SCHEMA_VERSION,
  normalizeKnowledgePacket
} from "../src/core/knowledgePacket.js";
import { buildScaffold } from "../src/core/scaffold.js";
import { createRuntimeSnapshot, normalizeRuntimeSnapshot } from "../src/core/snapshot.js";
import { createDusRuntime } from "../src/core/runtime.js";

function roundedLayout(layout) {
  return layout.nodePoses
    .map((pose) => ({
      id: pose.id,
      x: Number(pose.x.toFixed(6)),
      y: Number(pose.y.toFixed(6)),
      width: Number(pose.width.toFixed(6)),
      height: Number(pose.height.toFixed(6)),
      targetX: Number(pose.targetX.toFixed(6)),
      targetY: Number(pose.targetY.toFixed(6))
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function roundedPoseMap(map) {
  return [...map.entries()]
    .map(([id, pose]) => ({
      id,
      x: Number(pose.x.toFixed(6)),
      y: Number(pose.y.toFixed(6)),
      width: Number(pose.width.toFixed(6)),
      height: Number(pose.height.toFixed(6))
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function createValidationAssetProvider() {
  return {
    createTextRun(id, text, options = {}) {
      const lineHeight = options.lineHeight ?? 0.24;
      const width = Math.max((options.maxWidth ?? 2.0) * 0.82, text.length * 0.06);
      return {
        id,
        text,
        glyphs: [],
        width,
        height: lineHeight,
        paddedWidth: width + (options.paddingX ?? 0.12) * 2.0,
        paddedHeight: lineHeight + (options.paddingY ?? 0.1) * 2.0,
        distanceRange: 4.0
      };
    },
    getImage(imageId) {
      return {
        id: imageId,
        aspect: 2.0,
        uvRect: { u0: 0.0, v0: 0.0, u1: 1.0, v1: 1.0 }
      };
    }
  };
}

async function run(name, fn) {
  await fn();
  console.log(`ok - ${name}`);
}

await run("scene contract rejects duplicate node ids", async () => {
  const result = normalizeSceneContract({
    nodes: [
      { id: "dup", kind: "text", intrinsicSize: { width: 1, height: 1 } },
      { id: "dup", kind: "text", intrinsicSize: { width: 1, height: 1 } }
    ]
  });

  assert.equal(result.diagnostics.errors.length, 1);
  assert.match(result.diagnostics.errors[0].message, /Duplicate node id/);
});

await run("scene contract drops dangling relations and normalizes viewport", async () => {
  const result = normalizeSceneContract({
    nodes: [
      { id: "claim", kind: "unknown", intrinsicSize: { width: 2, height: 1 } }
    ],
    relations: [
      { from: "claim", to: "missing", type: "supports", weight: 1.0 }
    ],
    viewport: {
      minX: 5,
      maxX: 5,
      minY: 3,
      maxY: -1
    }
  });

  assert.equal(result.scene.nodes.length, 1);
  assert.equal(result.scene.nodes[0].kind, "text");
  assert.equal(result.scene.relations.length, 0);
  assert.ok(result.diagnostics.warnings.length >= 2);
  assert.deepEqual(result.scene.viewport, { minX: -6.8, maxX: 6.8, minY: -4.4, maxY: 4.4 });
});

await run("knowledge ingestion builds a contract-clean scene from semantic document input", async () => {
  const assetProvider = createValidationAssetProvider();

  const scene = buildKnowledgeSceneFromDocument({
    metadata: { title: "Ingested Scene" },
    text: [
      { id: "claim", text: "Claim", role: "answer", confidence: 0.92 },
      { id: "evidence", text: "Evidence", role: "evidence", confidence: 0.82 }
    ],
    images: [
      { id: "figure", imageId: "retrieval-map", role: "figure", confidence: 0.74 }
    ],
    relations: [
      { from: "evidence", to: "claim", type: "supports", weight: 0.8 },
      { from: "figure", to: "evidence", type: "supports", weight: 0.7 }
    ]
  }, assetProvider);

  const normalized = normalizeSceneContract(scene);
  assert.equal(normalized.diagnostics.errors.length, 0);
  assert.equal(normalized.diagnostics.warnings.length, 0);
  assert.equal(scene.nodes.length, 3);
  assert.equal(scene.nodes[0].rendererPayload.type, "text");
  assert.equal(scene.nodes[2].rendererPayload.type, "image");
  assert.equal(scene.relations.length, 2);
});

await run("knowledge packet fixture catalog validates every bundled packet", async () => {
  const assetProvider = createValidationAssetProvider();
  assert.ok(KNOWLEDGE_PACKET_SPECS.length >= 3);
  assert.equal(new Set(KNOWLEDGE_PACKET_SPECS.map((fixture) => fixture.id)).size, KNOWLEDGE_PACKET_SPECS.length);

  for (const fixture of KNOWLEDGE_PACKET_SPECS) {
    const raw = await fs.readFile(fixture.url, "utf8");
    const built = buildKnowledgeSceneFromPacket(JSON.parse(raw), assetProvider);
    assert.equal(built.sceneDiagnostics.errors.length, 0, fixture.id);
    assert.ok(built.scene.metadata.title, fixture.id);
    assert.equal(built.scene.metadata.demoId, "knowledge", fixture.id);
  }
});

await run("knowledge packet expands into document-level semantic scene input", async () => {
  const document = buildKnowledgeDocumentFromPacket({
    metadata: { title: "Packet Scene" },
    claim: {
      title: "Packet Claim",
      id: "claim",
      statement: "Claim statement",
      confidence: 0.91
    },
    answerBlocks: [
      { id: "answer-detail", text: "Detail block", confidence: 0.82 }
    ],
    evidence: [
      { id: "evidence-a", text: "Evidence A", confidence: 0.84, supports: ["claim"] }
    ],
    contradictions: [
      { id: "risk-a", text: "Risk A", confidence: 0.38, targets: ["claim"] }
    ],
    figures: [
      { id: "figure-a", imageId: "retrieval-map", confidence: 0.7, targets: ["evidence-a"] }
    ],
    citations: [
      { id: "citation-a", label: "[A] Source", confidence: 0.88, targets: ["evidence-a"] }
    ],
    tokens: [
      { id: "token-a", text: "uncertain", confidence: 0.4, targetId: "risk-a" }
    ]
  });

  assert.equal(document.metadata.title, "Packet Scene");
  assert.equal(document.text.length, 7);
  assert.equal(document.images.length, 1);
  assert.ok(document.relations.some((relation) => relation.type === "supports" && relation.from === "evidence-a" && relation.to === "claim"));
  assert.ok(document.relations.some((relation) => relation.type === "contradicts" && relation.from === "risk-a" && relation.to === "claim"));
  assert.ok(document.relations.some((relation) => relation.type === "cites" && relation.from === "citation-a" && relation.to === "evidence-a"));
  assert.ok(document.relations.some((relation) => relation.type === "belongs_to" && relation.from === "token-a" && relation.to === "risk-a"));
});

await run("knowledge packet diagnostics drop malformed items and unknown targets", async () => {
  const normalized = normalizeKnowledgePacket({
    claim: {
      id: "claim",
      statement: "Claim"
    },
    evidence: [
      { id: "ev-1", text: "Good evidence", supports: ["claim", "missing-target"] },
      { id: "", text: "Broken evidence" }
    ],
    figures: [
      { id: "figure-1", imageId: "retrieval-map", targets: ["ev-1", "missing-target"] }
    ],
    citations: [
      { id: "citation-1", label: "[1]", targets: ["ev-1", "missing-target"] }
    ],
    tokens: [
      { id: "token-1", text: "tag", targetId: "missing-target" }
    ],
    relations: [
      { from: "ev-1", to: "claim", type: "supports" },
      { from: "ev-1", to: "missing-target", type: "supports" }
    ]
  });

  assert.ok(normalized.diagnostics.warnings.length >= 4);
  assert.equal(normalized.packet.evidence.length, 1);
  assert.deepEqual(normalized.packet.evidence[0].supports, ["claim"]);
  assert.deepEqual(normalized.packet.figures[0].targets, ["ev-1"]);
  assert.deepEqual(normalized.packet.citations[0].targets, ["ev-1"]);
  assert.equal(normalized.packet.tokens[0].targetId, undefined);
  assert.equal(normalized.packet.relations.length, 1);
});

await run("knowledge packet schema defaults are stable and unsupported versions become errors", async () => {
  const normalizedDefault = normalizeKnowledgePacket({
    claim: { id: "claim", statement: "Claim" }
  });

  assert.equal(normalizedDefault.packet.metadata.schemaId, KNOWLEDGE_PACKET_SCHEMA_ID);
  assert.equal(normalizedDefault.packet.metadata.schemaVersion, KNOWLEDGE_PACKET_SCHEMA_VERSION);
  assert.equal(normalizedDefault.diagnostics.errors.length, 0);

  const normalizedUnsupported = normalizeKnowledgePacket({
    metadata: { schemaId: KNOWLEDGE_PACKET_SCHEMA_ID, schemaVersion: 99 },
    claim: { id: "claim", statement: "Claim" }
  });

  assert.ok(normalizedUnsupported.diagnostics.errors.some((entry) => entry.path === "metadata.schemaVersion"));
});

await run("knowledge bundle normalizes upstream output into a valid packet seam", async () => {
  const normalized = normalizeKnowledgeBundle({
    answer: {
      title: "Bundle answer",
      statement: "A bundle should not need packet-shaped ids.",
      body: "Paragraph one.\n\nParagraph two.",
      lowConfidencePhrases: [{ text: "packet-shaped ids" }]
    },
    evidence: [
      {
        excerpt: "Evidence item.",
        source: { label: "Source A" }
      }
    ],
    issues: [
      {
        text: "Risk item."
      }
    ],
    figures: [
      {
        imageId: "retrieval-map"
      }
    ]
  });

  assert.equal(normalized.bundle.metadata.schemaId, KNOWLEDGE_BUNDLE_SCHEMA_ID);
  assert.equal(normalized.bundle.metadata.schemaVersion, KNOWLEDGE_BUNDLE_SCHEMA_VERSION);
  assert.ok(normalized.bundle.answer.id.startsWith("answer-"));
  assert.equal(normalized.bundle.answer.blocks.length, 2);
  assert.equal(normalized.bundle.answer.lowConfidencePhrases.length, 1);

  const built = buildKnowledgePacketFromBundle(normalized.bundle);
  assert.equal(built.bundleDiagnostics.errors.length, 0);
  assert.equal(built.packetDiagnostics.errors.length, 0);
  assert.equal(built.packet.citations.length, 1);
  assert.equal(built.packet.tokens.length, 1);
  assert.equal(built.packet.evidence[0].supports.length, 1);
});

await run("knowledge bundle fixture catalog validates every bundled bundle", async () => {
  const assetProvider = createValidationAssetProvider();
  const fixtures = listKnowledgeBundleFixtures({ includeHidden: true });
  assert.ok(fixtures.length >= 2);
  assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);
  assert.ok(getKnowledgeBundleFixtureById("runtime-adoption"));

  for (const fixture of fixtures) {
    const raw = await fs.readFile(new URL(fixture.href), "utf8");
    const built = buildKnowledgeSceneFromBundle(JSON.parse(raw), assetProvider, { source: fixture });
    assert.equal(built.bundleDiagnostics.errors.length, 0, fixture.id);
    assert.equal(built.packetDiagnostics.errors.length, 0, fixture.id);
    assert.equal(built.sceneDiagnostics.errors.length, 0, fixture.id);
    assert.ok(built.bundle, fixture.id);
    assert.equal(built.packet.metadata?.sourceKind, "bundle", fixture.id);
  }
});

await run("scaffold output is deterministic for a fixed seed", async () => {
  const scene = createFixtureScene();
  const left = buildScaffold(scene, { seed: 17 });
  const right = buildScaffold(scene, { seed: 17 });

  assert.deepEqual(roundedPoseMap(left.targetPoses), roundedPoseMap(right.targetPoses));
  assert.deepEqual(roundedPoseMap(left.initialPoses), roundedPoseMap(right.initialPoses));
  assert.deepEqual(left.readingOrderPairs, right.readingOrderPairs);
});

await run("runtime solve is deterministic and pinned nodes stay on target", async () => {
  const scene = createFixtureScene();
  const runtimeA = createDusRuntime({ seed: 17, iterationsPerFrame: 2 });
  const runtimeB = createDusRuntime({ seed: 17, iterationsPerFrame: 2 });

  runtimeA.setScene(scene);
  runtimeB.setScene(scene);
  runtimeA.solve(48, 1.0 / 60.0);
  runtimeB.solve(48, 1.0 / 60.0);

  assert.equal(runtimeA.getSceneDiagnostics().errors.length, 0);
  assert.equal(runtimeB.getSceneDiagnostics().errors.length, 0);
  assert.deepEqual(roundedLayout(runtimeA.getLayout()), roundedLayout(runtimeB.getLayout()));

  const citation = runtimeA.getLayout().nodePoses.find((pose) => pose.id === "citation");
  assert.ok(citation);
  assert.equal(Number(citation.x.toFixed(6)), Number(citation.targetX.toFixed(6)));
  assert.equal(Number(citation.y.toFixed(6)), Number(citation.targetY.toFixed(6)));
});

await run("runtime exports explainability state and node narratives", async () => {
  const scene = createFixtureScene();
  const runtime = createDusRuntime({ seed: 17, iterationsPerFrame: 2 });

  runtime.setScene(scene);
  runtime.solve(48, 1.0 / 60.0);
  runtime.setInteractionField({
    focusNodeId: "claim",
    selectedNodeId: "risk",
    queryPulse: 0.8
  });

  const explainability = runtime.getExplainability();
  const explainedRisk = runtime.explainNode("risk");

  assert.ok(explainability);
  assert.equal(explainability.scene.nodeCount, scene.nodes.length);
  assert.equal(explainability.scene.selectedNodeId, "risk");
  assert.equal(explainability.scene.focusedNodeId, "claim");
  assert.ok(Array.isArray(explainability.scene.activeConstraintPressure));
  assert.ok(explainability.scene.topUnstableNodes.length > 0);
  assert.ok(explainedRisk);
  assert.equal(explainedRisk.id, "risk");
  assert.equal(explainedRisk.role, "contradiction");
  assert.equal(explainedRisk.rankedLosses.length, 6);
  assert.ok(explainedRisk.narrative.includes("node"));
});

await run("runtime snapshot is deterministic and restorable", async () => {
  const scene = createFixtureScene();
  const runtimeA = createDusRuntime({ seed: 17, iterationsPerFrame: 2, params: { targetWeight: 3.4 } });
  const runtimeB = createDusRuntime({ seed: 3, iterationsPerFrame: 1, params: { targetWeight: 1.5 } });

  runtimeA.setScene(scene);
  runtimeA.solve(48, 1.0 / 60.0);
  runtimeA.setInteractionField({
    focusNodeId: "claim",
    selectedNodeId: "risk",
    queryPulse: 0.62,
    cursorX: -0.4,
    cursorY: 0.3
  });

  const snapshotA = runtimeA.exportSnapshot();
  const normalized = normalizeRuntimeSnapshot(snapshotA);

  assert.equal(normalized.version, 2);
  assert.equal(normalized.runtime.seed, 17);
  assert.equal(normalized.summary.nodeCount, scene.nodes.length);
  assert.equal(normalized.solverState.nodes.length, scene.nodes.length);
  assert.equal(typeof JSON.stringify(snapshotA), "string");

  runtimeB.importSnapshot(snapshotA);
  assert.deepEqual(roundedLayout(runtimeA.getLayout()), roundedLayout(runtimeB.getLayout()));
  assert.deepEqual(runtimeA.getDebugState().convergenceTrace, runtimeB.getDebugState().convergenceTrace);
  assert.equal(runtimeB.getExplainability().scene.focusedNodeId, "claim");
  assert.equal(runtimeB.getExplainability().scene.selectedNodeId, "risk");
});

await run("runtime snapshot helpers preserve scene summaries and reject mismatches", async () => {
  const scene = createFixtureScene();
  const runtime = createDusRuntime({ seed: 17, iterationsPerFrame: 2 });
  runtime.setScene(scene);
  runtime.solve(24, 1.0 / 60.0);

  const snapshot = createRuntimeSnapshot({
    config: { seed: 17, iterationsPerFrame: 2, params: {} },
    scene: runtime.getScene(),
    sceneDiagnostics: runtime.getSceneDiagnostics(),
    scaffold: buildScaffold(runtime.getScene(), { seed: 17 }),
    solverState: {
      frameIndex: runtime.getDebugState().convergenceTrace.length,
      convergenceTrace: runtime.getDebugState().convergenceTrace,
      nodes: runtime.getLayout().nodePoses.map((pose) => ({
        id: pose.id,
        x: pose.x,
        y: pose.y,
        width: pose.width,
        height: pose.height,
        targetX: pose.targetX,
        targetY: pose.targetY,
        targetWidth: pose.targetWidth,
        targetHeight: pose.targetHeight,
        importance: pose.importance,
        confidence: pose.confidence,
        stiffness: pose.stiffness,
        visible: pose.visible,
        overlapHeat: pose.overlapHeat,
        focusInfluence: pose.focusInfluence,
        motionX: pose.motionX,
        motionY: pose.motionY,
        losses: runtime.getDebugState().nodes.find((entry) => entry.id === pose.id)?.losses ?? {},
        activeConstraints: runtime.getDebugState().nodes.find((entry) => entry.id === pose.id)?.activeConstraints ?? []
      }))
    },
    interactionField: runtime.getInteractionField(),
    debugState: runtime.getDebugState()
  });

  assert.equal(snapshot.summary.nodeCount, scene.nodes.length);
  assert.equal(snapshot.summary.constraintCount, scene.constraints.length);
  assert.ok(snapshot.summary.topLossNodes.length > 0);

  snapshot.solverState.nodes.pop();
  assert.throws(() => runtime.importSnapshot(snapshot), /node count does not match/);
});

await run("benchmark harness records comparable task runs", async () => {
  let now = 0;
  const store = {
    value: "",
    getItem() {
      return this.value || null;
    },
    setItem(_key, value) {
      this.value = value;
    }
  };
  const tasks = [
    {
      id: "claim-support",
      title: "Trace support",
      prompt: "Select the claim, evidence, and citation.",
      nodeIds: ["claim", "support", "citation"],
      successNodeIds: ["claim", "support", "citation"],
      successMode: "all"
    }
  ];

  const knowledgeHarness = createBenchmarkHarness({
    demoId: "knowledge",
    tasks,
    storage: store,
    now: () => now
  });

  knowledgeHarness.startTask("claim-support");
  knowledgeHarness.recordSelection("claim");
  now += 1200;
  knowledgeHarness.recordSelection("support");
  knowledgeHarness.recordAction("pan");
  now += 800;
  knowledgeHarness.recordSelection("citation");

  const knowledgeState = knowledgeHarness.getState();
  assert.equal(knowledgeState.activeRun, null);
  assert.equal(knowledgeState.tasks[0].lastRun.completed, true);
  assert.equal(knowledgeState.tasks[0].lastRun.actionCounts.pan, 1);

  now = 0;
  const baselineHarness = createBenchmarkHarness({
    demoId: "baseline",
    tasks,
    storage: store,
    now: () => now
  });

  baselineHarness.startTask("claim-support");
  baselineHarness.recordSelection("claim");
  now += 1500;
  baselineHarness.recordSelection("support");
  now += 1000;
  baselineHarness.recordSelection("citation");

  const baselineState = baselineHarness.getState();
  assert.ok(baselineState.tasks[0].comparison);
  assert.equal(baselineState.tasks[0].comparison.demoId, "knowledge");
  assert.ok(baselineState.tasks[0].comparison.elapsedMs > 0);

  const report = baselineHarness.exportReport();
  assert.equal(report.schemaId, "dus-benchmark-report");
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.summary.totalRuns, 2);
  assert.equal(report.summary.completedRuns, 2);
  assert.equal(report.summary.comparisons.length, 1);
  assert.equal(report.summary.comparisons[0].demos.length, 2);
  assert.ok(report.summary.comparisons[0].demos.every((entry) => entry.runCount === 1));

  baselineHarness.clearRuns();
  assert.equal(baselineHarness.exportReport().summary.totalRuns, 0);
});

await run("benchmark report factory summarizes cross-demo runs", async () => {
  const report = createBenchmarkReport({
    demoId: "knowledge",
    tasks: [
      {
        id: "trace-support",
        benchmarkId: "trace-support",
        title: "Trace support",
        prompt: "Follow the support chain.",
        nodeIds: ["claim", "support", "citation"],
        successNodeIds: ["claim", "support", "citation"]
      }
    ],
    runs: [
      {
        taskId: "trace-support",
        benchmarkId: "trace-support",
        title: "Trace support",
        prompt: "Follow the support chain.",
        demoId: "knowledge",
        startedAt: 0,
        elapsedMs: 1800,
        completed: true,
        completedNodeIds: ["claim", "support", "citation"],
        successNodeIds: ["claim", "support", "citation"],
        actionCounts: { select: 3, focus: 0, pan: 1, zoom: 0, fit: 0, replay: 0 }
      },
      {
        taskId: "trace-support",
        benchmarkId: "trace-support",
        title: "Trace support",
        prompt: "Follow the support chain.",
        demoId: "baseline",
        startedAt: 0,
        elapsedMs: 2600,
        completed: true,
        completedNodeIds: ["claim", "support", "citation"],
        successNodeIds: ["claim", "support", "citation"],
        actionCounts: { select: 3, focus: 0, pan: 2, zoom: 1, fit: 0, replay: 0 }
      }
    ]
  });

  assert.equal(report.summary.totalRuns, 2);
  assert.equal(report.summary.comparisons.length, 1);
  const comparison = report.summary.comparisons[0];
  assert.equal(comparison.benchmarkId, "trace-support");
  assert.equal(comparison.demos[0].demoId, "baseline");
  assert.equal(comparison.demos[1].demoId, "knowledge");
  assert.equal(comparison.demos[1].bestElapsedMs, 1800);
});

console.log("Passed 16 core runtime checks.");
