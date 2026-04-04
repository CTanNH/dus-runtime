import fs from "node:fs/promises";
import path from "node:path";

import { createBenchmarkReport } from "../src/core/benchmark.js";

function parseArgs(argv) {
  const args = {
    inputs: [],
    out: null
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--out") {
      args.out = argv[index + 1] ? path.resolve(argv[index + 1]) : null;
      index += 1;
      continue;
    }
    positional.push(value);
  }

  if (!args.out && positional.length > 2) {
    args.out = path.resolve(positional[positional.length - 1]);
    positional.pop();
  }

  for (const value of positional) {
    args.inputs.push(path.resolve(value));
  }

  return args;
}

function normalizeTask(task) {
  return {
    id: String(task.id),
    benchmarkId: String(task.benchmarkId ?? task.id),
    title: String(task.title ?? task.id),
    prompt: String(task.prompt ?? ""),
    nodeIds: [...new Set((task.nodeIds ?? []).filter(Boolean).map(String))],
    successNodeIds: [...new Set((task.successNodeIds ?? []).filter(Boolean).map(String))],
    successMode: task.successMode === "any" ? "any" : "all",
    completionEvent: task.completionEvent === "focus" ? "focus" : "select"
  };
}

async function readReport(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed?.schemaId !== "dus-benchmark-report") {
    throw new Error(`${filePath} is not a dus-benchmark-report document.`);
  }
  return parsed;
}

function mergeReports(reports) {
  const taskMap = new Map();
  const runs = [];

  for (const report of reports) {
    for (const task of report.tasks ?? []) {
      const normalized = normalizeTask(task);
      const key = `${normalized.benchmarkId}:${normalized.id}`;
      if (!taskMap.has(key)) {
        taskMap.set(key, normalized);
      }
    }
    for (const run of report.runs ?? []) {
      runs.push(run);
    }
  }

  const merged = createBenchmarkReport({
    demoId: "merged",
    tasks: [...taskMap.values()],
    runs,
    generatedAt: Date.now(),
    storageKey: "dus-benchmark-merged"
  });

  return {
    sources: reports.map((report) => ({
      demoId: report.demoId,
      generatedAt: report.generatedAt,
      runCount: report.summary?.totalRuns ?? report.runs?.length ?? 0
    })),
    merged
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.inputs.length === 0) {
    throw new Error("Usage: npm run compare:benchmarks -- <report-a.json> <report-b.json> [--out output.json]");
  }

  const reports = [];
  for (const input of options.inputs) {
    reports.push(await readReport(input));
  }

  const comparison = mergeReports(reports);
  const json = JSON.stringify(comparison, null, 2);

  if (options.out) {
    await fs.mkdir(path.dirname(options.out), { recursive: true });
    await fs.writeFile(options.out, json);
    console.log(options.out);
    return;
  }

  console.log(json);
}

await main();
