import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "artifacts", "validation-report.json");
const ALLOWED_WARNINGS = new Set([
  "The powerPreference option is currently ignored when calling requestAdapter() on Windows. See https://crbug.com/369219127"
]);

function fail(message) {
  throw new Error(message);
}

function summarizeMessages(messages, type) {
  return messages
    .filter((message) => message.type === type)
    .map((message) => message.text);
}

async function main() {
  const raw = await fs.readFile(REPORT_PATH, "utf8").catch(() => null);
  if (!raw) {
    fail(`Validation report was not found at ${REPORT_PATH}. Run the browser validation first.`);
  }

  const report = JSON.parse(raw);
  const errors = summarizeMessages(report.consoleMessages ?? [], "error");
  const warnings = summarizeMessages(report.consoleMessages ?? [], "warning")
    .filter((text) => !ALLOWED_WARNINGS.has(text));

  if (!report.gpuReport?.navigatorGpu) fail("navigator.gpu was unavailable.");
  if (!report.gpuReport?.adapter) fail("WebGPU adapter was unavailable.");
  if ((report.gpuReport?.compilationMessages ?? []).some((message) => message.type === "error")) {
    fail("Shader compilation still reports WGSL errors.");
  }
  if (report.gpuReport?.validationError) fail(`WebGPU validation error: ${report.gpuReport.validationError}`);
  if ((report.exceptions ?? []).length > 0) fail(`Runtime exceptions observed: ${JSON.stringify(report.exceptions[0])}`);
  if (errors.length > 0) fail(`Console errors observed: ${errors.join(" | ")}`);
  if (warnings.length > 0) fail(`Unexpected console warnings observed: ${warnings.join(" | ")}`);
  if (report.stress?.error) fail(`Stress interaction failed: ${report.stress.error}`);
  if ((report.stress?.fps ?? 0) < 55) fail(`Stress FPS dropped too low: ${report.stress?.fps ?? 0}`);
  if ((report.deltas?.layout ?? 0) > 1000) fail(`DOM layout churn is still too high: ${report.deltas.layout}`);
  if ((report.deltas?.recalcStyle ?? 0) > 1000) fail(`DOM style recalculation churn is still too high: ${report.deltas.recalcStyle}`);
  if ((report.deltas?.nodes ?? 0) > 250) fail(`DOM node churn is still too high: ${report.deltas.nodes}`);

  console.log(JSON.stringify({
    fps: Number((report.stress?.fps ?? 0).toFixed(2)),
    layoutDelta: report.deltas?.layout ?? 0,
    recalcStyleDelta: report.deltas?.recalcStyle ?? 0,
    nodeDelta: report.deltas?.nodes ?? 0,
    heapRange: report.heap?.range ?? 0
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
