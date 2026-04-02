import { buildKnowledgeSceneFromDocument } from "../core/ingest.js";

const KNOWLEDGE_DOCUMENT = {
  metadata: {
    demoId: "knowledge",
    title: "Knowledge Workspace",
    subtitle: "Task demo for AI-native interfaces",
    description: "A narrower workspace that tries to prove usefulness: answers, evidence, contradictions, figures, and citations share one solvable reading surface.",
    intent: "task",
    watchFor: [
      "The hypothesis should remain readable while evidence and contradiction nodes negotiate around it.",
      "Low-confidence contradiction fragments should feel warmer and less rigid than the cold, high-confidence answer blocks.",
      "The same solved layout should stay coherent in plain, field, and debug views."
    ],
    guideSteps: [
      {
        id: "hypothesis",
        label: "Main claim",
        nodeId: "answer-hypothesis",
        description: "Start here. This is the statement the workspace is trying to stabilize without collapsing surrounding evidence."
      },
      {
        id: "support",
        label: "Support chain",
        nodeId: "evidence-anchor",
        description: "These evidence nodes should settle near the answer, preserving proximity without becoming a fixed card stack."
      },
      {
        id: "risk",
        label: "Low-confidence risk",
        nodeId: "contradiction-ui",
        description: "This contradiction node is intentionally weaker and hotter. It should stay legible without dominating the answer."
      },
      {
        id: "figure",
        label: "Figure anchor",
        nodeId: "figure-uncertainty-ridge",
        description: "Images behave as first-class evidence. They are anchored by relation, not by a side panel."
      },
      {
        id: "citation",
        label: "Citation band",
        nodeId: "citation-b",
        description: "Citations should remain nearby and ordered, but they are still part of the same solved surface."
      }
    ],
    tasks: [
      {
        id: "claim-support",
        title: "Trace support for the claim",
        prompt: "Can you follow one support chain from the main claim through evidence, figure, and citation without losing context?",
        nodeIds: ["answer-hypothesis", "evidence-anchor", "figure-retrieval-map", "citation-a"],
        successNodeIds: ["answer-hypothesis", "evidence-anchor", "citation-a"],
        successMode: "all"
      },
      {
        id: "weak-region",
        title: "Find the weakest region",
        prompt: "Which part of the workspace looks least stable, and can you inspect it without the answer collapsing away?",
        nodeIds: ["answer-risk", "contradiction-ui", "figure-uncertainty-ridge", "citation-c"],
        successNodeIds: ["contradiction-ui", "figure-uncertainty-ridge", "citation-c"],
        successMode: "all"
      },
      {
        id: "layout-explain",
        title: "Explain why this node is here",
        prompt: "Select the debug evidence chain and check whether the inspector makes the solver legible instead of magical.",
        nodeIds: ["answer-system", "evidence-debug", "token-loss", "citation-d"],
        successNodeIds: ["answer-system", "evidence-debug", "citation-d"],
        successMode: "all"
      }
    ]
  },
  text: [
    {
      id: "lead-title",
      text: "Differentiable UI Surface",
      role: "lead",
      confidence: 0.98
    },
    {
      id: "answer-hypothesis",
      text: "Answers stabilize when evidence, counter-evidence, and uncertainty stay co-visible inside one navigable field.",
      role: "answer",
      confidence: 0.93,
      importance: 0.94,
      stiffness: 0.92,
      maxWidth: 4.5,
      lineHeight: 0.30,
      paddingX: 0.20,
      paddingY: 0.16
    },
    {
      id: "answer-system",
      text: "The runtime is not a card stack. It solves toward readable targets while continuously negotiating collision, order, relation, and focus.",
      role: "answer",
      confidence: 0.88,
      importance: 0.86,
      maxWidth: 4.4,
      lineHeight: 0.26
    },
    {
      id: "answer-risk",
      text: "Low-confidence phrases remain visually unstable, but they no longer break the reading surface.",
      role: "answer",
      confidence: 0.74,
      importance: 0.74,
      stiffness: 0.62,
      maxWidth: 3.8,
      lineHeight: 0.25,
      paddingY: 0.14
    },
    {
      id: "evidence-anchor",
      text: "Citation-linked scaffolds preserve reading order under interaction.",
      role: "evidence",
      confidence: 0.92,
      importance: 0.88,
      stiffness: 0.8248
    },
    {
      id: "evidence-focus",
      text: "Semantic focus pulls related nodes into a local basin without collapsing the global layout.",
      role: "evidence",
      confidence: 0.84,
      importance: 0.78,
      stiffness: 0.7896
    },
    {
      id: "evidence-debug",
      text: "Per-node loss accounting makes the runtime explainable instead of magical.",
      role: "evidence",
      confidence: 0.89,
      importance: 0.84,
      stiffness: 0.8116
    },
    {
      id: "evidence-bridge",
      text: "DOM overlays can attach to solved poses for selection, annotation, and accessibility.",
      role: "evidence",
      confidence: 0.86,
      importance: 0.80,
      stiffness: 0.7984
    },
    {
      id: "evidence-image",
      text: "Figures behave like first-class evidence nodes instead of decorative sidecars.",
      role: "evidence",
      confidence: 0.77,
      importance: 0.72,
      stiffness: 0.7588
    },
    {
      id: "evidence-plain",
      text: "A plain renderer keeps the system readable when fluid styling is disabled.",
      role: "evidence",
      confidence: 0.95,
      importance: 0.90,
      stiffness: 0.838
    },
    {
      id: "contradiction-ui",
      text: "A pure field renderer can obscure text if readability constraints are too weak.",
      role: "contradiction",
      confidence: 0.34,
      importance: 0.66,
      stiffness: 0.322
    },
    {
      id: "contradiction-scale",
      text: "Naive all-pairs optimization will stall before thousand-node scenes are pleasant.",
      role: "contradiction",
      confidence: 0.42,
      importance: 0.72,
      stiffness: 0.346
    },
    {
      id: "contradiction-adoption",
      text: "If the runtime cannot explain itself, teams will retreat to deterministic boxes.",
      role: "contradiction",
      confidence: 0.51,
      importance: 0.78,
      stiffness: 0.373
    },
    { id: "citation-a", text: "[A] Retrieval trace · 128 runs", role: "citation", confidence: 0.88, importance: 0.596, stiffness: 0.6064 },
    { id: "citation-b", text: "[B] Counter-evidence log · 14 contradictions", role: "citation", confidence: 0.70, importance: 0.56, stiffness: 0.556 },
    { id: "citation-c", text: "[C] Confidence decay probe · 2.4s window", role: "citation", confidence: 0.58, importance: 0.536, stiffness: 0.5224 },
    { id: "citation-d", text: "[D] Layout replay seed · 11", role: "citation", confidence: 0.94, importance: 0.608, stiffness: 0.6232 },
    { id: "citation-e", text: "[E] Host bridge audit · DOM overlay attached", role: "citation", confidence: 0.86, importance: 0.592, stiffness: 0.6008 },
    { id: "token-co-visible", text: "co-visible", role: "token", confidence: 0.95, importance: 0.666, stiffness: 0.505 },
    { id: "token-uncertainty", text: "uncertainty", role: "token", confidence: 0.40, importance: 0.512, stiffness: 0.34 },
    { id: "token-readable", text: "readable", role: "token", confidence: 0.90, importance: 0.652, stiffness: 0.49 },
    { id: "token-focus", text: "focus field", role: "token", confidence: 0.72, importance: 0.6016, stiffness: 0.436, flowGap: 0.08 },
    { id: "token-loss", text: "loss graph", role: "token", confidence: 0.88, importance: 0.6464, stiffness: 0.484, flowGap: 0.08 },
    { id: "token-bridge", text: "host bridge", role: "token", confidence: 0.64, importance: 0.5792, stiffness: 0.412, flowGap: 0.08 }
  ],
  images: [
    {
      id: "figure-retrieval-map",
      imageId: "retrieval-map",
      role: "figure",
      clusterId: "figure-support",
      confidence: 0.82,
      importance: 0.70,
      stiffness: 0.54,
      figureSide: "right"
    },
    {
      id: "figure-uncertainty-ridge",
      imageId: "uncertainty-ridge",
      role: "figure",
      clusterId: "figure-contradiction",
      confidence: 0.44,
      importance: 0.62,
      stiffness: 0.30,
      figureSide: "right"
    },
    {
      id: "figure-citation-lattice",
      imageId: "citation-lattice",
      role: "figure",
      clusterId: "figure-evidence",
      confidence: 0.76,
      importance: 0.66,
      stiffness: 0.46,
      figureSide: "left"
    }
  ],
  relations: [
    { from: "evidence-anchor", to: "answer-hypothesis", type: "supports", weight: 0.9 },
    { from: "evidence-focus", to: "answer-system", type: "supports", weight: 0.9 },
    { from: "evidence-debug", to: "answer-system", type: "supports", weight: 0.9 },
    { from: "evidence-bridge", to: "answer-system", type: "supports", weight: 0.9 },
    { from: "evidence-image", to: "answer-hypothesis", type: "supports", weight: 0.9 },
    { from: "evidence-plain", to: "answer-risk", type: "supports", weight: 0.9 },
    { from: "figure-retrieval-map", to: "evidence-anchor", type: "supports", weight: 0.9 },
    { from: "figure-uncertainty-ridge", to: "contradiction-ui", type: "supports", weight: 0.9 },
    { from: "figure-citation-lattice", to: "evidence-debug", type: "supports", weight: 0.9 },
    { from: "contradiction-ui", to: "answer-hypothesis", type: "contradicts", weight: 1.0, idealDistance: 2.3 },
    { from: "contradiction-scale", to: "answer-system", type: "contradicts", weight: 0.9, idealDistance: 2.4 },
    { from: "contradiction-adoption", to: "answer-system", type: "contradicts", weight: 0.72, idealDistance: 2.2 },
    { from: "citation-a", to: "evidence-anchor", type: "cites", weight: 0.82, idealDistance: 1.4 },
    { from: "citation-b", to: "contradiction-ui", type: "cites", weight: 0.70, idealDistance: 1.2 },
    { from: "citation-c", to: "answer-risk", type: "cites", weight: 0.62, idealDistance: 1.3 },
    { from: "citation-d", to: "evidence-debug", type: "cites", weight: 0.76, idealDistance: 1.3 },
    { from: "citation-e", to: "evidence-bridge", type: "cites", weight: 0.72, idealDistance: 1.1 },
    { from: "token-co-visible", to: "answer-hypothesis", type: "belongs_to", weight: 0.75, idealDistance: 1.0 },
    { from: "token-uncertainty", to: "answer-risk", type: "belongs_to", weight: 0.72, idealDistance: 0.92 },
    { from: "token-readable", to: "evidence-plain", type: "belongs_to", weight: 0.66, idealDistance: 0.96 },
    { from: "token-focus", to: "evidence-focus", type: "belongs_to", weight: 0.68, idealDistance: 0.94 },
    { from: "token-loss", to: "evidence-debug", type: "belongs_to", weight: 0.72, idealDistance: 0.94 },
    { from: "token-bridge", to: "evidence-bridge", type: "belongs_to", weight: 0.64, idealDistance: 0.94 }
  ]
};

export async function buildKnowledgeWorkspaceScene(assetProvider) {
  return buildKnowledgeSceneFromDocument(KNOWLEDGE_DOCUMENT, assetProvider);
}
