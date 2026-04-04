import { normalizeSceneContract } from "./contracts.js";
import { buildKnowledgePacketFromBundle } from "./knowledgeBundle.js";
import { buildKnowledgeSceneFromDocument } from "./ingest.js";
import { buildKnowledgeDocumentFromPacket, normalizeKnowledgePacket } from "./knowledgePacket.js";

export function createKnowledgePacketValidationAssetProvider() {
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

export function buildKnowledgeSceneFromPacket(packet, assetProvider, options = {}) {
  const normalizedPacket = normalizeKnowledgePacket(packet);
  const document = buildKnowledgeDocumentFromPacket(normalizedPacket.packet, { source: options.source });
  const scene = buildKnowledgeSceneFromDocument(document, assetProvider);
  const normalizedScene = normalizeSceneContract(scene);

  return {
    packet: normalizedPacket.packet,
    packetDiagnostics: normalizedPacket.diagnostics,
    document,
    scene,
    sceneDiagnostics: normalizedScene.diagnostics
  };
}

export function buildKnowledgeSceneFromBundle(bundle, assetProvider, options = {}) {
  const builtPacket = buildKnowledgePacketFromBundle(bundle, options);
  const builtScene = buildKnowledgeSceneFromPacket(builtPacket.packet, assetProvider, options);

  return {
    bundle: builtPacket.bundle,
    bundleDiagnostics: builtPacket.bundleDiagnostics,
    packet: builtScene.packet,
    packetDiagnostics: builtScene.packetDiagnostics,
    document: builtScene.document,
    scene: builtScene.scene,
    sceneDiagnostics: builtScene.sceneDiagnostics
  };
}
