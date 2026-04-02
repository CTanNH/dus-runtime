import assert from "node:assert/strict";

import { normalizeSceneContract } from "../src/core/contracts.js";
import { createFixtureScene } from "../src/core/fixtures.js";
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

console.log("Passed 4 core runtime checks.");
