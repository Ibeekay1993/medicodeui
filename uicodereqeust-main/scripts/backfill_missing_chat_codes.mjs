import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const REPO_ROOT = path.resolve(ROOT);
const CHAT_PATH = path.join(REPO_ROOT, "_chat_extract", "WhatsApp Chat with Uhs Nhia.txt");
const REPORT_PATH = path.join(REPO_ROOT, "_chat_extract", "live_vs_chat_report.json");
const ENV_PATH = path.join(REPO_ROOT, ".env");
const CHROME_PROFILE = path.join(path.dirname(REPO_ROOT), "_chrome_profile");
const CHROME_EXE = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function readEnvValue(source, key) {
  const match = source.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function splitApprovedFor(text) {
  const source = normalize(text);
  if (!source) {
    return { diagnosis: "", treatment: "" };
  }

  const separators = [" - ", " — ", " – ", " —", " -", " –"];
  for (const separator of separators) {
    const idx = source.indexOf(separator);
    if (idx > 0) {
      const diagnosis = normalize(source.slice(0, idx));
      const treatment = normalize(source.slice(idx + separator.length));
      return { diagnosis, treatment };
    }
  }

  return { diagnosis: source, treatment: "" };
}

function parseChatBlock(block) {
  const patient =
    normalize(block.match(/(?:\*?Patient\*?|(?:\*?Name\*?))\s*:\s*(.+)$/im)?.[1]) ||
    normalize(block.match(/^Patient:\s*(.+)$/im)?.[1]) ||
    normalize(block.match(/^\*Name\*\s*:\s*(.+)$/im)?.[1]) ||
    "";

  const policy =
    normalize(block.match(/(?:\*?Policy No\*?|Policy No|Policy|(?:\*?NHIA no\*?))\s*:\s*(.+)$/im)?.[1]) ||
    "";

  const hospital = normalize(block.match(/^Hospital:\s*(.+)$/im)?.[1]) || "";
  const code = normalize(block.match(/^Auth Code:\s*(.+)$/im)?.[1]) || "";
  const approvedFor = normalize(block.match(/^(Approved For|Requested For):\s*(.+)$/im)?.[2]) || "";
  const date = normalize(block.match(/^Date:\s*(.+)$/im)?.[1]) || "";

  const status =
    /requested for/i.test(block) || /authorization declined/i.test(block)
      ? "rejected"
      : /approved for/i.test(block) || /authorization approved/i.test(block)
        ? "approved"
        : "approved";

  const { diagnosis, treatment } = splitApprovedFor(approvedFor);
  const rawNote = approvedFor || "";

  return {
    code,
    patient_name: patient,
    policy_number: policy,
    hospital_name: hospital,
    diagnosis,
    treatment,
    approvedFor,
    date,
    status,
    note: rawNote,
    whatsapp_raw_message: block,
  };
}

function parseDdMmYyyyToIso(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildMirrorRequestId(record) {
  const policy = normalize(record?.policy_number || "");
  const name = normalize(record?.patient_name || "");
  const date = normalize(record?.date || "");
  const hospital = normalize(record?.hospital_name || "");
  const diagnosis = normalize(record?.diagnosis || "");
  const treatment = normalize(record?.treatment || "");
  return [
    "sheet",
    policy || "na",
    date || "nodate",
    name || "noname",
    hospital || "nohospital",
    diagnosis || "nodx",
    treatment || "notx",
  ].join(":");
}

async function getLiveSessionToken() {
  const context = await chromium.launchPersistentContext(CHROME_PROFILE, {
    headless: true,
    executablePath: CHROME_EXE,
  });
  const page = await context.newPage();
  await page.goto("https://medicodeui.web.app/dashboard", { waitUntil: "networkidle" });
  const raw = await page.evaluate(() => localStorage.getItem("sb-optistuvyeiojlgmkdks-auth-token"));
  await context.close();
  if (!raw) throw new Error("Could not read live auth token from the browser profile");
  const parsed = JSON.parse(raw);
  if (!parsed?.access_token) throw new Error("Live auth token payload missing access_token");
  return parsed.access_token;
}

async function loadConfig() {
  const env = await fs.readFile(ENV_PATH, "utf8");
  const supabaseUrl = readEnvValue(env, "VITE_SUPABASE_URL");
  const anonKey = readEnvValue(env, "VITE_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing Supabase config in .env");
  }
  return { supabaseUrl, anonKey };
}

async function invokeFunction({ supabaseUrl, anonKey, token, body }) {
  const res = await fetch(`${supabaseUrl}/functions/v1/google-integration`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`Function call failed (${res.status} ${res.statusText}): ${text}`);
  }

  return parsed;
}

async function queryByCode({ supabaseUrl, anonKey, token, code }) {
  const url = new URL(`${supabaseUrl}/rest/v1/authorization_requests`);
  url.searchParams.set("select", "id,authorization_code,patient_name,policy_number,status,created_at,updated_at,decided_at");
  url.searchParams.set("authorization_code", `eq.${code}`);
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Verification query failed for ${code}: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

async function main() {
  const { supabaseUrl, anonKey } = await loadConfig();
  const report = JSON.parse(await fs.readFile(REPORT_PATH, "utf8"));
  const missingCodes = Array.isArray(report?.missing) ? report.missing : [];
  const rawChat = await fs.readFile(CHAT_PATH, "utf8");

  const targetCodes = missingCodes.map((item) => item.code).filter(Boolean);
  const blocks = new Map();
  for (const code of targetCodes) {
    const idx = rawChat.indexOf(code);
    if (idx === -1) {
      blocks.set(code, null);
      continue;
    }
    const start = Math.max(0, rawChat.lastIndexOf("\n\n", idx - 1));
    const end = rawChat.indexOf("\n\n", idx);
    blocks.set(code, rawChat.slice(start < 0 ? 0 : start + 2, end === -1 ? rawChat.length : end).trim());
  }

  const token = await getLiveSessionToken();

  const prepared = targetCodes.map((code) => {
    const block = blocks.get(code);
    if (!block) {
      throw new Error(`Could not find chat block for ${code}`);
    }
    const parsed = parseChatBlock(block);
    const requestId = buildMirrorRequestId(parsed);
    const createdAt = parseDdMmYyyyToIso(parsed.date) || new Date().toISOString();
    return {
      ...parsed,
      request_id: requestId,
      created_at: createdAt,
      updated_at: createdAt,
      decided_at: createdAt,
      source: "whatsapp",
      urgency: "routine",
      decision_reason: parsed.approvedFor || parsed.note || "",
      clinical_notes: parsed.approvedFor || parsed.note || "",
      doctor_name: "Ronsberger HMO UI Desk | Grace",
    };
  });

  const results = [];
  for (const record of prepared) {
    const before = await queryByCode({
      supabaseUrl,
      anonKey,
      token,
      code: record.code,
    });

    const response = await invokeFunction({
      supabaseUrl,
      anonKey,
      token,
      body: {
        action: "upsert_request",
        requestData: {
          patient_name: record.patient_name,
          policy_number: record.policy_number,
          hospital_name: record.hospital_name,
          date: record.date,
          authorization_code: record.code,
          diagnosis: record.diagnosis,
          treatment: record.treatment,
          note: record.note,
          status: record.status,
          source: record.source,
          urgency: record.urgency,
          request_id: record.request_id,
          created_at: record.created_at,
          updated_at: record.updated_at,
          decided_at: record.decided_at,
          decision_reason: record.decision_reason,
          clinical_notes: record.clinical_notes,
          doctor_name: record.doctor_name,
          whatsapp_raw_message: record.whatsapp_raw_message,
        },
      },
    });

    results.push({ code: record.code, beforeCount: Array.isArray(before) ? before.length : 0, response });
  }

  const refreshResponse = await invokeFunction({
    supabaseUrl,
    anonKey,
    token,
    body: {
      action: "refresh_local_sheet_cache",
    },
  });

  const verification = [];
  for (const code of targetCodes) {
    const rows = await queryByCode({ supabaseUrl, anonKey, token, code });
    verification.push({ code, count: Array.isArray(rows) ? rows.length : 0, row: rows?.[0] || null });
  }

  const output = {
    ok: true,
    totalPrepared: prepared.length,
    results,
    refreshResponse,
    verification,
  };

  const outPath = path.join(REPO_ROOT, "_chat_extract", "backfill_missing_chat_codes_report.json");
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
