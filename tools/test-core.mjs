import assert from "node:assert/strict";

import { normalizeSceneContract } from "../src/core/contracts.js";
import { createBenchmarkHarness } from "../src/core/benchmark.js";
import { createFixtureScene } from "../src/core/fixtures.js";
import { buildKnowledgeSceneFromDocument } from "../src/core/ingest.js";
import { buildKnowledgeDocumentFromPacket } from "../src/core/knowledgePacket.js";
import { buildScaffold } from "../src/core/scaffold.js";
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
  const assetProvider = {
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
});

console.log("Passed 8 core runtime checks.");
