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
      return [...runs];
    },

    getState() {
      return buildState();
    }
  };
}
