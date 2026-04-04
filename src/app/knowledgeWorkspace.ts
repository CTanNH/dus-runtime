import { buildKnowledgeSceneFromBundle, buildKnowledgeSceneFromPacket } from "../core/knowledgeScene.js";
import { listKnowledgeBundleFixtures, loadKnowledgeBundle } from "./knowledgeBundles.js";
import { listKnowledgePacketSpecs, loadKnowledgePacket } from "./knowledgePackets.js";

export async function buildKnowledgeWorkspaceScene(assetProvider) {
  const params = new URLSearchParams(window.location.search);
  const hasBundleReference = params.has("bundle") || params.has("bundleId");
  const sourceLoad = hasBundleReference
    ? await loadKnowledgeBundle(window.location.search, window.location.href)
    : await loadKnowledgePacket(window.location.search, window.location.href);
  const selection = sourceLoad.selection;
  const built = hasBundleReference
    ? buildKnowledgeSceneFromBundle(sourceLoad.bundle, assetProvider, { source: selection })
    : buildKnowledgeSceneFromPacket(sourceLoad.packet, assetProvider, { source: selection });
  const sourceCatalog = [
    ...listKnowledgePacketSpecs().map((spec) => ({
      key: `packet:${spec.id}`,
      kind: "packet",
      id: spec.id,
      label: `Packet — ${spec.label ?? spec.title}`,
      description: spec.description,
      active: !hasBundleReference && selection.kind === "builtin" && spec.id === selection.id
    })),
    ...listKnowledgeBundleFixtures().map((spec) => ({
      key: `bundle:${spec.id}`,
      kind: "bundle",
      id: spec.id,
      label: `Bundle — ${spec.label ?? spec.title}`,
      description: spec.description,
      active: hasBundleReference && selection.kind === "builtin" && spec.id === selection.id
    }))
  ];
  const packetCatalog = listKnowledgePacketSpecs().map((spec) => ({
    id: spec.id,
    label: spec.label ?? spec.title,
    description: spec.description,
    active: selection.kind === "builtin" && spec.id === selection.id
  }));

  if (selection.kind === "custom") {
    sourceCatalog.unshift({
      key: `${hasBundleReference ? "bundle" : "packet"}:${selection.id}`,
      kind: hasBundleReference ? "bundle" : "packet",
      id: selection.id,
      label: selection.title,
      description: selection.sourceLabel,
      active: true,
      custom: true
    });
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
        schemaId: built.packet.metadata?.schemaId,
        schemaVersion: built.packet.metadata?.schemaVersion,
        sourceId: selection.id,
        title: selection.title,
        sourceLabel: selection.sourceLabel,
        description: selection.description,
        sourceKind: selection.type,
        builtin: selection.kind === "builtin",
        errorCount: built.packetDiagnostics.errors.length,
        errors: built.packetDiagnostics.errors.slice(0, 4),
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
      bundle: built.bundle
        ? {
            schemaId: built.bundle.metadata?.schemaId,
            schemaVersion: built.bundle.metadata?.schemaVersion,
            sourceId: selection.id,
            title: selection.title,
            sourceLabel: selection.sourceLabel,
            sourceKind: selection.type,
            errorCount: built.bundleDiagnostics.errors.length,
            errors: built.bundleDiagnostics.errors.slice(0, 4),
            warningCount: built.bundleDiagnostics.warnings.length,
            warnings: built.bundleDiagnostics.warnings.slice(0, 4),
            counts: {
              evidence: built.bundle.evidence.length,
              issues: built.bundle.issues.length,
              figures: built.bundle.figures.length,
              answerBlocks: built.bundle.answer?.blocks?.length ?? 0,
              tokens: built.bundle.answer?.lowConfidencePhrases?.length ?? 0
            }
          }
        : null,
      activeSourceKey: `${hasBundleReference ? "bundle" : "packet"}:${selection.id}`,
      sourceCatalog,
      activePacketId: selection.id,
      packetCatalog: hasBundleReference ? [] : packetCatalog
    }
  };
}
