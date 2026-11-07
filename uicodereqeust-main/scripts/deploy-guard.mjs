// Release validation for Git-based Coolify deployments.
// This script deliberately does not SSH to the VPS or modify a running container.
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const run = (command) => execSync(command, { cwd: ROOT, stdio: "inherit" });

console.log("\n[Release] Running production checks...");
try {
  run("npm run typecheck");
  run("npm run lint");
  run("npm test -- --run");
  run("npm run build");
} catch {
  console.error("\n[Release] Checks failed. No deployment was requested.");
  process.exit(1);
}

const webhook = process.env.COOLIFY_DEPLOY_WEBHOOK_URL?.trim();
if (!webhook) {
  console.log("\n[Release] Build and checks passed.");
  console.log("[Release] COOLIFY_DEPLOY_WEBHOOK_URL is not configured.");
  console.log("[Release] Deploy this commit through the Coolify Git integration.");
  process.exit(0);
}

const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
if (branch !== "main") {
  console.error(`[Release] Refusing production webhook from branch '${branch}'. Merge to main first.`);
  process.exit(1);
}

console.log("\n[Release] Triggering the configured Coolify deployment...");
const response = await fetch(webhook, { method: "POST" });
if (!response.ok) {
  console.error(`[Release] Coolify webhook returned HTTP ${response.status}. Check Coolify deployment logs.`);
  process.exit(1);
}
console.log("[Release] Coolify accepted the deployment trigger. Verify the deployment in Coolify and check build-meta.json.");
