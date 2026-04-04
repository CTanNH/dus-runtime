import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const NODE_EXE = process.execPath;

function parseArgs(argv) {
  const args = {
    knowledgeOut: path.join(ROOT, "artifacts", "scripted-knowledge.json"),
    baselineOut: path.join(ROOT, "artifacts", "scripted-baseline.json"),
    studyOut: path.join(ROOT, "artifacts", "scripted-study.json"),
    markdownOut: path.join(ROOT, "artifacts", "scripted-study.md"),
    packetId: null,
    bundleId: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--knowledge-out") {
      args.knowledgeOut = path.resolve(argv[index + 1] ?? args.knowledgeOut);
      index += 1;
      continue;
    }
    if (value === "--baseline-out") {
      args.baselineOut = path.resolve(argv[index + 1] ?? args.baselineOut);
      index += 1;
      continue;
    }
    if (value === "--study-out") {
      args.studyOut = path.resolve(argv[index + 1] ?? args.studyOut);
      index += 1;
      continue;
    }
    if (value === "--markdown-out") {
      args.markdownOut = path.resolve(argv[index + 1] ?? args.markdownOut);
      index += 1;
      continue;
    }
    if (value === "--packetId") {
      args.packetId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === "--bundleId") {
      args.bundleId = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return args;
}

function runNode(scriptPath, scriptArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(NODE_EXE, [scriptPath, ...scriptArgs], {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptedBenchmarkScript = path.join(ROOT, "tools", "run-scripted-benchmark.mjs");
  const compareScript = path.join(ROOT, "tools", "compare-benchmark-reports.mjs");

  const knowledgeArgs = ["--demo", "knowledge", "--out", args.knowledgeOut];
  if (args.packetId) knowledgeArgs.push("--packetId", args.packetId);
  if (args.bundleId) knowledgeArgs.push("--bundleId", args.bundleId);

  const baselineArgs = ["--demo", "baseline", "--out", args.baselineOut];
  if (args.packetId) baselineArgs.push("--packetId", args.packetId);
  if (args.bundleId) baselineArgs.push("--bundleId", args.bundleId);

  await runNode(scriptedBenchmarkScript, knowledgeArgs);
  await runNode(scriptedBenchmarkScript, baselineArgs);
  await runNode(compareScript, [
    args.knowledgeOut,
    args.baselineOut,
    "--out",
    args.studyOut,
    "--markdown",
    args.markdownOut
  ]);

  process.stdout.write(`${args.studyOut}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
