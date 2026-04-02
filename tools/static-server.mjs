import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const argMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--") && value) {
    argMap.set(key.slice(2), value);
  }
}

const root = path.resolve(argMap.get("root") ?? ".");
const host = argMap.get("host") ?? "127.0.0.1";
const port = Number(argMap.get("port") ?? 8000);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wgsl", "text/plain; charset=utf-8"],
  [".ts", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".css", "text/css; charset=utf-8"]
]);

function contentType(filePath) {
  return contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function safeJoin(rootPath, requestPath) {
  const normalized = decodeURIComponent(requestPath.split("?")[0] || "/");
  const target = normalized === "/" ? "/index.html" : normalized;
  const resolved = path.resolve(rootPath, `.${target}`);
  if (!resolved.toLowerCase().startsWith(rootPath.toLowerCase())) {
    return null;
  }
  return resolved;
}

const server = http.createServer(async (req, res) => {
  try {
    const filePath = safeJoin(root, req.url ?? "/");
    if (!filePath) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("Forbidden");
      return;
    }

    const bytes = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store"
    });
    res.end(bytes);
  } catch (error) {
    const status = error?.code === "ENOENT" ? 404 : 500;
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end(status === 404 ? "Not Found" : String(error?.message ?? error));
  }
});

server.listen(port, host, () => {
  console.log(`DUS static server listening on http://${host}:${port}/`);
});
