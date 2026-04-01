import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const ARTIFACTS = path.join(ROOT, "artifacts");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const probeHtml = `<!doctype html>
<meta charset="utf-8">
<title>probe-pending</title>
<script>
async function run() {
  const report = { navigatorGpu: !!navigator.gpu, phase: "start" };
  try {
    if (!navigator.gpu) throw new Error("navigator.gpu missing");
    report.phase = "requestAdapter";
    const adapter = await Promise.race([
      navigator.gpu.requestAdapter(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("requestAdapter timeout")), 4000))
    ]);
    report.phase = "adapter";
    report.adapter = !!adapter;
  } catch (error) {
    report.error = String(error);
  }
  const node = document.createElement("script");
  node.id = "probe-report";
  node.type = "application/json";
  node.textContent = JSON.stringify(report);
  document.body.appendChild(node);
  document.title = report.error ? "probe-error" : "probe-ok";
}
run();
</script>`;

function extract(dom) {
  const match = dom.match(/<script id="probe-report" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!match) {
    throw new Error("probe report missing");
  }
  return JSON.parse(match[1]);
}

async function runChrome(url, extraArgs, label) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), `dus-probe-${label}-`));
  const args = [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-breakpad",
    "--allow-file-access-from-files",
    "--enable-unsafe-webgpu",
    "--disable-gpu-sandbox",
    "--ignore-gpu-blocklist",
    "--virtual-time-budget=7000",
    "--window-size=800,600",
    `--user-data-dir=${userDataDir}`,
    ...extraArgs,
    "--dump-dom",
    url
  ];

  const child = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });

  await fs.writeFile(path.join(ARTIFACTS, `probe-${label}.dom.html`), stdout);
  await fs.writeFile(path.join(ARTIFACTS, `probe-${label}.stderr.log`), stderr);
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  return { exitCode, report: extract(stdout) };
}

async function main() {
  await fs.mkdir(ARTIFACTS, { recursive: true });
  const probePath = path.join(ARTIFACTS, "adapter-probe.html");
  await fs.writeFile(probePath, probeHtml);
  const url = `file:///${probePath.replace(/\\/g, "/")}`;

  const hardware = await runChrome(url, [], "hardware");
  const swiftshader = await runChrome(url, ["--use-angle=swiftshader"], "swiftshader");

  const out = { hardware, swiftshader };
  const outPath = path.join(ARTIFACTS, "adapter-probe.json");
  await fs.writeFile(outPath, JSON.stringify(out, null, 2));
  console.log(outPath);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
