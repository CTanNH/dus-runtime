const DEFAULT_PACKET_ID = "workspace";

export const KNOWLEDGE_PACKET_FIXTURES = Object.freeze([
  {
    id: "workspace",
    title: "Evidence workspace",
    description: "The default task-oriented knowledge workspace.",
    featured: true,
    url: new URL("./knowledge-packet.json", import.meta.url)
  },
  {
    id: "retrieval-drift",
    title: "Retrieval drift",
    description: "A packet centered on grounding failure and citation drift.",
    featured: true,
    url: new URL("./packets/retrieval-drift.packet.json", import.meta.url)
  },
  {
    id: "agent-handoff",
    title: "Agent handoff",
    description: "A packet centered on plan/evidence handoff across agents.",
    featured: true,
    url: new URL("./packets/agent-handoff.packet.json", import.meta.url)
  },
  {
    id: "incident-triage",
    title: "Incident triage",
    description: "A packet centered on browser validation, diagnostics, and runtime bottlenecks.",
    featured: true,
    url: new URL("./packets/incident-triage.packet.json", import.meta.url)
  },
  {
    id: "model-comparison",
    title: "Model comparison",
    description: "A packet centered on agreement, disagreement, and provenance.",
    featured: true,
    url: new URL("./packets/model-comparison.packet.json", import.meta.url)
  },
  {
    id: "retrieval",
    title: "Retrieval trace",
    description: "Evidence-heavy packet with denser retrieval and citation structure.",
    featured: false,
    url: new URL("./packets/knowledge-packet.retrieval.json", import.meta.url)
  },
  {
    id: "debate",
    title: "Debate pressure",
    description: "Contradiction-heavy packet that stresses dissent and proximity.",
    featured: false,
    url: new URL("./packets/knowledge-packet.debate.json", import.meta.url)
  },
  {
    id: "noisy",
    title: "Noisy ingest",
    description: "Intentionally malformed packet for diagnostics and validator coverage.",
    featured: false,
    url: new URL("./packets/knowledge-packet.noisy.json", import.meta.url)
  }
]);

export const KNOWLEDGE_PACKET_SPECS = KNOWLEDGE_PACKET_FIXTURES;

function trimLower(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function serializeFixture(fixture) {
  return {
    id: fixture.id,
    title: fixture.title,
    label: fixture.title,
    description: fixture.description,
    featured: fixture.featured !== false,
    href: fixture.url.href
  };
}

export function listKnowledgePacketFixtures(options = {}) {
  const includeHidden = Boolean(options.includeHidden);
  return KNOWLEDGE_PACKET_FIXTURES
    .filter((fixture) => includeHidden || fixture.featured !== false)
    .map(serializeFixture);
}

export function listKnowledgePacketSpecs(options = {}) {
  return listKnowledgePacketFixtures(options);
}

export function getKnowledgePacketFixtureById(id) {
  const key = trimLower(id);
  const fixture = KNOWLEDGE_PACKET_FIXTURES.find((entry) => entry.id === key) ?? null;
  return fixture ? serializeFixture(fixture) : null;
}

export function getKnowledgePacketFixture(id) {
  return getKnowledgePacketFixtureById(id) ?? serializeFixture(KNOWLEDGE_PACKET_FIXTURES[0]);
}

export function getKnowledgePacketSpecById(id) {
  return getKnowledgePacketFixtureById(id);
}

export function resolveKnowledgePacketReference(search = "", currentHref = "") {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : new URLSearchParams(search);
  const baseHref = currentHref || (typeof window !== "undefined" ? window.location.href : KNOWLEDGE_PACKET_FIXTURES[0].url.href);
  const override = params.get("packet")?.trim();

  if (override) {
    const builtin = getKnowledgePacketFixtureById(override);
    if (builtin) {
      return {
        kind: "builtin",
        type: "fixture",
        id: builtin.id,
        title: builtin.title,
        label: builtin.label,
        description: builtin.description,
        url: new URL(builtin.href),
        href: builtin.href,
        sourceLabel: builtin.label,
        fixtures: listKnowledgePacketFixtures()
      };
    }

    const url = new URL(override, baseHref);
    return {
      kind: "custom",
      type: "url",
      id: "custom",
      title: "Custom packet",
      label: "Custom packet",
      description: "Loaded through the packet query override.",
      url,
      href: url.href,
      sourceLabel: url.href,
      fixtures: listKnowledgePacketFixtures()
    };
  }

  const requestedId = trimLower(params.get("packetId")) || DEFAULT_PACKET_ID;
  const fixture = getKnowledgePacketFixtureById(requestedId) ?? getKnowledgePacketFixture(DEFAULT_PACKET_ID);
  const fixtures = listKnowledgePacketFixtures();
  if (!fixtures.some((entry) => entry.id === fixture.id)) {
    fixtures.push(fixture);
  }

  return {
    kind: "builtin",
    type: "fixture",
    id: fixture.id,
    title: fixture.title,
    label: fixture.label,
    description: fixture.description,
    url: new URL(fixture.href),
    href: fixture.href,
    requestedId,
    sourceLabel: fixture.label,
    fixtures
  };
}

export function resolveKnowledgePacketSource(search = "", currentHref = "") {
  return resolveKnowledgePacketReference(search, currentHref);
}

export async function loadKnowledgePacket(search = "", currentHref = "") {
  const selection = resolveKnowledgePacketReference(search, currentHref);
  const response = await fetch(selection.url);
  if (!response.ok) {
    throw new Error(`Knowledge packet load failed: ${response.status} ${response.statusText}`);
  }

  return {
    selection,
    packet: await response.json()
  };
}
