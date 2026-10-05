import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const publicDir = resolve(root, "public");
const metaPath = resolve(publicDir, "build-meta.json");

mkdirSync(dirname(metaPath), { recursive: true });

import { execSync } from "node:child_process";

let gitCommit = "unknown";
let gitBranch = "unknown";
try {
  gitCommit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {}

const buildId = process.env.BUILD_ID || `${new Date().toISOString()}_${gitCommit}`;
const payload = {
  buildId,
  gitCommit,
  gitBranch,
  generatedAt: new Date().toISOString(),
};

writeFileSync(metaPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

