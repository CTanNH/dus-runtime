import { buildKnowledgeSceneFromPacket } from "../core/knowledgeScene.js";
import { listKnowledgePacketSpecs, loadKnowledgePacket } from "./knowledgePackets.js";

export async function buildKnowledgeWorkspaceScene(assetProvider) {
  const { selection, packet } = await loadKnowledgePacket(window.location.search, window.location.href);
  const built = buildKnowledgeSceneFromPacket(packet, assetProvider, { source: selection });
  const packetCatalog = listKnowledgePacketSpecs().map((spec) => ({
    id: spec.id,
    label: spec.label ?? spec.title,
    description: spec.description,
    active: selection.kind === "builtin" && spec.id === selection.id
  }));

  if (selection.kind === "custom") {
    packetCatalog.unshift({
      id: selection.id,
      label: selection.title,
      description: selection.sourceLabel,
      active: true,
      custom: true
    });
  }

  return {
    ...built.scene,
    metadata: {
      ...(built.scene.metadata ?? {}),
      packet: {
        sourceId: selection.id,
        title: selection.title,
        sourceLabel: selection.sourceLabel,
        description: selection.description,
        sourceKind: selection.type,
        builtin: selection.kind === "builtin",
        warningCount: built.packetDiagnostics.warnings.length,
        warnings: built.packetDiagnostics.warnings.slice(0, 4),
        counts: {
          answerBlocks: built.packet.answerBlocks.length,
          evidence: built.packet.evidence.length,
          contradictions: built.packet.contradictions.length,
          figures: built.packet.figures.length,
          citations: built.packet.citations.length,
          tokens: built.packet.tokens.length,
          relations: built.packet.relations.length
        }
      },
      activePacketId: selection.id,
      packetCatalog
    }
  };
}
