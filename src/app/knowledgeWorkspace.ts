import { buildKnowledgeSceneFromDocument } from "../core/ingest.ts";
import { buildKnowledgeDocumentFromPacket } from "../core/knowledgePacket.ts";

const DEFAULT_PACKET_URL = new URL("./knowledge-packet.json", import.meta.url);

async function loadKnowledgePacket() {
  const override = new URLSearchParams(window.location.search).get("packet");
  const source = override ? new URL(override, window.location.href) : DEFAULT_PACKET_URL;
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Knowledge packet load failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function buildKnowledgeWorkspaceScene(assetProvider) {
  const packet = await loadKnowledgePacket();
  return buildKnowledgeSceneFromDocument(buildKnowledgeDocumentFromPacket(packet), assetProvider);
}
