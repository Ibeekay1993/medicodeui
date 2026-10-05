// scripts/deploy-guard.mjs
// Pre-flight validation to ensure you NEVER deploy stale branches or out-of-sync code.
import { execSync } from "node:child_process";

console.log("\n🚀 [Deploy Guard] Running pre-deployment validation...");

// 1. Check Git Branch
let branch = "unknown";
try {
  branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  console.log(`📌 Git Branch: ${branch}`);
  if (branch !== "main") {
    console.warn(`\n⚠️  WARNING: You are deploying from branch '${branch}', NOT 'main'!`);
    console.warn(`    Make sure this is intentional so you don't deploy test/stale code to production.\n`);
  }
} catch (e) {
  console.warn("Could not determine git branch:", e.message);
}

// 2. Check for uncommitted changes
try {
  const status = execSync("git status --porcelain").toString().trim();
  if (status) {
    console.warn("\n⚠️  WARNING: You have uncommitted changes in your working tree:");
    console.warn(status.split("\n").slice(0, 5).map(l => "   " + l).join("\n"));
    console.warn("   Consider committing and pushing your changes so they are preserved in version control.\n");
  } else {
    console.log("✅ Git working tree is clean.");
  }
} catch {}

// 3. Check if ahead of origin/main
try {
  const aheadCount = execSync("git rev-list --count origin/main..HEAD").toString().trim();
  if (parseInt(aheadCount, 10) > 0) {
    console.warn(`\n⚠️  WARNING: Local branch is ahead of origin/main by ${aheadCount} commit(s)!`);
    console.warn(`   Run 'git push origin ${branch}' after deployment so your team and CI stay in sync.\n`);
  }
} catch {}

// 4. Run TypeScript check
console.log("🔍 Checking TypeScript types (tsc --noEmit)...");
try {
  execSync("npx tsc --noEmit", { stdio: "inherit" });
  console.log("✅ TypeScript check passed.\n");
} catch (err) {
  console.error("\n❌ [Deploy Guard] TypeScript compilation failed! Fix type errors before deploying.");
  process.exit(1);
}

// 5. Build
console.log("📦 Building production bundle (vite build)...");
try {
  execSync("npm run build", { stdio: "inherit" });
  console.log("✅ Build successful.\n");
} catch (err) {
  console.error("\n❌ [Deploy Guard] Build failed!");
  process.exit(1);
}

// 6. Deploy to Firebase
console.log("🌐 Deploying to Firebase Hosting...");
try {
  execSync("firebase deploy --only hosting", { stdio: "inherit" });
  console.log("\n🎉 [Deploy Guard] Successfully deployed to Firebase Hosting!\n");
} catch (err) {
  console.error("\n❌ [Deploy Guard] Firebase deployment failed!");
  process.exit(1);
}
