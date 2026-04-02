import fs from "node:fs/promises";
import path from "node:path";

import { buildKnowledgeDocumentFromPacket, normalizeKnowledgePacket } from "../src/core/knowledgePacket.js";
import { buildKnowledgeSceneFromDocument } from "../src/core/ingest.js";
import { normalizeSceneContract } from "../src/core/contracts.js";

const ROOT = process.cwd();
const DEFAULT_PACKET_PATH = path.join(ROOT, "src", "app", "knowledge-packet.json");

function createValidationAssetProvider() {
  return {
    createTextRun(id, text, options = {}) {
      const lineHeight = options.lineHeight ?? 0.24;
      const width = Math.max((options.maxWidth ?? 2.0) * 0.82, String(text).length * 0.06);
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

async function main() {
  const input = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PACKET_PATH;
  const raw = await fs.readFile(input, "utf8");
  const packet = JSON.parse(raw);
  const assetProvider = createValidationAssetProvider();
  const normalizedPacket = normalizeKnowledgePacket(packet);
  const document = buildKnowledgeDocumentFromPacket(normalizedPacket.packet);
  const scene = buildKnowledgeSceneFromDocument(document, assetProvider);
  const normalized = normalizeSceneContract(scene);

  if (normalized.diagnostics.errors.length > 0) {
    console.error(JSON.stringify({
      ok: false,
      input,
      packetWarnings: normalizedPacket.diagnostics.warnings,
      errors: normalized.diagnostics.errors,
      warnings: normalized.diagnostics.warnings
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({
    ok: true,
    input,
    textEntries: document.text.length,
    imageEntries: document.images.length,
    relations: document.relations.length,
    sceneNodes: scene.nodes.length,
    packetWarnings: normalizedPacket.diagnostics.warnings,
    warnings: normalized.diagnostics.warnings
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
