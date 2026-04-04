import fs from "node:fs/promises";
import path from "node:path";

import { getKnowledgeBundleFixtureById, listKnowledgeBundleFixtures } from "../src/app/knowledgeBundles.js";
import { buildKnowledgeSceneFromBundle, createKnowledgePacketValidationAssetProvider } from "../src/core/knowledgeScene.js";

const ROOT = process.cwd();
const DEFAULT_BUNDLE_PATH = path.join(ROOT, "src", "app", "bundles", "runtime-adoption.bundle.json");

async function main() {
  const assetProvider = createKnowledgePacketValidationAssetProvider();

  async function validateBundle(bundle, source) {
    const built = buildKnowledgeSceneFromBundle(bundle, assetProvider, { source });
    return {
      ok: built.bundleDiagnostics.errors.length === 0
        && built.packetDiagnostics.errors.length === 0
        && built.sceneDiagnostics.errors.length === 0,
      input: source.href ?? source.label,
      label: source.label,
      bundleSchemaId: built.bundle.metadata?.schemaId ?? null,
      bundleSchemaVersion: built.bundle.metadata?.schemaVersion ?? null,
      packetSchemaId: built.packet.metadata?.schemaId ?? null,
      packetSchemaVersion: built.packet.metadata?.schemaVersion ?? null,
      textEntries: built.document.text.length,
      imageEntries: built.document.images.length,
      relations: built.document.relations.length,
      sceneNodes: built.scene.nodes.length,
      bundleErrors: built.bundleDiagnostics.errors,
      bundleWarnings: built.bundleDiagnostics.warnings,
      packetErrors: built.packetDiagnostics.errors,
      packetWarnings: built.packetDiagnostics.warnings,
      errors: built.sceneDiagnostics.errors,
      warnings: built.sceneDiagnostics.warnings
    };
  }

  const input = process.argv[2] ?? "";
  if (input === "--all") {
    const fixtures = listKnowledgeBundleFixtures({ includeHidden: true });
    const results = [];
    for (const fixture of fixtures) {
      const raw = await fs.readFile(new URL(fixture.href), "utf8");
      results.push(await validateBundle(JSON.parse(raw), fixture));
    }

    const ok = results.every((result) => result.ok);
    console.log(JSON.stringify({ ok, fixtures: results }, null, 2));
    if (!ok) process.exitCode = 1;
    return;
  }

  const fixture = getKnowledgeBundleFixtureById(input);
  const source = fixture
    ? fixture
    : {
        id: null,
        label: input ? path.resolve(input) : DEFAULT_BUNDLE_PATH,
        href: input ? path.resolve(input) : DEFAULT_BUNDLE_PATH,
        type: "file"
      };
  const raw = await fs.readFile(fixture ? new URL(fixture.href) : source.href, "utf8");
  const result = await validateBundle(JSON.parse(raw), source);

  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
