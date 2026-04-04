import fs from "node:fs/promises";
import path from "node:path";

import { createBenchmarkStudy, renderBenchmarkStudyMarkdown } from "../src/core/benchmarkStudy.js";

function parseArgs(argv) {
  const args = {
    inputs: [],
    out: null,
    markdown: null
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--out") {
      args.out = argv[index + 1] ? path.resolve(argv[index + 1]) : null;
      index += 1;
      continue;
    }
    if (value === "--markdown") {
      args.markdown = argv[index + 1] ? path.resolve(argv[index + 1]) : null;
      index += 1;
      continue;
    }
    positional.push(value);
  }

  if (!args.out && !args.markdown && positional.length > 3) {
    args.markdown = path.resolve(positional[positional.length - 1]);
    positional.pop();
    args.out = path.resolve(positional[positional.length - 1]);
    positional.pop();
  } else if (!args.out && positional.length > 2) {
    args.out = path.resolve(positional[positional.length - 1]);
    positional.pop();
  }

  for (const value of positional) {
    args.inputs.push(path.resolve(value));
  }

  return args;
}

async function readReport(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed?.schemaId === "dus-scripted-benchmark-run" && parsed?.result?.benchmark?.schemaId === "dus-benchmark-report") {
    return {
      ...parsed.result.benchmark,
      __scriptedRun: {
        generatedAt: parsed.generatedAt,
        pageUrl: parsed.pageUrl
      }
    };
  }
  if (parsed?.schemaId !== "dus-benchmark-report") {
    throw new Error(`${filePath} is not a dus-benchmark-report document.`);
  }
  return parsed;
}

function mergeReports(reports) {
  return {
    sources: reports.map((report) => ({
      demoId: report.demoId,
      generatedAt: report.generatedAt,
      runCount: report.summary?.totalRuns ?? report.runs?.length ?? 0,
      pageUrl: report.__scriptedRun?.pageUrl ?? null
    })),
    study: createBenchmarkStudy({
      reports,
      generatedAt: Date.now()
    })
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

  if (options.markdown) {
    const markdown = renderBenchmarkStudyMarkdown(comparison.study);
    await fs.mkdir(path.dirname(options.markdown), { recursive: true });
    await fs.writeFile(options.markdown, markdown);
  }

  if (options.out) {
    await fs.mkdir(path.dirname(options.out), { recursive: true });
    await fs.writeFile(options.out, json);
    console.log(options.out);
    return;
  }

  console.log(json);
}

await main();
