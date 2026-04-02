import { buildKnowledgeWorkspaceScene } from "./knowledgeWorkspace.js";

export async function buildBoxBaselineScene(assetProvider) {
  const baseScene = await buildKnowledgeWorkspaceScene(assetProvider);

  return {
    ...baseScene,
    metadata: {
      demoId: "baseline",
      title: "Box Baseline",
      subtitle: "Deterministic control scene",
      description: "The control group: the same content held in a rigid, pinned reading stack. Useful for comparing what DUS gains once layout is allowed to solve under competing objectives instead of staying fixed.",
      intent: "control",
      watchFor: [
        "The reading order is obvious immediately, but relation pressure has nowhere to go except into residual tension.",
        "Contradictions, figures, and citations stay obediently boxed instead of re-negotiating around the main claim.",
        "Use this as a control: then switch back to knowledge workspace and compare what becomes more navigable."
      ],
      guideSteps: [
        {
          id: "baseline-claim",
          label: "Pinned main claim",
          nodeId: "answer-hypothesis",
          description: "This claim stays exactly where scaffold placed it. The baseline never re-solves around live relation pressure."
        },
        {
          id: "baseline-risk",
          label: "Pinned contradiction rail",
          nodeId: "contradiction-ui",
          description: "The contradiction is boxed into place. It remains readable, but it does not negotiate for nearby space."
        },
        {
          id: "baseline-figure",
          label: "Pinned figure column",
          nodeId: "figure-uncertainty-ridge",
          description: "Figures stay where the control layout puts them, behaving more like a side rail than part of a shared semantic surface."
        },
        {
          id: "baseline-citation",
          label: "Pinned citation band",
          nodeId: "citation-b",
          description: "Citations remain orderly and static. The point is not that this is bad, but that it cannot absorb competing relation pulls."
        }
      ],
      tasks: [
        {
          id: "compare-claim",
          title: "Compare the claim region",
          prompt: "Inspect the claim, support, and contradiction together here, then switch to knowledge workspace and compare how much more locally negotiable the same content becomes.",
          nodeIds: ["answer-hypothesis", "evidence-anchor", "contradiction-ui"]
        },
        {
          id: "inspect-figure-rail",
          title: "Inspect the fixed figure rail",
          prompt: "Look at how the figure and citation stay obediently boxed. This is the control case DUS is trying to surpass, not dismiss.",
          nodeIds: ["figure-uncertainty-ridge", "figure-citation-lattice", "citation-b"]
        },
        {
          id: "see-unsolved-tension",
          title: "See residual tension",
          prompt: "Select the explanation chain and watch the debug losses. In the control scene, the layout stays fixed even when relation tension remains unresolved.",
          nodeIds: ["answer-system", "evidence-debug", "contradiction-adoption", "citation-d"]
        }
      ]
    },
    nodes: baseScene.nodes.map((node) => ({
      ...node,
      pinned: true,
      stiffness: Math.max(node.stiffness ?? 0.0, 0.94)
    }))
  };
}
