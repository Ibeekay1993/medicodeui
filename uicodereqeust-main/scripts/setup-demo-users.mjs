// Guarded demo-account provisioning utility.
// This script creates accounts; it never deletes existing users.
// Run only against a non-production project with explicit opt-in.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD;
const ALLOW_DEMO_USER_SETUP = process.env.ALLOW_DEMO_USER_SETUP === "true";
const SUPABASE_ENVIRONMENT = process.env.SUPABASE_ENVIRONMENT?.trim().toLowerCase();

if (!ALLOW_DEMO_USER_SETUP) {
  throw new Error("Refusing to create demo accounts. Set ALLOW_DEMO_USER_SETUP=true only for an isolated non-production environment.");
}
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DEMO_USER_PASSWORD || DEMO_USER_PASSWORD.length < 16) {
  throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and a DEMO_USER_PASSWORD of at least 16 characters.");
}
if (!["development", "test", "staging"].includes(SUPABASE_ENVIRONMENT || "")) {
  throw new Error("Set SUPABASE_ENVIRONMENT to development, test or staging before creating demo users.");
}

let targetUrl;
try {
  targetUrl = new URL(SUPABASE_URL);
} catch {
  throw new Error("SUPABASE_URL must be a valid HTTPS URL.");
}
const isLocalTarget = ["localhost", "127.0.0.1", "[::1]"].includes(targetUrl.hostname);
if (targetUrl.protocol !== "https:" && !(isLocalTarget && targetUrl.protocol === "http:")) {
  throw new Error("SUPABASE_URL must use HTTPS except for a local development instance.");
}
if (
  targetUrl.hostname === "api.ronsbergerhmo.io" ||
  targetUrl.hostname.endsWith(".supabase.co")
) {
  throw new Error("Refusing to create demo users on a production or retired managed Supabase endpoint.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const demoUsers = [
  { email: "demo.admin@example.invalid", role: "admin", fullName: "Demo Admin Officer" },
  { email: "demo.nurse@example.invalid", role: "nurse", fullName: "Demo Nurse Practitioner" },
  { email: "demo.hospital@example.invalid", role: "hospital", fullName: "Demo Hospital" },
  { email: "demo.claims@example.invalid", role: "claims", fullName: "Demo Claims Reviewer" },
];

async function run() {
  console.log("Creating demo accounts in the explicitly selected non-production project.");
  for (const user of demoUsers) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: DEMO_USER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });
    if (createError) {
      console.error(`Could not create ${user.email}: ${createError.message}`);
      continue;
    }

    const { error: roleError } = await supabase.from("user_roles").upsert(
      { user_id: created.user.id, role: user.role, full_name: user.fullName },
      { onConflict: "user_id" },
    );
    if (roleError) console.error(`Role assignment failed for ${user.email}: ${roleError.message}`);
    else console.log(`Created demo account and role: ${user.email} (${user.role})`);

    if (user.role === "hospital") {
      const { error: hospitalError } = await supabase.from("hospitals").upsert(
        { name: user.fullName, email: user.email, code: "HOSP-DEMO", user_id: created.user.id },
        { onConflict: "code" },
      );
      if (hospitalError) console.error(`Demo hospital setup failed: ${hospitalError.message}`);
    }
  }
}

run().catch((error) => {
  console.error("Demo setup failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
