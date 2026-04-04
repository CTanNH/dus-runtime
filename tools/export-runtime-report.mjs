import fs from "node:fs/promises";
import path from "node:path";

import { getKnowledgePacketFixtureById } from "../src/app/knowledgePackets.js";
import { createFixtureScene } from "../src/core/fixtures.js";
import { buildKnowledgeSceneFromPacket, createKnowledgePacketValidationAssetProvider } from "../src/core/knowledgeScene.js";
import { createDusRuntime } from "../src/core/runtime.js";

const ROOT = process.cwd();
const DEFAULT_ITERATIONS = 120;
const DEFAULT_DT = 1.0 / 60.0;

function parseArgs(argv) {
  const args = {
    input: "workspace",
    out: null,
    iterations: DEFAULT_ITERATIONS,
    dt: DEFAULT_DT,
    precision: 6
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--out") {
      args.out = argv[index + 1] ? path.resolve(argv[index + 1]) : null;
      index += 1;
      continue;
    }
    if (value === "--iterations") {
      args.iterations = Number(argv[index + 1] ?? DEFAULT_ITERATIONS);
      index += 1;
      continue;
    }
    if (value === "--dt") {
      args.dt = Number(argv[index + 1] ?? DEFAULT_DT);
      index += 1;
      continue;
    }
    if (value === "--precision") {
      args.precision = Number(argv[index + 1] ?? 6);
      index += 1;
      continue;
    }
    positional.push(value);
  }

  if (positional[0]) {
    args.input = positional[0];
  }
  if (!args.out && positional[1]) {
    args.out = path.resolve(positional[1]);
  }

  return args;
}

function createReportEnvelope(snapshot, source, extra = {}) {
  return {
    reportVersion: 1,
    source,
    snapshot,
    ...extra
  };
}

async function loadPacketInput(input, assetProvider) {
  const fixture = getKnowledgePacketFixtureById(input);
  const source = fixture
    ? {
        kind: "packet-fixture",
        id: fixture.id,
        label: fixture.label,
        href: fixture.href
      }
    : {
        kind: "packet-file",
        id: null,
        label: input === "packet:default" ? "workspace" : path.basename(input),
        href: input === "packet:default" ? path.join(ROOT, "src", "app", "knowledge-packet.json") : path.resolve(input)
      };

  const raw = await fs.readFile(fixture ? new URL(fixture.href) : source.href, "utf8");
  const built = buildKnowledgeSceneFromPacket(JSON.parse(raw), assetProvider, {
    source: {
      id: source.id,
      label: source.label,
      type: source.kind,
      href: fixture ? fixture.href : source.href
    }
  });

  return {
    scene: built.scene,
    reportSource: source,
    extra: {
      document: {
        metadata: built.document.metadata,
        textEntries: built.document.text.length,
        imageEntries: built.document.images.length,
        relationCount: built.document.relations.length
      },
      packetDiagnostics: built.packetDiagnostics,
      sceneDiagnostics: built.sceneDiagnostics
    }
  };
}

async function buildRuntimeReport(input, options) {
  if (input === "fixture:core") {
    const runtime = createDusRuntime({ seed: 17, iterationsPerFrame: 2 });
    runtime.setScene(createFixtureScene());
    runtime.solve(options.iterations, options.dt);
    return createReportEnvelope(
      runtime.getSnapshot({ precision: options.precision }),
      { kind: "fixture", id: "core", label: "Deterministic core fixture" }
    );
  }

  const assetProvider = createKnowledgePacketValidationAssetProvider();
  const loaded = await loadPacketInput(input, assetProvider);
  const runtime = createDusRuntime({ seed: 11, iterationsPerFrame: 2 });
  runtime.setScene(loaded.scene);
  runtime.solve(options.iterations, options.dt);

  return createReportEnvelope(
    runtime.getSnapshot({ precision: options.precision }),
    loaded.reportSource,
    loaded.extra
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildRuntimeReport(options.input, options);
  const json = JSON.stringify(report, null, 2);

  if (options.out) {
    await fs.mkdir(path.dirname(options.out), { recursive: true });
    await fs.writeFile(options.out, json);
    console.log(options.out);
    return;
  }

  console.log(json);
}

await main();
