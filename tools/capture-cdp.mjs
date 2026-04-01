import { writeFileSync } from "node:fs";

const endpoint = process.argv[2];
const outputPath = process.argv[3];

if (!endpoint || !outputPath) {
  console.error("Usage: node capture-cdp.mjs <debug-endpoint> <output.png>");
  process.exit(1);
}

const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = targets.find((target) => target.type === "page");

if (!page?.webSocketDebuggerUrl) {
  throw new Error("No debuggable page target found.");
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  const message = JSON.stringify({ id, method, params });
  socket.send(message);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

socket.addEventListener("message", (event) => {
  const payload = JSON.parse(event.data.toString());
  if (!payload.id) return;
  const record = pending.get(payload.id);
  if (!record) return;
  pending.delete(payload.id);
  if (payload.error) {
    record.reject(new Error(payload.error.message));
    return;
  }
  record.resolve(payload.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

await send("Page.enable");
await send("Runtime.enable");
await send("Page.bringToFront");

for (let attempt = 0; attempt < 30; attempt += 1) {
  const result = await send("Runtime.evaluate", {
    expression: "Boolean(window.__DUS_READY__)",
    returnByValue: true
  });
  if (result?.result?.value) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

await new Promise((resolve) => setTimeout(resolve, 3000));

const screenshot = await send("Page.captureScreenshot", {
  format: "png",
  fromSurface: true
});

writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
socket.close();
