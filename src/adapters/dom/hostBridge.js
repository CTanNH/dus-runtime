import { clamp, makeSparkline } from "../../core/utils.js";

function setStyle(element, style) {
  Object.assign(element.style, style);
}

function createButton(label, onClick) {
  const button = document.createElement("button");
  button.textContent = label;
  button.type = "button";
  setStyle(button, {
    background: "rgba(16,22,38,0.92)",
    color: "#d7e7ff",
    border: "1px solid rgba(140,170,220,0.22)",
    borderRadius: "999px",
    padding: "6px 10px",
    font: "12px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace",
    cursor: "pointer"
  });
  button.addEventListener("click", onClick);
  return button;
}

export function createDomHostBridge(options) {
  const root = document.createElement("div");
  const controls = document.createElement("div");
  const inspector = document.createElement("pre");
  const callout = document.createElement("div");
  const guide = document.createElement("div");
  const guideTitle = document.createElement("div");
  const guideBody = document.createElement("div");
  const guideList = document.createElement("div");
  const taskList = document.createElement("div");
  const benchmarkBox = document.createElement("div");
  const guideActions = document.createElement("div");

  setStyle(root, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#d8e7ff"
  });

  setStyle(controls, {
    position: "absolute",
    top: "14px",
    left: "14px",
    display: "flex",
    gap: "8px",
    pointerEvents: "auto"
  });

  setStyle(inspector, {
    position: "absolute",
    left: "14px",
    bottom: "14px",
    margin: "0",
    padding: "12px 14px",
    minWidth: "360px",
    maxWidth: "440px",
    color: "#dbe8ff",
    background: "rgba(4,8,16,0.78)",
    border: "1px solid rgba(120,150,204,0.20)",
    borderRadius: "16px",
    backdropFilter: "blur(14px)",
    whiteSpace: "pre-wrap",
    font: "12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace"
  });

  setStyle(callout, {
    position: "absolute",
    transform: "translate(-50%, -100%)",
    padding: "8px 10px",
    background: "rgba(10,14,24,0.90)",
    border: "1px solid rgba(138,174,228,0.26)",
    borderRadius: "14px",
    color: "#eff6ff",
    font: "12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
    pointerEvents: "none",
    whiteSpace: "pre-wrap"
  });

  setStyle(guide, {
    position: "absolute",
    top: "14px",
    right: "14px",
    width: "330px",
    padding: "12px 14px",
    background: "rgba(4,8,16,0.78)",
    border: "1px solid rgba(120,150,204,0.20)",
    borderRadius: "16px",
    backdropFilter: "blur(14px)",
    pointerEvents: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    color: "#dbe8ff"
  });

  setStyle(guideTitle, {
    font: "600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#f2f7ff",
    textTransform: "uppercase",
    letterSpacing: "0.08em"
  });

  setStyle(guideBody, {
    font: "12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#b8c8e4",
    whiteSpace: "pre-wrap"
  });

  setStyle(guideList, {
    display: "flex",
    flexDirection: "column",
    gap: "6px"
  });

  setStyle(guideActions, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px"
  });

  setStyle(taskList, {
    display: "flex",
    flexDirection: "column",
    gap: "8px"
  });

  setStyle(benchmarkBox, {
    padding: "10px 12px",
    borderRadius: "14px",
    border: "1px solid rgba(120,150,204,0.18)",
    background: "rgba(8,12,22,0.72)",
    font: "12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
    whiteSpace: "pre-wrap",
    color: "#c8d8f1"
  });

  const buttons = {
    benchmark: createButton("Benchmark", () => options.actions.switchDemo("field")),
    baseline: createButton("Baseline", () => options.actions.switchDemo("baseline")),
    workspace: createButton("Workspace", () => options.actions.switchDemo("knowledge")),
    plain: createButton("Plain", () => options.actions.setViewPreset("plain")),
    field: createButton("Field", () => options.actions.setViewPreset("field")),
    debug: createButton("Debug", () => options.actions.setViewPreset("debug")),
    fit: createButton("Fit", () => options.actions.fitCamera()),
    targets: createButton("Targets", () => options.actions.toggleTargets()),
    heat: createButton("Heat", () => options.actions.toggleHeat()),
    pause: createButton("Pause", () => options.actions.togglePause()),
    replay: createButton("Replay", () => options.actions.replay())
  };

  controls.append(
    buttons.benchmark,
    buttons.baseline,
    buttons.workspace,
    buttons.plain,
    buttons.field,
    buttons.debug,
    buttons.fit,
    buttons.targets,
    buttons.heat,
    buttons.pause,
    buttons.replay
  );
  guide.append(guideTitle, guideBody, taskList, benchmarkBox, guideList, guideActions);
  root.append(controls, inspector, callout, guide);
  document.body.append(root);

  let guideSignature = "";

  return {
    mount(viewModel) {
      this.update(viewModel);
    },

    update(viewModel) {
      const demo = viewModel.scene.metadata ?? {};
      const guideSteps = demo.guideSteps ?? [];
      const tasks = demo.tasks ?? [];
      const selectionId = viewModel.interactionField.selectedNodeId;
      const selected = selectionId
        ? viewModel.layout.nodePoses.find((pose) => pose.id === selectionId)
        : null;
      const selectedDebug = selectionId
        ? viewModel.debugState.nodes.find((node) => node.id === selectionId)
        : null;
      const selectedExplainability = selectionId
        ? viewModel.explainability?.nodes?.find((node) => node.id === selectionId)
        : null;
      const benchmarkState = viewModel.benchmark ?? { tasks: [], activeRun: null, recentResults: [] };
      const totals = viewModel.debugState.totals ?? {};
      const unstableSummary = (viewModel.explainability?.scene?.topUnstableNodes ?? [])
        .slice(0, 3)
        .map((node) => `${node.id}:${node.dominantLoss.key}`)
        .join(" · ");

      inspector.textContent = [
        `DUS runtime`,
        `demo      ${demo.title ?? demo.demoId ?? "scene"}`,
        demo.subtitle ? `intent    ${demo.subtitle}` : null,
        `view      ${options.getViewPreset()}`,
        `paused    ${options.getPaused() ? "yes" : "no"}`,
        `nodes     ${viewModel.layout.nodePoses.length}`,
        `loss      ${Number(totals.total ?? 0).toFixed(3)}`,
        `trace     ${makeSparkline(viewModel.debugState.convergenceTrace ?? [])}`,
        unstableSummary ? `unstable  ${unstableSummary}` : null,
        "",
        `shortcuts`,
        `1 plain · 2 field · 3 debug · b benchmark · c baseline · k workspace`,
        `f fit · r replay · space pause`,
        `benchmark / baseline / workspace buttons switch the official demo lane`,
        "",
        `active constraints`,
        `${(viewModel.debugState.activeConstraints ?? []).map((constraint) => `${constraint.type}:${constraint.mode}`).join(" · ")}`,
        demo.description ? `\n${demo.description}` : null,
        "",
        selected && selectedDebug
          ? [
              `selected  ${selected.id}`,
              `role      ${selected.metadata?.role ?? selected.kind}`,
              `focus     ${selected.focusInfluence.toFixed(2)}`,
              `motion    ${selected.motionX.toFixed(3)}, ${selected.motionY.toFixed(3)}`,
              `losses    target ${selectedDebug.losses.target.toFixed(3)} | overlap ${selectedDebug.losses.overlap.toFixed(3)} | relation ${selectedDebug.losses.relation.toFixed(3)} | order ${selectedDebug.losses.order.toFixed(3)} | focus ${selectedDebug.losses.focus.toFixed(3)}`,
              `constraints ${selectedDebug.activeConstraints.join(", ")}`,
              selectedExplainability ? `why       ${selectedExplainability.narrative}` : null
            ].join("\n")
          : "selected  none"
      ].join("\n");

      const demoId = demo.demoId ?? options.getDemoId?.();
      buttons.benchmark.style.opacity = demoId === "field" ? "1" : "0.65";
      buttons.baseline.style.opacity = demoId === "baseline" ? "1" : "0.65";
      buttons.workspace.style.opacity = demoId === "knowledge" ? "1" : "0.65";
      const preset = options.getViewPreset();
      buttons.plain.style.opacity = preset === "plain" ? "1" : "0.65";
      buttons.field.style.opacity = preset === "field" ? "1" : "0.65";
      buttons.debug.style.opacity = preset === "debug" ? "1" : "0.65";
      buttons.targets.style.opacity = options.getShowTargets() ? "1" : "0.65";
      buttons.heat.style.opacity = options.getShowHeat() ? "1" : "0.65";
      buttons.pause.style.opacity = options.getPaused() ? "1" : "0.65";

      const nextGuideSignature = JSON.stringify({
        demoId: demo.demoId ?? "scene",
        selectionId,
        steps: guideSteps.map((step) => ({ id: step.id, label: step.label, nodeId: step.nodeId })),
        tasks: tasks.map((task) => ({ id: task.id, title: task.title, nodeIds: task.nodeIds }))
      });

      if (nextGuideSignature !== guideSignature) {
        guideSignature = nextGuideSignature;
        guideTitle.textContent = `${demo.title ?? "Scene"} guide`;
        guideBody.textContent = [
          demo.description ?? "",
          "",
          "watch for",
          ...(demo.watchFor ?? []).map((item) => `- ${item}`)
        ].filter(Boolean).join("\n");

        taskList.replaceChildren();
        for (const task of tasks) {
          const button = createButton(task.title, () => options.actions.runTask(task.id, task.nodeIds));
          button.dataset.taskId = task.id;
          button.style.justifyContent = "flex-start";
          button.style.textAlign = "left";
          button.style.width = "100%";
          button.style.borderRadius = "14px";
          button.style.padding = "8px 10px";
          button.textContent = `${task.title} — ${task.prompt}`;
          taskList.append(button);
        }

        guideList.replaceChildren();
        for (const step of guideSteps) {
          const button = createButton(step.label, () => options.actions.focusNode(step.nodeId));
          button.style.justifyContent = "flex-start";
          button.style.textAlign = "left";
          button.style.width = "100%";
          button.style.borderRadius = "14px";
          button.style.padding = "8px 10px";
          button.textContent = `${step.label} — ${step.description}`;
          button.style.opacity = selectionId === step.nodeId ? "1" : "0.76";
          guideList.append(button);
        }

        guideActions.replaceChildren(
          createButton("Replay scene", () => options.actions.replay()),
          createButton("Fit all", () => options.actions.fitCamera())
        );
      }

      const taskStateById = new Map((benchmarkState.tasks ?? []).map((task) => [task.id, task]));
      for (const button of taskList.children) {
        const state = taskStateById.get(button.dataset.taskId);
        if (!state) continue;
        button.style.opacity = state.status === "active" ? "1" : state.lastRun?.completed ? "0.88" : "0.76";
        button.style.borderColor = state.status === "active"
          ? "rgba(151,196,255,0.46)"
          : state.lastRun?.completed
            ? "rgba(106,196,162,0.34)"
            : "rgba(140,170,220,0.22)";
      }

      const activeRun = benchmarkState.activeRun;
      benchmarkBox.textContent = activeRun
        ? [
            "benchmark",
            `active    ${activeRun.title}`,
            `progress  ${activeRun.progress.completed}/${activeRun.progress.total}`,
            `elapsed   ${(activeRun.elapsedMs / 1000).toFixed(2)}s`,
            `actions   sel ${activeRun.actionCounts.select} · focus ${activeRun.actionCounts.focus} · pan ${activeRun.actionCounts.pan} · zoom ${activeRun.actionCounts.zoom}`
          ].join("\n")
        : [
            "benchmark",
            "active    none",
            benchmarkState.recentResults?.[0]
              ? `last      ${benchmarkState.recentResults[0].taskId} · ${benchmarkState.recentResults[0].demoId} · ${(benchmarkState.recentResults[0].elapsedMs / 1000).toFixed(2)}s`
              : "last      none",
            ...((benchmarkState.tasks ?? [])
              .filter((task) => task.comparison)
              .slice(0, 2)
              .map((task) => `compare   ${task.id} vs ${task.comparison.demoId} · ${(task.comparison.elapsedMs / 1000).toFixed(2)}s`))
          ].filter(Boolean).join("\n");

      if (!selected) {
        callout.style.display = "none";
        return;
      }

      const screen = options.project({ x: selected.x, y: selected.y + selected.height * 0.55 });
      callout.style.display = "block";
      callout.style.left = `${clamp(screen.x, 120, window.innerWidth - 120)}px`;
      callout.style.top = `${clamp(screen.y, 96, window.innerHeight - 24)}px`;
      callout.textContent = [
        selected.id,
        selected.metadata?.role ?? selected.kind,
        `confidence ${selected.confidence.toFixed(2)}`,
        `importance ${selected.importance.toFixed(2)}`
      ].join("\n");
    }
  };
}
