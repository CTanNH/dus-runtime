import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS = path.join(ROOT, "artifacts");

function instrumentMainSource(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  return normalized
    .replace(
      'const arena = new Float32Array(ARENA_FLOATS);',
      'const arena = new Float32Array(ARENA_FLOATS);\nwindow.__DUS_ARENA__ = arena;'
    )
    .replace(
      'async function loadShaderSource() {\n  const response = await fetch(new URL("./dus.wgsl", import.meta.url));\n  if (!response.ok) {\n    throw new Error(`Shader load failed: ${response.status} ${response.statusText}`);\n  }\n  return response.text();\n}',
      'async function loadShaderSource() {\n  return window.__DUS_SHADER_SOURCE__;\n}'
    )
    .replace(
      "  seedArena();",
      '  seedArena();\n  window.__DUS_PHASE__ = "seeded";'
    )
    .replace(
      "  const gpu = navigator.gpu;",
      '  const gpu = navigator.gpu;\n  window.__DUS_PHASE__ = gpu ? "gpu-mounted" : "gpu-missing";'
    )
    .replace(
      "  const adapter = await gpu.requestAdapter();",
      '  window.__DUS_PHASE__ = "request-adapter";\n  const adapter = await gpu.requestAdapter();\n  window.__DUS_PHASE__ = "adapter";'
    )
    .replace(
      "  const device = await adapter.requestDevice();",
      '  window.__DUS_PHASE__ = "request-device";\n  const device = await adapter.requestDevice();\n  window.__DUS_PHASE__ = "device";'
    )
    .replace(
      '  const context = canvas.getContext("webgpu");',
      '  const context = canvas.getContext("webgpu");\n  window.__DUS_PHASE__ = context ? "context" : "context-missing";'
    )
    .replace(
      "  const shaderSource = await loadShaderSource();",
      '  const shaderSource = await loadShaderSource();\n  window.__DUS_PHASE__ = "shader-source";'
    )
    .replace(
      "  const shaderModule = device.createShaderModule({ code: shaderSource });",
      '  const shaderModule = device.createShaderModule({ code: shaderSource });\n  window.__DUS_PHASE__ = "shader-module";'
    )
    .replace(
      "  const pipeline = device.createRenderPipeline({",
      '  window.__DUS_PHASE__ = "pipeline-build";\n  const pipeline = device.createRenderPipeline({'
    )
    .replace(
      "  const bindGroup = device.createBindGroup({",
      '  window.__DUS_PHASE__ = "pipeline";\n  const bindGroup = device.createBindGroup({'
    )
    .replace(
      "  resize();",
      '  resize();\n  window.__DUS_PHASE__ = "configured";'
    )
    .replace(
      '  const canvas = document.createElement("canvas");',
      '  const canvas = document.createElement("canvas");\n  window.__DUS_CANVAS__ = canvas;'
    )
    .replace(
      '  requestAnimationFrame(frame);\n}',
      '  window.__DUS_READY__ = true;\n  requestAnimationFrame(frame);\n}'
    )
    .replace(
      'void main().catch((error) => {\n  console.error(error);\n  throw error;\n});',
      'void main().catch((error) => {\n  window.__DUS_ERROR__ = { message: String(error), stack: error && error.stack ? error.stack : "" };\n  console.error("DUS_BOOT_ERROR", window.__DUS_ERROR__);\n  throw error;\n});'
    );
}

function buildHarness(mainSource, shaderSource) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DUS Validation</title>
  <script>
    window.__DUS_SHADER_SOURCE__ = ${JSON.stringify(shaderSource)};
    window.__DUS_MODE__ = new URL(location.href).searchParams.get("mode") || "report";
  </script>
  <script>
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

    function writeReport(report) {
      const node = document.createElement("script");
      node.id = "dus-report";
      node.type = "application/json";
      node.textContent = JSON.stringify(report);
      document.body.appendChild(node);
      document.title = report.status || "done";
    }

    async function waitForBoot(timeoutMs) {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        if (window.__DUS_READY__) {
          return true;
        }
        if (window.__DUS_ERROR__) {
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("Timed out waiting for DUS boot.");
    }

    async function compileReport() {
      const report = {
        navigatorGpu: !!navigator.gpu,
        compilationMessages: [],
        validationError: null,
        pipelineThrow: null
      };

      if (!navigator.gpu) {
        return report;
      }

      const adapter = await navigator.gpu.requestAdapter();
      report.adapter = !!adapter;
      if (!adapter) {
        return report;
      }

      const device = await adapter.requestDevice();
      const shaderModule = device.createShaderModule({ code: window.__DUS_SHADER_SOURCE__ });
      const compilation = await shaderModule.getCompilationInfo();
      report.compilationMessages = compilation.messages.map((message) => ({
        type: message.type,
        lineNum: message.lineNum,
        linePos: message.linePos,
        message: message.message
      }));

      device.pushErrorScope("validation");
      try {
        const bindGroupLayout = device.createBindGroupLayout({
          entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }]
        });
        const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
        device.createRenderPipeline({
          layout: pipelineLayout,
          vertex: { module: shaderModule, entryPoint: "vs_main" },
          fragment: {
            module: shaderModule,
            entryPoint: "fs_main",
            targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
          },
          primitive: { topology: "triangle-list" }
        });
      } catch (error) {
        report.pipelineThrow = String(error);
      }
      const validationError = await device.popErrorScope();
      report.validationError = validationError ? validationError.message : null;
      return report;
    }

    function dispatchPointer(canvas, type, x, y, buttons, pressure) {
      canvas.dispatchEvent(new PointerEvent(type, {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        clientX: x,
        clientY: y,
        buttons,
        pressure,
        bubbles: false
      }));
    }

    async function stressCanvas(mode) {
      const canvas = window.__DUS_CANVAS__;
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.left + rect.width * 0.5;
      const centerY = rect.top + rect.height * 0.5;

      const pointerPath = (t) => ({
        x: centerX + Math.cos(t * 3.9) * rect.width * 0.23 + Math.sin(t * 10.7) * rect.width * 0.07,
        y: centerY + Math.sin(t * 5.1) * rect.height * 0.14 + Math.cos(t * 8.3) * rect.height * 0.05
      });

      if (mode === "rest") {
        for (let i = 0; i < 90; i += 1) {
          await nextFrame();
        }
        return;
      }

      const durationMs = mode === "report" ? 5000 : 2500;
      const start = performance.now();
      let clicked = false;

      while (performance.now() - start < durationMs) {
        const t = (performance.now() - start) * 0.001;
        const point = pointerPath(t);
        dispatchPointer(canvas, "pointermove", point.x, point.y, 1, 0.6);

        if ((mode === "report" || mode === "wave") && !clicked && t > 1.15) {
          dispatchPointer(canvas, "pointerdown", point.x, point.y, 1, 1.0);
          dispatchPointer(canvas, "pointerup", point.x, point.y, 0, 0.0);
          clicked = true;
        }

        await nextFrame();
      }

      dispatchPointer(canvas, "pointerleave", centerX, centerY, 0, 0.0);
    }

    async function collectReport() {
      const mode = window.__DUS_MODE__;
      const mutationObserver = new MutationObserver(() => {
        window.__DUS_MUTATIONS__ = (window.__DUS_MUTATIONS__ || 0) + 1;
      });

      const layoutShifts = [];
      let layoutObserver = null;
      if ("PerformanceObserver" in window) {
        layoutObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            layoutShifts.push(entry.value || 0);
          }
        });
        try {
          layoutObserver.observe({ type: "layout-shift", buffered: true });
        } catch (error) {
          layoutObserver = null;
        }
      }

      try {
        const booted = await waitForBoot(4000);
        const compile = await compileReport();

        if (!booted) {
          mutationObserver.disconnect();
          layoutObserver?.disconnect();
          writeReport({
            status: "boot-error",
            bootError: window.__DUS_ERROR__,
            phase: window.__DUS_PHASE__ || null,
            navigatorGpu: !!navigator.gpu,
            compile
          });
          return;
        }

        if (mode !== "report") {
          await stressCanvas(mode);
          document.title = mode;
          return;
        }

        const canvas = window.__DUS_CANVAS__;
        mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

        const heapSamples = [];
        const frameIntervals = [];
        let lastFrame = null;
        let sampling = true;

        const sampleLoop = async () => {
          while (sampling) {
            if (performance.memory && typeof performance.memory.usedJSHeapSize === "number") {
              heapSamples.push(performance.memory.usedJSHeapSize);
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        };

        const frameLoop = (now) => {
          if (lastFrame !== null) {
            frameIntervals.push(now - lastFrame);
          }
          lastFrame = now;
          if (sampling) {
            requestAnimationFrame(frameLoop);
          }
        };

        requestAnimationFrame(frameLoop);
        const sampler = sampleLoop();
        await stressCanvas("report");
        sampling = false;
        await sampler;

        const heapMin = heapSamples.length ? Math.min(...heapSamples) : 0;
        const heapMax = heapSamples.length ? Math.max(...heapSamples) : 0;
        let gcDrops = 0;
        for (let i = 1; i < heapSamples.length; i += 1) {
          if (heapSamples[i] - heapSamples[i - 1] < -262144) {
            gcDrops += 1;
          }
        }

        const avgFrame = frameIntervals.length
          ? frameIntervals.reduce((sum, value) => sum + value, 0) / frameIntervals.length
          : 0;
        const fps = avgFrame > 0 ? 1000 / avgFrame : 0;

        mutationObserver.disconnect();
        layoutObserver?.disconnect();
        writeReport({
          status: "ok",
          compile,
          dom: {
            canvasCount: document.querySelectorAll("canvas").length,
            nodeCount: document.getElementsByTagName("*").length,
            mutationsDuringStress: window.__DUS_MUTATIONS__ || 0,
            layoutShiftTotal: layoutShifts.reduce((sum, value) => sum + value, 0)
          },
          memory: {
            samples: heapSamples.length,
            min: heapMin,
            max: heapMax,
            range: heapMax - heapMin,
            gcDrops
          },
          stress: {
            frameSamples: frameIntervals.length,
            fps
          },
          bootError: window.__DUS_ERROR__ || null
        });
      } catch (error) {
        mutationObserver.disconnect();
        layoutObserver?.disconnect();
        writeReport({
          status: "harness-error",
          error: String(error),
          stack: error && error.stack ? error.stack : "",
          phase: window.__DUS_PHASE__ || null,
          navigatorGpu: !!navigator.gpu,
          bootError: window.__DUS_ERROR__ || null
        });
      }
    }

    collectReport();
  </script>
</head>
<body>
  <script>
${mainSource}
  </script>
</body>
</html>`;
}

function spawnChrome(args) {
  return spawn(CHROME_PATH, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
}

async function runChrome(url, extraArgs = []) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dus-headless-"));
  const args = [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-breakpad",
    "--disable-features=CalculateNativeWinOcclusion",
    "--allow-file-access-from-files",
    "--enable-precise-memory-info",
    "--enable-webgpu-developer-features",
    "--enable-unsafe-webgpu",
    "--ignore-gpu-blocklist",
    "--run-all-compositor-stages-before-draw",
    "--window-size=1440,960",
    `--user-data-dir=${userDataDir}`,
    ...extraArgs,
    url
  ];

  const child = spawnChrome(args);
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });

  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  return { exitCode, stdout, stderr };
}

function extractReport(dom) {
  const match = dom.match(/<script id="dus-report" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!match) {
    throw new Error("Validation report was not found in dumped DOM.");
  }
  return JSON.parse(match[1]);
}

async function main() {
  await fs.mkdir(ARTIFACTS, { recursive: true });

  const mainSource = instrumentMainSource(await fs.readFile(path.join(ROOT, "src", "main.js"), "utf8"));
  const shaderSource = await fs.readFile(path.join(ROOT, "src", "dus.wgsl"), "utf8");
  const harness = buildHarness(mainSource, shaderSource);
  const harnessPath = path.join(ARTIFACTS, "validate-harness.html");
  await fs.writeFile(harnessPath, harness);

  const baseUrl = `file:///${harnessPath.replace(/\\/g, "/")}`;

  const reportRun = await runChrome(`${baseUrl}?mode=report`, [
    "--virtual-time-budget=15000",
    "--dump-dom"
  ]);

  await fs.writeFile(path.join(ARTIFACTS, "report-dom.html"), reportRun.stdout);
  await fs.writeFile(path.join(ARTIFACTS, "report-stderr.log"), reportRun.stderr);

  if (reportRun.exitCode !== 0) {
    throw new Error(`Chrome report run failed with exit code ${reportRun.exitCode}`);
  }

  const report = extractReport(reportRun.stdout);

  const shotModes = [
    { mode: "rest", file: path.join(ARTIFACTS, "dus-rest.png"), budget: 3000 },
    { mode: "shear", file: path.join(ARTIFACTS, "dus-shear.png"), budget: 3500 },
    { mode: "wave", file: path.join(ARTIFACTS, "dus-wave.png"), budget: 4000 }
  ];

  for (const shot of shotModes) {
    const run = await runChrome(`${baseUrl}?mode=${shot.mode}`, [
      `--virtual-time-budget=${shot.budget}`,
      `--screenshot=${shot.file}`
    ]);
    await fs.writeFile(path.join(ARTIFACTS, `${shot.mode}-stderr.log`), run.stderr);
    if (run.exitCode !== 0) {
      throw new Error(`Chrome screenshot run for ${shot.mode} failed with exit code ${run.exitCode}`);
    }
  }

  const output = {
    report,
    screenshots: {
      rest: path.join(ARTIFACTS, "dus-rest.png"),
      shear: path.join(ARTIFACTS, "dus-shear.png"),
      wave: path.join(ARTIFACTS, "dus-wave.png")
    },
    logs: {
      report: path.join(ARTIFACTS, "report-stderr.log"),
      rest: path.join(ARTIFACTS, "rest-stderr.log"),
      shear: path.join(ARTIFACTS, "shear-stderr.log"),
      wave: path.join(ARTIFACTS, "wave-stderr.log")
    }
  };

  const reportPath = path.join(ARTIFACTS, "headless-validation.json");
  await fs.writeFile(reportPath, JSON.stringify(output, null, 2));
  console.log(reportPath);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
