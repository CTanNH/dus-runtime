import path from "node:path";
import os from "node:os";
import net from "node:net";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = process.cwd();
const HOST = "127.0.0.1";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const NODE_EXE = process.execPath;
const SERVER_SCRIPT = path.join(ROOT, "tools", "static-server.mjs");

function parseArgs(argv) {
  const args = {
    path: "/index.html"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--path") {
      args.path = argv[index + 1] ?? args.path;
      index += 1;
    } else if (!value.startsWith("--")) {
      args.path = value;
    }
  }

  return args;
}

function captureChildOutput(child) {
  const output = { stdout: "", stderr: "" };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    output.stdout += chunk;
    if (output.stdout.length > 64000) {
      output.stdout = output.stdout.slice(-64000);
    }
  });
  child.stderr?.on("data", (chunk) => {
    output.stderr += chunk;
    if (output.stderr.length > 64000) {
      output.stderr = output.stderr.slice(-64000);
    }
  });
  return output;
}

async function getFreePort(host = HOST) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function spawnStaticServer(port) {
  return spawn(
    NODE_EXE,
    [
      SERVER_SCRIPT,
      "--root",
      ROOT,
      "--host",
      HOST,
      "--port",
      String(port)
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
}

function spawnChrome(debugPort, userDataDir) {
  const args = [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-component-update",
    "--disable-features=CalculateNativeWinOcclusion",
    "--disable-renderer-backgrounding",
    "--enable-precise-memory-info",
    "--enable-webgpu-developer-features",
    "--window-size=1440,960",
    "about:blank"
  ];

  return spawn(CHROME_PATH, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function waitForOk(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

class CDPClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.listeners = new Map();
    this.ws = null;
  }

  async connect() {
    this.ws = new WebSocket(this.webSocketUrl);

    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if ("id" in payload) {
        const record = this.pending.get(payload.id);
        if (!record) {
          return;
        }
        this.pending.delete(payload.id);
        if (payload.error) {
          record.reject(new Error(`${payload.error.message} (${payload.error.code})`));
        } else {
          record.resolve(payload.result);
        }
        return;
      }

      this.events.push(payload);
      const listeners = this.listeners.get(payload.method);
      if (!listeners) {
        return;
      }
      for (const listener of listeners) {
        listener(payload.params);
      }
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  async send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("CDP socket is not open.");
    }
    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });
    const response = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.ws.send(message);
    return response;
  }

  async close() {
    if (!this.ws) {
      return;
    }
    await new Promise((resolve) => {
      this.ws.addEventListener("close", resolve, { once: true });
      this.ws.close();
    });
  }
}

function metricsArrayToObject(metrics) {
  const result = {};
  for (const entry of metrics) {
    result[entry.name] = entry.value;
  }
  return result;
}

async function waitForLoad(cdp, url) {
  let loaded = false;
  cdp.on("Page.loadEventFired", () => {
    loaded = true;
  });

  await cdp.send("Page.navigate", { url });

  const deadline = Date.now() + 15000;
  while (!loaded && Date.now() < deadline) {
    await delay(50);
  }

  if (!loaded) {
    throw new Error("Timed out waiting for page load.");
  }
}

async function waitForCanvas(cdp) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "document.querySelectorAll('canvas').length",
      returnByValue: true,
      awaitPromise: false
    });
    if (result.result.value === 1) {
      return;
    }
    await delay(100);
  }
  throw new Error("Canvas was not created by the page.");
}

async function waitForAppReady(cdp) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const state = await cdp.send("Runtime.evaluate", {
      expression: `(() => ({
        ready: !!window.__DUS_READY__,
        hasCanvas: document.querySelectorAll("canvas").length,
        title: document.title
      }))()`,
      returnByValue: true,
      awaitPromise: false
    });

    if (state.result.value?.ready) {
      return state.result.value;
    }
    await delay(100);
  }

  throw new Error("DUS app did not reach ready state.");
}

async function evaluateJson(cdp, expression, awaitPromise = true) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  }

  return result.result.value;
}

async function captureScreenshot(cdp, filePath) {
  const response = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true
  });
  await fs.writeFile(filePath, Buffer.from(response.data, "base64"));
}

function formatProcessFailure(name, process, output, fallback) {
  const lines = [fallback];
  if (process.exitCode !== null) {
    lines.push(`${name} exited early with code ${process.exitCode}.`);
  }
  if (output.stderr?.trim()) {
    lines.push(`${name} stderr: ${output.stderr.trim()}`);
  }
  if (output.stdout?.trim()) {
    lines.push(`${name} stdout: ${output.stdout.trim()}`);
  }
  return new Error(lines.join(" "));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifactsDir = path.join(ROOT, "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const reportPath = path.join(artifactsDir, "validation-report.json");
  await fs.rm(reportPath, { force: true }).catch(() => {});

  const serverPort = await getFreePort();
  const origin = `http://${HOST}:${serverPort}`;
  const server = spawnStaticServer(serverPort);
  const serverOutput = captureChildOutput(server);
  await waitForOk(`${origin}/index.html`, 15000);

  const debugPort = await getFreePort();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dus-chrome-"));
  const chrome = spawnChrome(debugPort, userDataDir);
  const chromeOutput = captureChildOutput(chrome);

  const consoleMessages = [];
  const exceptions = [];
  let cdp = null;

  try {
    let targets;
    try {
      targets = await waitForJson(`http://${HOST}:${debugPort}/json/list`, 20000);
    } catch (error) {
      if (chrome.exitCode !== null) {
        throw formatProcessFailure("Chrome", chrome, chromeOutput, `Failed to connect to Chrome debug endpoint on port ${debugPort}.`);
      }
      throw error;
    }
    const pageTarget = targets.find((target) => target.type === "page");
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error("No debuggable page target was exposed by Chrome.");
    }

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    cdp.on("Runtime.consoleAPICalled", (params) => {
      consoleMessages.push({
        type: params.type,
        text: params.args?.map((arg) => arg.value ?? arg.description ?? "").join(" "),
        stack: params.stackTrace?.callFrames ?? []
      });
    });

    cdp.on("Runtime.exceptionThrown", (params) => {
      exceptions.push({
        text: params.exceptionDetails.text,
        lineNumber: params.exceptionDetails.lineNumber,
        columnNumber: params.exceptionDetails.columnNumber,
        stack: params.exceptionDetails.stackTrace?.callFrames ?? []
      });
    });

    cdp.on("Log.entryAdded", (params) => {
      consoleMessages.push({
        type: params.entry.level,
        text: params.entry.text,
        source: params.entry.source
      });
    });

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Performance.enable");
    await cdp.send("DOM.enable");

    const pageUrl = new URL(args.path, origin).toString();
    await waitForLoad(cdp, pageUrl);
    await waitForCanvas(cdp);
    await waitForAppReady(cdp);
    await delay(1000);

    const gpuReport = await evaluateJson(
      cdp,
      `(() => (async () => {
        const report = {
          navigatorGpu: !!navigator.gpu,
          canvasCount: document.querySelectorAll("canvas").length
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
        const shaderCode = await fetch("./src/dus.wgsl").then((response) => response.text());
        const shaderModule = device.createShaderModule({ code: shaderCode });
        const compilationInfo = await shaderModule.getCompilationInfo();
        report.compilationMessages = compilationInfo.messages.map((message) => ({
          type: message.type,
          lineNum: message.lineNum,
          linePos: message.linePos,
          offset: message.offset,
          length: message.length,
          message: message.message
        }));
        device.pushErrorScope("validation");
        try {
          const uniformLayout = device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }]
          });
          const textureLayout = device.createBindGroupLayout({
            entries: [
              { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
              { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } }
            ]
          });
          const panelVertexLayout = {
            arrayStride: 64,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x4" },
              { shaderLocation: 1, offset: 16, format: "float32x4" },
              { shaderLocation: 2, offset: 32, format: "float32x4" },
              { shaderLocation: 3, offset: 48, format: "float32x4" }
            ]
          };
          const contentVertexLayout = panelVertexLayout;
          device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [uniformLayout] }),
            vertex: { module: shaderModule, entryPoint: "vs_panel_current", buffers: [panelVertexLayout] },
            fragment: {
              module: shaderModule,
              entryPoint: "fs_panel",
              targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
            },
            primitive: { topology: "triangle-list" }
          });
          device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [uniformLayout, textureLayout] }),
            vertex: { module: shaderModule, entryPoint: "vs_text", buffers: [contentVertexLayout] },
            fragment: {
              module: shaderModule,
              entryPoint: "fs_text",
              targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
            },
            primitive: { topology: "triangle-list" }
          });
        } catch (error) {
          report.pipelineThrow = String(error);
        }
        const validationError = await device.popErrorScope();
        report.validationError = validationError ? validationError.message : null;
        report.userAgent = navigator.userAgent;
        return report;
      })())()`
    );

    await captureScreenshot(cdp, path.join(artifactsDir, "dus-rest.png"));

    const baselineMetrics = metricsArrayToObject((await cdp.send("Performance.getMetrics")).metrics);

    await evaluateJson(
      cdp,
      `(() => {
        window.__dusValidation = {
          done: false,
          frameSamples: [],
          error: null
        };
        const run = async () => {
          try {
            const canvas = document.querySelector("canvas");
            if (!canvas) {
              throw new Error("Canvas missing");
            }
            canvas.focus?.();
            const rect = canvas.getBoundingClientRect();
            const durationMs = 5000;
            const start = performance.now();
            const centerX = rect.left + rect.width * 0.5;
            const centerY = rect.top + rect.height * 0.5;

            const sampleFrames = (windowMs) => new Promise((resolve) => {
              const frames = [];
              const t0 = performance.now();
              const tick = (now) => {
                frames.push(now);
                if (now - t0 >= windowMs) {
                  resolve(frames);
                  return;
                }
                requestAnimationFrame(tick);
              };
              requestAnimationFrame(tick);
            });

            const emit = (type, clientX, clientY) => {
              canvas.dispatchEvent(new PointerEvent(type, {
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true,
                clientX,
                clientY,
                buttons: type === "pointermove" ? 0 : 1,
                pressure: type === "pointermove" ? 0.5 : 1.0,
                bubbles: false
              }));
            };

            const rafRecorder = (async () => {
              const frames = await sampleFrames(durationMs);
              const intervals = [];
              for (let i = 1; i < frames.length; i += 1) {
                intervals.push(frames[i] - frames[i - 1]);
              }
              window.__dusValidation.frameSamples = intervals;
            })();

            let waveTriggered = false;
            let shearCaptured = false;
            let waveCaptured = false;

            while (performance.now() - start < durationMs) {
              const t = (performance.now() - start) * 0.001;
              const x = centerX + Math.cos(t * 3.9) * rect.width * 0.23 + Math.sin(t * 10.7) * rect.width * 0.07;
              const y = centerY + Math.sin(t * 5.1) * rect.height * 0.14 + Math.cos(t * 8.3) * rect.height * 0.05;
              emit("pointermove", x, y);

              if (!waveTriggered && t > 1.3) {
                emit("pointerdown", x, y);
                emit("pointerup", x, y);
                waveTriggered = true;
              }

              if (t > 0.9 && !shearCaptured) {
                window.__dusValidation.shearReady = true;
                shearCaptured = true;
              }

              if (t > 1.45 && !waveCaptured) {
                window.__dusValidation.waveReady = true;
                waveCaptured = true;
              }

              await new Promise((resolve) => requestAnimationFrame(resolve));
            }

            emit("pointerleave", centerX, centerY);
            await rafRecorder;
            window.__dusValidation.done = true;
          } catch (error) {
            window.__dusValidation.error = String(error);
            window.__dusValidation.done = true;
          }
        };
        run();
        return true;
      })()`
    );

    const metricSamples = [];
    let shearShot = false;
    let waveShot = false;
    let stressState = { done: false, frameSamples: [], error: null };

    while (!stressState.done) {
      metricSamples.push({
        t: Date.now(),
        metrics: metricsArrayToObject((await cdp.send("Performance.getMetrics")).metrics)
      });

      const state = await evaluateJson(
        cdp,
        `(() => ({
          done: !!window.__dusValidation?.done,
          error: window.__dusValidation?.error ?? null,
          shearReady: !!window.__dusValidation?.shearReady,
          waveReady: !!window.__dusValidation?.waveReady,
          frameSamples: window.__dusValidation?.frameSamples ?? []
        }))()`
      );

      if (state.shearReady && !shearShot) {
        await captureScreenshot(cdp, path.join(artifactsDir, "dus-shear.png"));
        shearShot = true;
      }

      if (state.waveReady && !waveShot) {
        await captureScreenshot(cdp, path.join(artifactsDir, "dus-wave.png"));
        waveShot = true;
      }

      stressState = state;
      await delay(100);
    }

    const finalMetrics = metricsArrayToObject((await cdp.send("Performance.getMetrics")).metrics);

    const heapSeries = metricSamples
      .map((sample, index) => ({
        index,
        heap: sample.metrics.JSHeapUsedSize ?? 0
      }))
      .filter((sample) => sample.heap > 0);
    const nodeSeries = metricSamples
      .map((sample, index) => ({
        index,
        nodes: sample.metrics.Nodes ?? 0
      }))
      .filter((sample) => sample.nodes > 0);

    const heapValues = heapSeries.map((sample) => sample.heap);
    const heapMin = heapValues.length > 0 ? Math.min(...heapValues) : 0;
    const heapMax = heapValues.length > 0 ? Math.max(...heapValues) : 0;
    const heapRange = heapMax - heapMin;
    const nodeValues = nodeSeries.map((sample) => sample.nodes);
    const nodeMin = nodeValues.length > 0 ? Math.min(...nodeValues) : 0;
    const nodeMax = nodeValues.length > 0 ? Math.max(...nodeValues) : 0;
    const steadyNodeSeries = nodeSeries.slice(Math.max(0, Math.floor(nodeSeries.length * 0.2)));
    const steadyNodeValues = steadyNodeSeries.map((sample) => sample.nodes);
    const steadyNodeMin = steadyNodeValues.length > 0 ? Math.min(...steadyNodeValues) : 0;
    const steadyNodeMax = steadyNodeValues.length > 0 ? Math.max(...steadyNodeValues) : 0;
    const steadyNodeRange = steadyNodeMax - steadyNodeMin;
    const steadyNodeDrift = steadyNodeValues.length > 0
      ? Math.abs(steadyNodeValues[steadyNodeValues.length - 1] - steadyNodeValues[0])
      : 0;

    let gcDrops = 0;
    for (let i = 1; i < heapSeries.length; i += 1) {
      const delta = heapSeries[i].heap - heapSeries[i - 1].heap;
      if (delta < -256 * 1024) {
        gcDrops += 1;
      }
    }

    const frameSamples = stressState.frameSamples ?? [];
    const averageInterval = frameSamples.length > 0
      ? frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length
      : 0;
    const fps = averageInterval > 0 ? 1000 / averageInterval : 0;

    const report = {
      origin,
      pageUrl,
      generatedAt: new Date().toISOString(),
      chromePath: CHROME_PATH,
      gpuReport,
      consoleMessages,
      exceptions,
      baselineMetrics,
      finalMetrics,
      metricSamples: metricSamples.length,
      heap: {
        min: heapMin,
        max: heapMax,
        range: heapRange,
        gcDrops
      },
      nodes: {
        min: nodeMin,
        max: nodeMax,
        range: nodeMax - nodeMin,
        steadyMin: steadyNodeMin,
        steadyMax: steadyNodeMax,
        steadyRange: steadyNodeRange,
        steadyDrift: steadyNodeDrift
      },
      deltas: {
        layout: (finalMetrics.LayoutCount ?? 0) - (baselineMetrics.LayoutCount ?? 0),
        recalcStyle: (finalMetrics.RecalcStyleCount ?? 0) - (baselineMetrics.RecalcStyleCount ?? 0),
        nodes: (finalMetrics.Nodes ?? 0) - (baselineMetrics.Nodes ?? 0)
      },
      stress: {
        error: stressState.error,
        frameIntervals: frameSamples.length,
        fps
      },
      screenshots: {
        rest: path.join(artifactsDir, "dus-rest.png"),
        shear: path.join(artifactsDir, "dus-shear.png"),
        wave: path.join(artifactsDir, "dus-wave.png")
      }
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(reportPath);
  } finally {
    if (cdp) {
      await cdp.close().catch(() => {});
    }

    if (!server.killed) {
      server.kill();
    }

    if (!chrome.killed) {
      chrome.kill();
    }

    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});

    if (server.exitCode !== null && server.exitCode !== 0) {
      console.error(formatProcessFailure("Static server", server, serverOutput, "Static server exited unexpectedly.").message);
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
