function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const center = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[center];
  return (sorted[center - 1] + sorted[center]) * 0.5;
}

function normalizeActionCounts(actionCounts = {}) {
  return {
    focus: Number(actionCounts.focus ?? 0),
    select: Number(actionCounts.select ?? 0),
    pan: Number(actionCounts.pan ?? 0),
    zoom: Number(actionCounts.zoom ?? 0),
    fit: Number(actionCounts.fit ?? 0),
    replay: Number(actionCounts.replay ?? 0)
  };
}

function totalActions(actionCounts = {}) {
  return Object.values(normalizeActionCounts(actionCounts)).reduce((sum, value) => sum + value, 0);
}

function formatMetric(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return Number(value).toFixed(digits);
}

function normalizeTask(task) {
  return {
    id: String(task?.id ?? "task"),
    benchmarkId: String(task?.benchmarkId ?? task?.id ?? "task"),
    title: String(task?.title ?? task?.id ?? "task"),
    prompt: String(task?.prompt ?? ""),
    nodeIds: [...new Set((task?.nodeIds ?? []).filter(Boolean).map(String))],
    successNodeIds: [...new Set((task?.successNodeIds ?? []).filter(Boolean).map(String))],
    successMode: task?.successMode === "any" ? "any" : "all",
    completionEvent: task?.completionEvent === "focus" ? "focus" : "select"
  };
}

function normalizeRun(run) {
  return {
    taskId: String(run?.taskId ?? "task"),
    benchmarkId: String(run?.benchmarkId ?? run?.taskId ?? "task"),
    title: String(run?.title ?? run?.taskId ?? "task"),
    prompt: String(run?.prompt ?? ""),
    demoId: String(run?.demoId ?? "demo"),
    startedAt: Number(run?.startedAt ?? 0),
    elapsedMs: Number(run?.elapsedMs ?? 0),
    completed: Boolean(run?.completed),
    reason: String(run?.reason ?? (run?.completed ? "completed" : "unknown")),
    completedNodeIds: [...new Set((run?.completedNodeIds ?? []).filter(Boolean).map(String))],
    successNodeIds: [...new Set((run?.successNodeIds ?? []).filter(Boolean).map(String))],
    actionCounts: normalizeActionCounts(run?.actionCounts),
    lastEvent: run?.lastEvent ? { ...run.lastEvent } : null
  };
}

function summarizeRuns(runs) {
  const normalized = runs.map(normalizeRun);
  const completedRuns = normalized.filter((run) => run.completed);
  const completedElapsed = completedRuns.map((run) => run.elapsedMs);
  const actionTotals = completedRuns.reduce((totals, run) => {
    const counts = normalizeActionCounts(run.actionCounts);
    for (const [key, value] of Object.entries(counts)) {
      totals[key] = (totals[key] ?? 0) + value;
    }
    return totals;
  }, normalizeActionCounts());
  const completedCount = completedRuns.length;
  const actionAverages = Object.fromEntries(
    Object.entries(actionTotals).map(([key, value]) => [key, completedCount > 0 ? Number((value / completedCount).toFixed(3)) : 0])
  );
  const totalActionCounts = normalized.map((run) => totalActions(run.actionCounts));

  return {
    runCount: normalized.length,
    completedCount,
    completionRate: normalized.length > 0 ? Number((completedCount / normalized.length).toFixed(4)) : 0,
    meanElapsedMs: completedCount > 0 ? Number(average(completedElapsed).toFixed(3)) : null,
    medianElapsedMs: completedCount > 0 ? Number(median(completedElapsed).toFixed(3)) : null,
    bestElapsedMs: completedCount > 0 ? Number(Math.min(...completedElapsed).toFixed(3)) : null,
    meanActionCount: completedCount > 0 ? Number(average(totalActionCounts).toFixed(3)) : null,
    actionAverages
  };
}

function compareDemoSummaries(left, right) {
  if (left.completionRate !== right.completionRate) {
    return right.completionRate - left.completionRate;
  }
  const leftMedian = left.medianElapsedMs ?? Number.POSITIVE_INFINITY;
  const rightMedian = right.medianElapsedMs ?? Number.POSITIVE_INFINITY;
  if (leftMedian !== rightMedian) {
    return leftMedian - rightMedian;
  }
  const leftActions = left.meanActionCount ?? Number.POSITIVE_INFINITY;
  const rightActions = right.meanActionCount ?? Number.POSITIVE_INFINITY;
  if (leftActions !== rightActions) {
    return leftActions - rightActions;
  }
  return left.demoId.localeCompare(right.demoId);
}

function buildDemoSummary(demoId, runs) {
  return {
    demoId,
    ...summarizeRuns(runs)
  };
}

function buildTaskStudy(task, runs) {
  const byDemo = new Map();
  for (const run of runs) {
    const list = byDemo.get(run.demoId) ?? [];
    list.push(run);
    byDemo.set(run.demoId, list);
  }

  const demos = [...byDemo.entries()]
    .map(([demoId, demoRuns]) => buildDemoSummary(demoId, demoRuns))
    .sort(compareDemoSummaries);

  const leader = demos[0]
    ? {
        demoId: demos[0].demoId,
        reason: demos[0].completionRate < 1
          ? "highest-completion-rate"
          : demos[0].medianElapsedMs != null
            ? "fastest-median-time"
            : "most-complete"
      }
    : null;

  const pairwiseDeltas = [];
  for (let index = 1; index < demos.length; index += 1) {
    const current = demos[index];
    const reference = demos[0];
    const elapsedDeltaMs = reference?.medianElapsedMs != null && current.medianElapsedMs != null
      ? Number((current.medianElapsedMs - reference.medianElapsedMs).toFixed(3))
      : null;
    pairwiseDeltas.push({
      winnerDemoId: reference.demoId,
      loserDemoId: current.demoId,
      completionRateDelta: Number((reference.completionRate - current.completionRate).toFixed(4)),
      medianElapsedDeltaMs: elapsedDeltaMs,
      medianElapsedDeltaPct: elapsedDeltaMs != null && current.medianElapsedMs
        ? Number(((elapsedDeltaMs / current.medianElapsedMs) * 100).toFixed(3))
        : null
    });
  }

  return {
    benchmarkId: task.benchmarkId,
    taskId: task.id,
    title: task.title,
    prompt: task.prompt,
    demos,
    leader,
    pairwiseDeltas
  };
}

function collectTasks(reports) {
  const taskMap = new Map();
  for (const report of reports) {
    for (const task of report.tasks ?? []) {
      const normalized = normalizeTask(task);
      const key = `${normalized.benchmarkId}:${normalized.id}`;
      if (!taskMap.has(key)) {
        taskMap.set(key, normalized);
      }
    }
  }
  return [...taskMap.values()];
}

function collectRuns(reports) {
  return reports.flatMap((report) => (report.runs ?? []).map(normalizeRun));
}

function buildDemoTotals(runs) {
  const byDemo = new Map();
  for (const run of runs) {
    const list = byDemo.get(run.demoId) ?? [];
    list.push(run);
    byDemo.set(run.demoId, list);
  }
  return [...byDemo.entries()]
    .map(([demoId, demoRuns]) => buildDemoSummary(demoId, demoRuns))
    .sort(compareDemoSummaries);
}

function buildWinsByDemo(tasks) {
  const wins = new Map();
  for (const task of tasks) {
    if (!task.leader?.demoId) continue;
    wins.set(task.leader.demoId, (wins.get(task.leader.demoId) ?? 0) + 1);
  }
  return Object.fromEntries([...wins.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function createBenchmarkStudy(options = {}) {
  const reports = (options.reports ?? []).map((report) => ({
    schemaId: String(report?.schemaId ?? ""),
    schemaVersion: Number(report?.schemaVersion ?? 0),
    demoId: String(report?.demoId ?? "demo"),
    generatedAt: Number(report?.generatedAt ?? 0),
    tasks: (report?.tasks ?? []).map(normalizeTask),
    runs: (report?.runs ?? []).map(normalizeRun)
  }));

  const tasks = collectTasks(reports);
  const runs = collectRuns(reports);
  const taskStudies = tasks
    .map((task) => buildTaskStudy(task, runs.filter((run) => run.benchmarkId === task.benchmarkId)))
    .sort((left, right) => left.benchmarkId.localeCompare(right.benchmarkId));
  const demoTotals = buildDemoTotals(runs);

  return {
    schemaId: "dus-benchmark-study",
    schemaVersion: 1,
    generatedAt: Number(options.generatedAt ?? Date.now()),
    reportCount: reports.length,
    reports: reports.map((report) => ({
      demoId: report.demoId,
      generatedAt: report.generatedAt,
      taskCount: report.tasks.length,
      runCount: report.runs.length
    })),
    demos: demoTotals,
    tasks: taskStudies,
    summary: {
      taskCount: taskStudies.length,
      comparableTaskCount: taskStudies.filter((task) => task.demos.length >= 2).length,
      winsByDemo: buildWinsByDemo(taskStudies),
      totalRuns: runs.length
    }
  };
}

export function renderBenchmarkStudyMarkdown(study) {
  const lines = [];
  lines.push("# DUS Benchmark Study");
  lines.push("");
  lines.push(`Generated: ${new Date(study.generatedAt).toISOString()}`);
  lines.push("");
  lines.push("## Demo Totals");
  lines.push("");
  lines.push("| Demo | Runs | Completion | Median time (ms) | Mean actions |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const demo of study.demos ?? []) {
    lines.push(`| ${demo.demoId} | ${demo.runCount} | ${formatMetric(demo.completionRate * 100)}% | ${formatMetric(demo.medianElapsedMs, 1)} | ${formatMetric(demo.meanActionCount, 2)} |`);
  }

  lines.push("");
  lines.push("## Task Comparisons");
  lines.push("");
  lines.push("| Benchmark | Leader | Reason | Notes |");
  lines.push("| --- | --- | --- | --- |");
  for (const task of study.tasks ?? []) {
    const notes = task.pairwiseDeltas?.[0]
      ? `${task.pairwiseDeltas[0].winnerDemoId} beats ${task.pairwiseDeltas[0].loserDemoId} by ${formatMetric(task.pairwiseDeltas[0].medianElapsedDeltaMs, 1)} ms`
      : "single demo";
    lines.push(`| ${task.title} | ${task.leader?.demoId ?? "n/a"} | ${task.leader?.reason ?? "n/a"} | ${notes} |`);
  }

  lines.push("");
  lines.push("## Task Detail");
  lines.push("");
  for (const task of study.tasks ?? []) {
    lines.push(`### ${task.title}`);
    lines.push("");
    if (task.prompt) {
      lines.push(task.prompt);
      lines.push("");
    }
    lines.push("| Demo | Runs | Completion | Median time (ms) | Mean actions |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");
    for (const demo of task.demos ?? []) {
      lines.push(`| ${demo.demoId} | ${demo.runCount} | ${formatMetric(demo.completionRate * 100)}% | ${formatMetric(demo.medianElapsedMs, 1)} | ${formatMetric(demo.meanActionCount, 2)} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
