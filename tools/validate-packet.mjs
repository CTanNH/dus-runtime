import fs from "node:fs/promises";
import path from "node:path";

import { getKnowledgePacketFixtureById, listKnowledgePacketFixtures } from "../src/app/knowledgePackets.js";
import { buildKnowledgeSceneFromPacket, createKnowledgePacketValidationAssetProvider } from "../src/core/knowledgeScene.js";

const ROOT = process.cwd();
const DEFAULT_PACKET_PATH = path.join(ROOT, "src", "app", "knowledge-packet.json");

async function main() {
  const assetProvider = createKnowledgePacketValidationAssetProvider();

  async function validatePacket(packet, source) {
    const built = buildKnowledgeSceneFromPacket(packet, assetProvider, { source });
    return {
      ok: built.packetDiagnostics.errors.length === 0 && built.sceneDiagnostics.errors.length === 0,
      input: source.href ?? source.label,
      label: source.label,
      schemaId: built.packet.metadata?.schemaId ?? null,
      schemaVersion: built.packet.metadata?.schemaVersion ?? null,
      textEntries: built.document.text.length,
      imageEntries: built.document.images.length,
      relations: built.document.relations.length,
      sceneNodes: built.scene.nodes.length,
      packetErrors: built.packetDiagnostics.errors,
      packetWarnings: built.packetDiagnostics.warnings,
      errors: built.sceneDiagnostics.errors,
      warnings: built.sceneDiagnostics.warnings
    };
  }

  const input = process.argv[2] ?? "";
  if (input === "--all") {
    const fixtures = listKnowledgePacketFixtures({ includeHidden: true });
    const results = [];
    for (const fixture of fixtures) {
      const raw = await fs.readFile(new URL(fixture.href), "utf8");
      results.push(await validatePacket(JSON.parse(raw), fixture));
    }

    const ok = results.every((result) => result.ok);
    console.log(JSON.stringify({
      ok,
      fixtures: results
    }, null, 2));
    if (!ok) process.exitCode = 1;
    return;
  }

  const fixture = getKnowledgePacketFixtureById(input);
  const source = fixture
    ? fixture
    : {
        id: null,
        label: input ? path.resolve(input) : DEFAULT_PACKET_PATH,
        href: input ? path.resolve(input) : DEFAULT_PACKET_PATH,
        type: "file"
      };
  const raw = await fs.readFile(fixture ? new URL(fixture.href) : source.href, "utf8");
  const result = await validatePacket(JSON.parse(raw), source);

  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({
    ok: true,
    input: result.input,
    label: result.label,
    schemaId: result.schemaId,
    schemaVersion: result.schemaVersion,
    textEntries: result.textEntries,
    imageEntries: result.imageEntries,
    relations: result.relations,
    sceneNodes: result.sceneNodes,
    packetErrors: result.packetErrors,
    packetWarnings: result.packetWarnings,
    warnings: result.warnings
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
