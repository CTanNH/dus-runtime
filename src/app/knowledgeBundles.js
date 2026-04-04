const DEFAULT_BUNDLE_ID = "runtime-adoption";

export const KNOWLEDGE_BUNDLE_FIXTURES = Object.freeze([
  {
    id: "runtime-adoption",
    title: "Runtime adoption",
    description: "Upstream AI synthesis bundle focused on adoption risk and proof-of-advantage.",
    featured: true,
    url: new URL("./bundles/runtime-adoption.bundle.json", import.meta.url)
  },
  {
    id: "retrieval-trace",
    title: "Retrieval trace",
    description: "Bundle fixture focused on provenance-heavy retrieval output.",
    featured: true,
    url: new URL("./bundles/retrieval-trace.bundle.json", import.meta.url)
  }
]);

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

export function listKnowledgeBundleFixtures(options = {}) {
  const includeHidden = Boolean(options.includeHidden);
  return KNOWLEDGE_BUNDLE_FIXTURES
    .filter((fixture) => includeHidden || fixture.featured !== false)
    .map(serializeFixture);
}

export function getKnowledgeBundleFixtureById(id) {
  const key = trimLower(id);
  const fixture = KNOWLEDGE_BUNDLE_FIXTURES.find((entry) => entry.id === key) ?? null;
  return fixture ? serializeFixture(fixture) : null;
}

export function resolveKnowledgeBundleReference(search = "", currentHref = "") {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : new URLSearchParams(search);
  const baseHref = currentHref || (typeof window !== "undefined" ? window.location.href : KNOWLEDGE_BUNDLE_FIXTURES[0].url.href);
  const override = params.get("bundle")?.trim();

  if (override) {
    const builtin = getKnowledgeBundleFixtureById(override);
    if (builtin) {
      return {
        kind: "builtin",
        type: "bundle-fixture",
        id: builtin.id,
        title: builtin.title,
        label: builtin.label,
        description: builtin.description,
        url: new URL(builtin.href),
        href: builtin.href,
        sourceLabel: builtin.label,
        fixtures: listKnowledgeBundleFixtures()
      };
    }

    const url = new URL(override, baseHref);
    return {
      kind: "custom",
      type: "bundle-url",
      id: "custom-bundle",
      title: "Custom bundle",
      label: "Custom bundle",
      description: "Loaded through the bundle query override.",
      url,
      href: url.href,
      sourceLabel: url.href,
      fixtures: listKnowledgeBundleFixtures()
    };
  }

  const requestedId = trimLower(params.get("bundleId")) || DEFAULT_BUNDLE_ID;
  const fixture = getKnowledgeBundleFixtureById(requestedId) ?? getKnowledgeBundleFixtureById(DEFAULT_BUNDLE_ID);
  const fixtures = listKnowledgeBundleFixtures();
  if (fixture && !fixtures.some((entry) => entry.id === fixture.id)) {
    fixtures.push(fixture);
  }

  return {
    kind: "builtin",
    type: "bundle-fixture",
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

export async function loadKnowledgeBundle(search = "", currentHref = "") {
  const selection = resolveKnowledgeBundleReference(search, currentHref);
  const response = await fetch(selection.url);
  if (!response.ok) {
    throw new Error(`Knowledge bundle load failed: ${response.status} ${response.statusText}`);
  }

  return {
    selection,
    bundle: await response.json()
  };
}
