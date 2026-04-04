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
    demo: "knowledge",
    path: null,
    packetId: null,
    bundleId: null,
    font: "fallback",
    out: path.join(ROOT, "artifacts", "scripted-benchmark.json")
  };
  const state = {
    demoSet: false,
    pathSet: false,
    outSet: false
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--demo") {
      args.demo = argv[index + 1] ?? args.demo;
      state.demoSet = true;
      index += 1;
      continue;
    }
    if (value === "--path") {
      args.path = argv[index + 1] ?? args.path;
      state.pathSet = true;
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
      continue;
    }
    if (value === "--font") {
      args.font = argv[index + 1] ?? args.font;
      index += 1;
      continue;
    }
    if (value === "--out") {
      args.out = path.resolve(argv[index + 1] ?? args.out);
      state.outSet = true;
      index += 1;
      continue;
    }
    positional.push(value);
  }

  if (!state.pathSet && positional[0]) {
    if (positional[0].startsWith("/") || positional[0].includes(".html")) {
      args.path = positional[0];
      state.pathSet = true;
      positional.shift();
    }
  }

  if (!state.demoSet && positional[0]) {
    args.demo = positional[0];
    positional.shift();
  }

  if (!state.outSet && positional[0]) {
    args.out = path.resolve(positional[positional.length - 1]);
  }

  return args;
}

function buildRoute(args) {
  if (args.path) return args.path;
  const params = new URLSearchParams();
  params.set("demo", args.demo);
  if (args.packetId) params.set("packetId", args.packetId);
  if (args.bundleId) params.set("bundleId", args.bundleId);
  if (args.font) params.set("font", args.font);
  return `/index.html?${params.toString()}`;
}

function captureChildOutput(child) {
  const output = { stdout: "", stderr: "" };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    output.stdout += chunk;
    if (output.stdout.length > 64000) output.stdout = output.stdout.slice(-64000);
  });
  child.stderr?.on("data", (chunk) => {
    output.stderr += chunk;
    if (output.stderr.length > 64000) output.stderr = output.stderr.slice(-64000);
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
  return spawn(
    CHROME_PATH,
    [
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
      "--enable-webgpu-developer-features",
      "--window-size=1440,960",
      "about:blank"
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
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
      if (response.ok) return;
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
      if (!("id" in payload)) return;
      const record = this.pending.get(payload.id);
      if (!record) return;
      this.pending.delete(payload.id);
      if (payload.error) {
        record.reject(new Error(`${payload.error.message} (${payload.error.code})`));
        return;
      }
      record.resolve(payload.result);
    });
  }

  async send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("CDP socket is not open.");
    }
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async close() {
    if (!this.ws) return;
    await new Promise((resolve) => {
      this.ws.addEventListener("close", resolve, { once: true });
      this.ws.close();
    });
  }
}

async function waitForLoad(cdp, url) {
  let loaded = false;
  const onLoad = async () => {
    loaded = true;
  };
  cdp.ws.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.method === "Page.loadEventFired") onLoad();
  });

  await cdp.send("Page.navigate", { url });
  const deadline = Date.now() + 15000;
  while (!loaded && Date.now() < deadline) {
    await delay(50);
  }
  if (!loaded) throw new Error("Timed out waiting for page load.");
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

async function waitForReady(cdp, diagnostics) {
  const deadline = Date.now() + 20000;
  let lastState = null;
  while (Date.now() < deadline) {
    const state = await evaluateJson(
      cdp,
      "(() => ({ ready: !!window.__DUS_READY__, api: !!window.__DUS__, title: document.title, canvases: document.querySelectorAll('canvas').length }))()",
      false
    );
    lastState = state;
    if (state?.ready && state?.api) return;
    await delay(100);
  }
  const consoleTail = diagnostics.consoleMessages.slice(-5).map((entry) => `${entry.type}: ${entry.text}`).join("\n");
  const exceptionTail = diagnostics.exceptions.slice(-3).map((entry) => `${entry.text} @ ${entry.lineNumber}:${entry.columnNumber}`).join("\n");
  throw new Error(
    [
      "DUS automation API did not become ready.",
      lastState ? `Last state: ${JSON.stringify(lastState)}` : null,
      consoleTail ? `Console:\n${consoleTail}` : null,
      exceptionTail ? `Exceptions:\n${exceptionTail}` : null
    ].filter(Boolean).join("\n")
  );
}

async function runScriptedBenchmark(cdp) {
  return evaluateJson(
    cdp,
    `(() => (async () => {
      const api = window.__DUS__;
      if (!api) {
        throw new Error("window.__DUS__ is unavailable.");
      }
      api.clearBenchmark();
      api.setViewPreset("plain");
      const metadata = api.getSceneMetadata();
      const tasks = metadata?.tasks ?? [];
      const completed = [];
      for (const task of tasks) {
        api.runTask(task.id);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const targets = task.successNodeIds?.length ? task.successNodeIds : task.nodeIds ?? [];
        for (const nodeId of targets) {
          if (task.completionEvent === "focus") {
            api.focusNode(nodeId);
          } else {
            api.selectNode(nodeId, { frame: false });
          }
          await new Promise((resolve) => setTimeout(resolve, 34));
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        completed.push(api.getBenchmarkState().tasks.find((entry) => entry.id === task.id) ?? null);
      }
      return {
        metadata,
        benchmark: api.exportBenchmark(),
        completed
      };
    })())()`
  );
}

function formatProcessFailure(name, process, output, fallback) {
  const lines = [fallback];
  if (process.exitCode !== null) lines.push(`${name} exited early with code ${process.exitCode}.`);
  if (output.stderr?.trim()) lines.push(`${name} stderr: ${output.stderr.trim()}`);
  if (output.stdout?.trim()) lines.push(`${name} stdout: ${output.stdout.trim()}`);
  return new Error(lines.join(" "));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const route = buildRoute(args);
  const serverPort = await getFreePort();
  const origin = `http://${HOST}:${serverPort}`;
  const pageUrl = new URL(route, origin).toString();
  const server = spawnStaticServer(serverPort);
  const serverOutput = captureChildOutput(server);
  await waitForOk(`${origin}/index.html`, 15000);

  const debugPort = await getFreePort();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dus-scripted-benchmark-"));
  const chrome = spawnChrome(debugPort, userDataDir);
  const chromeOutput = captureChildOutput(chrome);

  let cdp = null;
  const diagnostics = {
    consoleMessages: [],
    exceptions: []
  };

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
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    cdp.ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.method === "Runtime.consoleAPICalled") {
        diagnostics.consoleMessages.push({
          type: payload.params.type,
          text: payload.params.args?.map((arg) => arg.value ?? arg.description ?? "").join(" ")
        });
      }
      if (payload.method === "Runtime.exceptionThrown") {
        diagnostics.exceptions.push({
          text: payload.params.exceptionDetails.text,
          lineNumber: payload.params.exceptionDetails.lineNumber,
          columnNumber: payload.params.exceptionDetails.columnNumber
        });
      }
      if (payload.method === "Log.entryAdded") {
        diagnostics.consoleMessages.push({
          type: payload.params.entry.level,
          text: payload.params.entry.text
        });
      }
    });
    await waitForLoad(cdp, pageUrl);
    await waitForReady(cdp, diagnostics);
    const result = await runScriptedBenchmark(cdp);
    const payload = {
      schemaId: "dus-scripted-benchmark-run",
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      pageUrl,
      result
    };
    await fs.mkdir(path.dirname(args.out), { recursive: true });
    await fs.writeFile(args.out, JSON.stringify(payload, null, 2));
    console.log(args.out);
  } finally {
    if (cdp) await cdp.close().catch(() => {});
    if (!server.killed) server.kill();
    if (!chrome.killed) chrome.kill();
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
