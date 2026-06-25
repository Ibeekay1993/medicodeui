import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const publicDir = resolve(root, "public");
const metaPath = resolve(publicDir, "build-meta.json");

mkdirSync(dirname(metaPath), { recursive: true });

const buildId = process.env.BUILD_ID || new Date().toISOString();
const payload = {
  buildId,
  generatedAt: new Date().toISOString(),
};

writeFileSync(metaPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

