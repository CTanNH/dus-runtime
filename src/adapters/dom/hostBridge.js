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
  const UI_SYNC_MS = 120;
  const root = document.createElement("div");
  const controls = document.createElement("div");
  const inspector = document.createElement("pre");
  const callout = document.createElement("div");
  const guide = document.createElement("div");
  const guideTitle = document.createElement("div");
  const guideBody = document.createElement("div");
  const guideList = document.createElement("div");
  const taskList = document.createElement("div");
  const packetList = document.createElement("div");
  const benchmarkBox = document.createElement("div");
  const guideActions = document.createElement("div");
  const inspectorText = document.createTextNode("");
  const calloutText = document.createTextNode("");
  const guideTitleText = document.createTextNode("");
  const guideBodyText = document.createTextNode("");
  const benchmarkText = document.createTextNode("");

  setStyle(root, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#d8e7ff",
    contain: "layout style paint"
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
    left: "0",
    top: "0",
    transform: "translate3d(-9999px, -9999px, 0) translate(-50%, -100%)",
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

  setStyle(packetList, {
    display: "flex",
    flexDirection: "column",
    gap: "6px"
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

  inspector.append(inspectorText);
  callout.append(calloutText);
  guideTitle.append(guideTitleText);
  guideBody.append(guideBodyText);
  benchmarkBox.append(benchmarkText);

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
  guide.append(guideTitle, guideBody, taskList, packetList, benchmarkBox, guideList, guideActions);
  root.append(controls, inspector, callout, guide);
  document.body.append(root);

  let guideSignature = "";
  let inspectorSignature = "";
  let benchmarkSignature = "";
  let calloutSignature = "";
  let lastUiSync = -Infinity;
  let lastSelectionId = null;
  let taskButtons = [];
  let packetButtons = [];
  let guideButtons = [];

  return {
    mount(viewModel) {
      this.update(viewModel);
    },

    update(viewModel) {
      const demo = viewModel.scene.metadata ?? {};
      const guideSteps = demo.guideSteps ?? [];
      const tasks = demo.tasks ?? [];
      const packetInfo = demo.packet ?? {};
      const packetCatalog = demo.packetCatalog ?? [];
      const activePacketId = demo.activePacketId ?? packetInfo.sourceId ?? null;
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
      const benchmarkState = viewModel.benchmark ?? options.getBenchmarkState?.() ?? { tasks: [], activeRun: null, recentResults: [] };
      const totals = viewModel.debugState.totals ?? {};
      const unstableSummary = (viewModel.explainability?.scene?.topUnstableNodes ?? [])
        .slice(0, 3)
        .map((node) => `${node.id}:${node.dominantLoss.key}`)
        .join(" · ");
      const now = performance.now();
      const shouldSyncText = selectionId !== lastSelectionId || now - lastUiSync >= UI_SYNC_MS;
      lastSelectionId = selectionId;

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
        title: demo.title ?? "",
        description: demo.description ?? "",
        packetSource: packetInfo.sourceLabel ?? "",
        packetWarnings: packetInfo.warningCount ?? 0,
        steps: guideSteps.map((step) => ({ id: step.id, label: step.label, nodeId: step.nodeId })),
        tasks: tasks.map((task) => ({ id: task.id, title: task.title, nodeIds: task.nodeIds })),
        packets: packetCatalog.map((packet) => ({ id: packet.id, label: packet.label }))
      });

      if (nextGuideSignature !== guideSignature) {
        guideSignature = nextGuideSignature;
        guideTitleText.nodeValue = `${demo.title ?? "Scene"} guide`;
        const packetCounts = packetInfo.counts
          ? `ingest    ans ${packetInfo.counts.answerBlocks} · ev ${packetInfo.counts.evidence} · ctr ${packetInfo.counts.contradictions} · fig ${packetInfo.counts.figures} · cit ${packetInfo.counts.citations} · tok ${packetInfo.counts.tokens}`
          : null;
        guideBodyText.nodeValue = [
          demo.description ?? "",
          packetInfo.sourceLabel ? `packet    ${packetInfo.sourceLabel}` : null,
          packetCounts,
          typeof packetInfo.warningCount === "number" ? `warnings  ${packetInfo.warningCount}` : null,
          "",
          "watch for",
          ...(demo.watchFor ?? []).map((item) => `- ${item}`)
        ].filter(Boolean).join("\n");

        taskList.replaceChildren();
        taskButtons = [];
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
          taskButtons.push(button);
        }

        packetList.replaceChildren();
        packetButtons = [];
        if (packetCatalog.length > 0 && options.actions.switchPacket) {
          for (const packet of packetCatalog) {
            const button = createButton(packet.label, () => options.actions.switchPacket(packet.id));
            button.dataset.packetId = packet.id;
            button.style.justifyContent = "flex-start";
            button.style.textAlign = "left";
            button.style.width = "100%";
            button.style.borderRadius = "14px";
            button.style.padding = "8px 10px";
            button.textContent = `Packet — ${packet.label}`;
            packetList.append(button);
            packetButtons.push(button);
          }
        }

        guideList.replaceChildren();
        guideButtons = [];
        for (const step of guideSteps) {
          const button = createButton(step.label, () => options.actions.focusNode(step.nodeId));
          button.dataset.nodeId = step.nodeId;
          button.style.justifyContent = "flex-start";
          button.style.textAlign = "left";
          button.style.width = "100%";
          button.style.borderRadius = "14px";
          button.style.padding = "8px 10px";
          button.textContent = `${step.label} — ${step.description}`;
          guideList.append(button);
          guideButtons.push(button);
        }

        guideActions.replaceChildren(
          createButton("Replay scene", () => options.actions.replay()),
          createButton("Fit all", () => options.actions.fitCamera()),
          createButton("Export runs", () => options.actions.exportBenchmark?.()),
          createButton("Clear runs", () => options.actions.clearBenchmark?.())
        );
      }

      const taskStateById = new Map((benchmarkState.tasks ?? []).map((task) => [task.id, task]));
      for (const button of taskButtons) {
        const state = taskStateById.get(button.dataset.taskId);
        if (!state) continue;
        button.style.opacity = state.status === "active" ? "1" : state.lastRun?.completed ? "0.88" : "0.76";
        button.style.borderColor = state.status === "active"
          ? "rgba(151,196,255,0.46)"
          : state.lastRun?.completed
            ? "rgba(106,196,162,0.34)"
            : "rgba(140,170,220,0.22)";
      }

      for (const button of guideButtons) {
        button.style.opacity = button.dataset.nodeId === selectionId ? "1" : "0.76";
      }

      for (const button of packetButtons) {
        const isActive = button.dataset.packetId === activePacketId;
        button.style.opacity = isActive ? "1" : "0.74";
        button.style.borderColor = isActive
          ? "rgba(151,196,255,0.46)"
          : "rgba(140,170,220,0.22)";
      }

      if (shouldSyncText) {
        const nextInspector = [
          `DUS runtime`,
          `demo      ${demo.title ?? demo.demoId ?? "scene"}`,
          demo.subtitle ? `intent    ${demo.subtitle}` : null,
          packetInfo.sourceLabel ? `packet    ${packetInfo.sourceLabel}` : null,
          packetInfo.counts
            ? `ingest    ans ${packetInfo.counts.answerBlocks} · ev ${packetInfo.counts.evidence} · ctr ${packetInfo.counts.contradictions} · fig ${packetInfo.counts.figures} · cit ${packetInfo.counts.citations} · tok ${packetInfo.counts.tokens}`
            : null,
          typeof packetInfo.warningCount === "number" ? `warnings  ${packetInfo.warningCount}` : null,
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
        if (nextInspector !== inspectorSignature) {
          inspectorSignature = nextInspector;
          inspectorText.nodeValue = nextInspector;
        }

        const activeRun = benchmarkState.activeRun;
        const nextBenchmark = activeRun
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
        if (nextBenchmark !== benchmarkSignature) {
          benchmarkSignature = nextBenchmark;
          benchmarkText.nodeValue = nextBenchmark;
        }
        lastUiSync = now;
      }

      if (!selected) {
        if (callout.style.display !== "none") {
          callout.style.display = "none";
          callout.style.transform = "translate3d(-9999px, -9999px, 0) translate(-50%, -100%)";
          calloutSignature = "";
        }
        return;
      }

      const screen = options.project({ x: selected.x, y: selected.y + selected.height * 0.55 });
      const x = clamp(screen.x, 120, window.innerWidth - 120);
      const y = clamp(screen.y, 96, window.innerHeight - 24);
      const nextCalloutText = [
        selected.id,
        selected.metadata?.role ?? selected.kind,
        `confidence ${selected.confidence.toFixed(2)}`,
        `importance ${selected.importance.toFixed(2)}`
      ].join("\n");
      const nextCalloutSignature = `${x.toFixed(1)}:${y.toFixed(1)}:${nextCalloutText}`;
      if (nextCalloutSignature !== calloutSignature) {
        calloutSignature = nextCalloutSignature;
        callout.style.display = "block";
        callout.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
        calloutText.nodeValue = nextCalloutText;
      }
    }
  };
}
