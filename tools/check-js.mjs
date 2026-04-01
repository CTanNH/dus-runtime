import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, out);
      continue;
    }
    if (fullPath.endsWith(".js") || fullPath.endsWith(".mjs")) {
      out.push(fullPath);
    }
  }
  return out;
}

const files = [
  ...walk("src"),
  ...walk("tools")
];

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

console.log(`Validated ${files.length} JavaScript files.`);
