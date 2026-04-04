function normalizeTask(task, index) {
  const id = String(task?.id ?? `task-${index}`);
  const successNodeIds = [...new Set((task?.successNodeIds ?? task?.nodeIds ?? []).filter(Boolean).map(String))];
  return {
    id,
    benchmarkId: String(task?.benchmarkId ?? id),
    title: String(task?.title ?? id),
    prompt: String(task?.prompt ?? ""),
    nodeIds: [...new Set((task?.nodeIds ?? []).filter(Boolean).map(String))],
    successNodeIds,
    successMode: task?.successMode === "any" ? "any" : "all",
    completionEvent: task?.completionEvent === "focus" ? "focus" : "select"
  };
}

function safeNow(clock) {
  try {
    return Number(clock?.() ?? Date.now());
  } catch {
    return Date.now();
  }
}

function loadRuns(storage, storageKey) {
  if (!storage?.getItem) return [];
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistRuns(storage, storageKey, runs) {
  if (!storage?.setItem) return;
  try {
    storage.setItem(storageKey, JSON.stringify(runs.slice(-64)));
  } catch {
    // Ignore persistence failures; the harness still works in-memory.
  }
}

function initialActionCounts() {
  return {
    focus: 0,
    select: 0,
    pan: 0,
    zoom: 0,
    fit: 0,
    replay: 0
  };
}

function cloneActionCounts(actionCounts = {}) {
  return {
    focus: Number(actionCounts.focus ?? 0),
    select: Number(actionCounts.select ?? 0),
    pan: Number(actionCounts.pan ?? 0),
    zoom: Number(actionCounts.zoom ?? 0),
    fit: Number(actionCounts.fit ?? 0),
    replay: Number(actionCounts.replay ?? 0)
  };
}

function serializeRun(run) {
  return {
    taskId: String(run.taskId),
    benchmarkId: String(run.benchmarkId ?? run.taskId),
    title: String(run.title ?? run.taskId),
    prompt: String(run.prompt ?? ""),
    demoId: String(run.demoId ?? "demo"),
    startedAt: Number(run.startedAt ?? 0),
    elapsedMs: Number(run.elapsedMs ?? 0),
    completed: Boolean(run.completed),
    reason: String(run.reason ?? (run.completed ? "completed" : "unknown")),
    completedNodeIds: [...new Set((run.completedNodeIds ?? []).filter(Boolean).map(String))],
    successNodeIds: [...new Set((run.successNodeIds ?? []).filter(Boolean).map(String))],
    actionCounts: cloneActionCounts(run.actionCounts),
    lastEvent: run.lastEvent ? { ...run.lastEvent } : null
  };
}

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

function summarizeRunSet(runs) {
  const completedRuns = runs.filter((run) => run.completed);
  const completedElapsed = completedRuns.map((run) => run.elapsedMs);
  const actionTotals = completedRuns.reduce((totals, run) => {
    const counts = cloneActionCounts(run.actionCounts);
    for (const [key, value] of Object.entries(counts)) {
      totals[key] = (totals[key] ?? 0) + value;
    }
    return totals;
  }, cloneActionCounts());
  const completedCount = completedRuns.length;
  const actionAverages = Object.fromEntries(
    Object.entries(actionTotals).map(([key, value]) => [key, completedCount > 0 ? Number((value / completedCount).toFixed(3)) : 0])
  );

  return {
    runCount: runs.length,
    completedCount,
    completionRate: runs.length > 0 ? Number((completedCount / runs.length).toFixed(4)) : 0,
    meanElapsedMs: completedCount > 0 ? Number(average(completedElapsed).toFixed(3)) : null,
    medianElapsedMs: completedCount > 0 ? Number(median(completedElapsed).toFixed(3)) : null,
    bestElapsedMs: completedCount > 0 ? Number(Math.min(...completedElapsed).toFixed(3)) : null,
    actionAverages
  };
}

function buildComparisons(tasks, runs) {
  const comparisons = [];
  for (const task of tasks) {
    const benchmarkId = task.benchmarkId ?? task.id;
    const benchmarkRuns = runs.filter((run) => run.benchmarkId === benchmarkId);
    const byDemo = new Map();
    for (const run of benchmarkRuns) {
      const list = byDemo.get(run.demoId) ?? [];
      list.push(run);
      byDemo.set(run.demoId, list);
    }

    comparisons.push({
      benchmarkId,
      taskId: task.id,
      title: task.title,
      demos: [...byDemo.entries()]
        .map(([demoId, demoRuns]) => ({
          demoId,
          ...summarizeRunSet(demoRuns)
        }))
        .sort((left, right) => left.demoId.localeCompare(right.demoId))
    });
  }
  return comparisons;
}

export function createBenchmarkReport(options = {}) {
  const tasks = (options.tasks ?? []).map(normalizeTask);
  const runs = (options.runs ?? []).map(serializeRun);
  const generatedAt = Number(options.generatedAt ?? Date.now());
  const demoId = String(options.demoId ?? "demo");
  const comparisons = buildComparisons(tasks, runs);

  return {
    schemaId: "dus-benchmark-report",
    schemaVersion: 1,
    generatedAt,
    demoId,
    storageKey: options.storageKey ?? "dus-benchmark-v1",
    tasks: tasks.map((task) => ({
      id: task.id,
      benchmarkId: task.benchmarkId,
      title: task.title,
      prompt: task.prompt,
      completionEvent: task.completionEvent,
      successMode: task.successMode,
      nodeIds: [...task.nodeIds],
      successNodeIds: [...task.successNodeIds]
    })),
    runs,
    summary: {
      totalRuns: runs.length,
      completedRuns: runs.filter((run) => run.completed).length,
      comparisons
    }
  };
}

function summarizeTask(task, activeRun, runs, demoId) {
  const ownRuns = runs.filter((run) => run.demoId === demoId && run.taskId === task.id);
  const peerRuns = runs.filter((run) => run.demoId !== demoId && run.benchmarkId === task.benchmarkId);
  const active = activeRun?.taskId === task.id ? activeRun : null;
  const lastRun = ownRuns[ownRuns.length - 1] ?? null;
  const bestRun = ownRuns.reduce((best, run) => {
    if (!run.completed) return best;
    if (!best || run.elapsedMs < best.elapsedMs) return run;
    return best;
  }, null);
  const comparison = peerRuns[peerRuns.length - 1] ?? null;

  return {
    id: task.id,
    benchmarkId: task.benchmarkId,
    title: task.title,
    prompt: task.prompt,
    nodeIds: [...task.nodeIds],
    successNodeIds: [...task.successNodeIds],
    status: active ? "active" : lastRun?.completed ? "completed" : "idle",
    completionEvent: task.completionEvent,
    successMode: task.successMode,
    progress: active
      ? {
          completed: active.completedNodeIds.length,
          total: active.successNodeIds.length,
          completedNodeIds: [...active.completedNodeIds]
        }
      : {
          completed: lastRun?.completedNodeIds?.length ?? 0,
          total: task.successNodeIds.length,
          completedNodeIds: [...(lastRun?.completedNodeIds ?? [])]
        },
    lastRun: lastRun
      ? {
          elapsedMs: lastRun.elapsedMs,
          completed: lastRun.completed,
          actionCounts: { ...lastRun.actionCounts }
        }
      : null,
    bestRun: bestRun
      ? {
          elapsedMs: bestRun.elapsedMs,
          completed: bestRun.completed
        }
      : null,
    comparison: comparison
      ? {
          demoId: comparison.demoId,
          elapsedMs: comparison.elapsedMs,
          completed: comparison.completed
        }
      : null
  };
}

export function createBenchmarkHarness(options = {}) {
  const storageKey = options.storageKey ?? "dus-benchmark-v1";
  const clock = options.now ?? (() => Date.now());
  let demoId = String(options.demoId ?? "demo");
  let tasks = (options.tasks ?? []).map(normalizeTask);
  let runs = loadRuns(options.storage ?? null, storageKey);
  let activeRun = null;

  function snapshotRun() {
    if (!activeRun) return null;
    const elapsedMs = Math.max(0, safeNow(clock) - activeRun.startedAt);
    return {
      taskId: activeRun.taskId,
      benchmarkId: activeRun.benchmarkId,
      title: activeRun.title,
      prompt: activeRun.prompt,
      demoId,
      startedAt: activeRun.startedAt,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      completedNodeIds: [...activeRun.completedNodeIds],
      successNodeIds: [...activeRun.successNodeIds],
      actionCounts: { ...activeRun.actionCounts },
      lastEvent: activeRun.lastEvent ? { ...activeRun.lastEvent } : null
    };
  }

  function buildState() {
    return {
      demoId,
      activeRun: activeRun
        ? {
            ...snapshotRun(),
            status: "active",
            progress: {
              completed: activeRun.completedNodeIds.length,
              total: activeRun.successNodeIds.length
            }
          }
        : null,
      tasks: tasks.map((task) => summarizeTask(task, activeRun, runs, demoId)),
      recentResults: runs
        .slice(-8)
        .reverse()
        .map((run) => ({
          taskId: run.taskId,
          benchmarkId: run.benchmarkId,
          demoId: run.demoId,
          elapsedMs: run.elapsedMs,
          completed: run.completed
        }))
    };
  }

  function finalizeActiveRun(reason) {
    if (!activeRun) return null;
    const result = {
      ...snapshotRun(),
      completed: reason === "completed",
      reason
    };
    runs = [...runs, result].slice(-64);
    persistRuns(options.storage ?? null, storageKey, runs);
    activeRun = null;
    return result;
  }

  function checkCompletion() {
    if (!activeRun) return null;
    if (activeRun.successNodeIds.length === 0) return null;

    const isComplete = activeRun.successMode === "any"
      ? activeRun.completedNodeIds.length > 0
      : activeRun.successNodeIds.every((nodeId) => activeRun.completedSet.has(nodeId));

    return isComplete ? finalizeActiveRun("completed") : null;
  }

  function markCompletionProgress(nodeId, eventType) {
    if (!activeRun || !nodeId) return null;
    if (activeRun.completionEvent !== eventType) return null;
    if (!activeRun.successNodeIds.includes(nodeId)) return null;
    if (!activeRun.completedSet.has(nodeId)) {
      activeRun.completedSet.add(nodeId);
      activeRun.completedNodeIds.push(nodeId);
    }
    return checkCompletion();
  }

  return {
    setDemo(nextDemoId) {
      demoId = String(nextDemoId ?? demoId);
      return buildState();
    },

    setTasks(nextTasks) {
      tasks = (nextTasks ?? []).map(normalizeTask);
      if (activeRun && !tasks.some((task) => task.id === activeRun.taskId)) {
        activeRun = null;
      }
      return buildState();
    },

    startTask(taskId) {
      const task = tasks.find((entry) => entry.id === taskId);
      if (!task) return buildState();
      activeRun = {
        taskId: task.id,
        benchmarkId: task.benchmarkId,
        title: task.title,
        prompt: task.prompt,
        startedAt: safeNow(clock),
        successNodeIds: [...task.successNodeIds],
        completionEvent: task.completionEvent,
        successMode: task.successMode,
        completedSet: new Set(),
        completedNodeIds: [],
        actionCounts: initialActionCounts(),
        lastEvent: null
      };
      return buildState();
    },

    cancelActiveTask(reason = "cancelled") {
      finalizeActiveRun(reason);
      return buildState();
    },

    recordFocus(nodeId) {
      if (!activeRun || !nodeId) return buildState();
      activeRun.actionCounts.focus += 1;
      activeRun.lastEvent = { type: "focus", nodeId, at: safeNow(clock) };
      markCompletionProgress(String(nodeId), "focus");
      return buildState();
    },

    recordSelection(nodeId) {
      if (!activeRun || !nodeId) return buildState();
      activeRun.actionCounts.select += 1;
      activeRun.lastEvent = { type: "select", nodeId, at: safeNow(clock) };
      markCompletionProgress(String(nodeId), "select");
      return buildState();
    },

    recordAction(type) {
      if (!activeRun || !type) return buildState();
      if (Object.hasOwn(activeRun.actionCounts, type)) {
        activeRun.actionCounts[type] += 1;
      }
      activeRun.lastEvent = { type, at: safeNow(clock) };
      return buildState();
    },

    getRuns() {
      return runs.map(serializeRun);
    },

    clearRuns() {
      runs = [];
      persistRuns(options.storage ?? null, storageKey, runs);
      if (activeRun) {
        activeRun.completedSet.clear();
        activeRun.completedNodeIds.length = 0;
      }
      return buildState();
    },

    exportReport() {
      return createBenchmarkReport({
        demoId,
        storageKey,
        generatedAt: safeNow(clock),
        tasks,
        runs
      });
    },

    getState() {
      return buildState();
    }
  };
}
