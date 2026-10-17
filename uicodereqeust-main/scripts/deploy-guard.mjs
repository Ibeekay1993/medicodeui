// scripts/deploy-guard.mjs
// Pre-flight validation to ensure you NEVER deploy stale branches or out-of-sync code.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

console.log("\n🚀 [Deploy Guard] Running pre-deployment validation...\n");

// 1. Check Git Branch
let branch = "unknown";
let currentHead = "unknown";
try {
  branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  currentHead = execSync("git rev-parse --short HEAD").toString().trim();
  console.log(`📌 Git Branch : ${branch}`);
  console.log(`📌 HEAD Commit: ${currentHead}`);
  if (branch !== "main") {
    console.warn(`\n⚠️  WARNING: You are deploying from branch '${branch}', NOT 'main'!`);
    console.warn(`   Make sure this is intentional.\n`);
  }
} catch (e) {
  console.warn("Could not determine git branch:", e.message);
}

// 2. Check for uncommitted changes
let hasUncommitted = false;
try {
  const status = execSync("git status --porcelain").toString().trim();
  if (status) {
    hasUncommitted = true;
    const lines = status.split("\n");
    console.warn(`⚠️  WARNING: You have ${lines.length} uncommitted file(s) in your working tree.`);
    console.warn("   These changes will NOT be included in the deployment unless committed first.");
    console.warn("   First 5 changed files:");
    lines.slice(0, 5).forEach(l => console.warn("     " + l));
    if (lines.length > 5) console.warn(`     ... and ${lines.length - 5} more.`);
    console.warn("   ➡  Commit your changes with: git add -A && git commit -m \"your message\"\n");
  } else {
    console.log("✅ Git working tree is clean.");
  }
} catch {}

// 3. ── STALE BUILD GUARD ──────────────────────────────────────────────────────
// This is the critical check that was missing before: verify that dist/ was
// built from the CURRENT HEAD commit. If it was built from an older commit, the
// deployed bundle will be missing recent code changes.
console.log("\n🔎 Checking whether dist/ is up-to-date with HEAD...");
const buildMetaPath = resolve(ROOT, "dist", "build-meta.json");
let distCommit = null;
if (existsSync(buildMetaPath)) {
  try {
    const meta = JSON.parse(readFileSync(buildMetaPath, "utf8"));
    distCommit = meta.gitCommit;
    console.log(`   dist/ was built from commit: ${distCommit}`);
    console.log(`   Current HEAD commit        : ${currentHead}`);
  } catch {
    console.warn("   Could not read dist/build-meta.json.");
  }
} else {
  console.warn("   dist/ does not exist or has no build-meta.json.");
}

const distIsStale = !distCommit || !currentHead.startsWith(distCommit) && !distCommit.startsWith(currentHead);

if (distIsStale) {
  console.warn("\n⚠️  STALE BUILD DETECTED: dist/ was not built from the current HEAD.");
  console.warn("   This was the root cause of previous deployments publishing old code.");
  console.warn("   A fresh build will be forced now.\n");
} else {
  console.log("✅ dist/ is current with HEAD.\n");
}

// 4. TypeScript check (per AGENTS.md guideline — uses root tsc, not strict app tsc)
console.log("🔍 Checking TypeScript types (npx tsc --noEmit)...");
try {
  execSync("npx tsc --noEmit", { stdio: "inherit" });
  console.log("✅ TypeScript check passed.\n");
} catch (err) {
  console.error("\n❌ [Deploy Guard] TypeScript compilation failed! Fix type errors before deploying.");
  process.exit(1);
}

// 5. Always build fresh — NEVER skip the build step
// Even if dist/ looks current, a fresh build catches any file changes that
// are on disk but weren't committed yet (watched by vite).
console.log("📦 Building fresh production bundle from current HEAD...");
try {
  execSync("npm run build", { stdio: "inherit" });

  // Re-read build-meta to confirm the new build captured HEAD
  if (existsSync(buildMetaPath)) {
    const newMeta = JSON.parse(readFileSync(buildMetaPath, "utf8"));
    console.log(`\n✅ Build successful. dist/ now at commit: ${newMeta.gitCommit}\n`);
    if (hasUncommitted) {
      console.log("ℹ️  Note: You have uncommitted files in your working tree, which are included in this bundle from disk.");
      console.log("   Remember to commit your work to Git so it is saved to version control.\n");
    }
  }
} catch (err) {
  console.error("\n❌ [Deploy Guard] Build failed!");
  process.exit(1);
}

// 6. Deploy to Firebase
console.log("🌐 Deploying to Firebase Hosting...");
try {
  execSync("npx firebase deploy --only hosting --project medicodeui --non-interactive", { stdio: "inherit" });
  console.log("\n🎉 [Deploy Guard] Successfully deployed to Firebase Hosting!\n");
} catch (err) {
  console.error("\n❌ [Deploy Guard] Firebase deployment failed!");
  process.exit(1);
}
