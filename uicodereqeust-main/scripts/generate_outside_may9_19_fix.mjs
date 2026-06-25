/**
 * Only the user's May 9–19 2026 list is legitimate for that date range.
 * Any other request dated 2026-05-09..2026-05-19 → restore date from Excel.
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "My personal back till may 9th MedAuth_Report_all_20260509 (1).xlsx");
const DUMP = path.join(ROOT, "scratch/db_dump.json");
const AUTH_CSV = path.join(ROOT, "docs/may9-19-2026-verification.csv");
const OUT_SQL = path.join(ROOT, "supabase/migrations/20260521280000_fix_outside_may9_19_range.sql");
const OUT_CSV = path.join(ROOT, "docs/outside-may9-19-fix-audit.csv");

const RANGE_START = "2026-05-09";
const RANGE_END = "2026-05-19";

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+null\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s) {
  return norm(s).split(" ").filter((t) => t.length > 2);
}

function overlapScore(a, b) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

function parseReportDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^0?3\/0?10\/2025$/i.test(raw)) return "2025-03-10T12:00:00.000Z";
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const first = +m[1];
  const second = +m[2];
  let year = +m[3];
  if (year < 100) year += 2000;
  let month, day;
  if (first > 12) {
    day = first;
    month = second;
  } else if (second > 12) {
    month = first;
    day = second;
  } else {
    day = first;
    month = second;
  }
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function policyKey(p) {
  return String(p ?? "").trim().replace(/-1$/, "").replace(/-2$/, "").replace(/-3$/, "");
}

function inMayRange(isoDay) {
  return isoDay >= RANGE_START && isoDay <= RANGE_END;
}

// Load authoritative IDs (user's May 9–19 list only)
const authIds = new Set();
if (fs.existsSync(AUTH_CSV)) {
  for (const line of fs.readFileSync(AUTH_CSV, "utf8").trim().split("\n").slice(1)) {
    const id = line.split(",")[5];
    if (id) authIds.add(id);
  }
}

const wb = XLSX.readFile(REPORT);
const excelRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

const excelByCode = new Map();
const excelRowsEnriched = excelRows.map((r) => {
  const code = String(r["Auth Code"] ?? "").trim();
  const iso = parseReportDate(r.Date);
  const row = {
    code,
    iso,
    date: r.Date,
    policy: String(r["NHIS/ID"] ?? "").trim(),
    policyKey: policyKey(r["NHIS/ID"]),
    patient: String(r["Patient Name"] ?? ""),
    patientNorm: norm(r["Patient Name"]),
    diag: String(r.Diagnosis ?? ""),
    svc: String(r["Service/Treatment"] ?? ""),
    text: `${r.Diagnosis} ${r["Service/Treatment"]}`,
    status: String(r.Status ?? "").toLowerCase(),
  };
  if (code && iso && !/^(not in order|confirm|declined)$/i.test(code)) {
    excelByCode.set(code.toUpperCase(), row);
  }
  return row;
});

const dump = JSON.parse(fs.readFileSync(DUMP, "utf8")).rows;

const outsiders = dump.filter((r) => {
  const d = String(r.created_at ?? "").slice(0, 10);
  return d >= RANGE_START && d <= RANGE_END && !authIds.has(r.id);
});

const fixes = [];
const unmatched = [];

for (const rec of outsiders) {
  const recDay = String(rec.created_at).slice(0, 10);
  const code = String(rec.authorization_code ?? "").trim();

  let match = null;
  let method = "";

  if (code) {
    const ex = excelByCode.get(code.toUpperCase());
    if (ex?.iso) {
      match = ex;
      method = "auth_code";
    }
  }

  if (!match) {
    const pKey = policyKey(rec.policy_number);
    const pNorm = norm(rec.patient_name);
    const nameMatch = (ex) => {
      if (!ex.patientNorm) return false;
      const exTokens = ex.patientNorm.split(" ").filter((t) => t.length > 2);
      const recTokens = pNorm.split(" ").filter((t) => t.length > 2);
      const shared = exTokens.filter((t) => recTokens.includes(t));
      return shared.length >= 2 || (shared.length >= 1 && exTokens.length <= 2);
    };

    let candidates = excelRowsEnriched.filter((ex) => ex.iso && ex.policyKey === pKey && nameMatch(ex));
    if (!candidates.length && pKey) {
      candidates = excelRowsEnriched.filter((ex) => ex.iso && ex.policyKey === pKey);
    }

    let best = null;
    let bestScore = 0;
    const minScore = candidates.length > 1 ? 0.45 : 0.35;
    for (const ex of candidates) {
      const score =
        overlapScore(rec.diagnosis, ex.text) * 0.6 +
        overlapScore(rec.patient_name, ex.patient) * 0.25 +
        (rec.status === "rejected" && ex.status.includes("declin") ? 0.15 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = ex;
      }
    }
    if (best && bestScore >= minScore) {
      match = best;
      method = `fuzzy_${Math.round(bestScore * 100)}`;
    }
  }

  if (match) {
    const newDay = match.iso.slice(0, 10);
    if (newDay !== recDay) {
      fixes.push({
        id: rec.id,
        code: code || "(no code)",
        patient: rec.patient_name,
        policy: rec.policy_number,
        status: rec.status,
        wrongDate: recDay,
        excelDate: match.date,
        newIso: match.iso,
        method,
      });
    }
  } else {
    unmatched.push({
      id: rec.id,
      code: code || "(no code)",
      patient: rec.patient_name,
      policy: rec.policy_number,
      wrongDate: recDay,
      diagnosis: (rec.diagnosis || "").slice(0, 60),
    });
  }
}

console.log("In May 9–19 range (total):", dump.filter((r) => {
  const d = String(r.created_at ?? "").slice(0, 10);
  return d >= RANGE_START && d <= RANGE_END;
}).length);
console.log("User list (keep dates):", authIds.size);
console.log("Outside user list:", outsiders.length);
console.log("Will fix (Excel date, not in range):", fixes.length);
console.log("Still in May range after fix:", fixes.filter((f) => inMayRange(f.newIso.slice(0, 10))).length);
console.log("Unmatched (manual review):", unmatched.length);

fs.writeFileSync(
  OUT_CSV,
  [
    "id,code,policy,patient,status,wrong_date,excel_date,method",
    ...fixes.map((f) =>
      [f.id, f.code, f.policy, `"${String(f.patient).replace(/"/g, "'")}"`, f.status, f.wrongDate, f.excelDate, f.method].join(","),
    ),
    "",
    "# UNMATCHED",
    "id,code,policy,patient,wrong_date,diagnosis",
    ...unmatched.map((u) =>
      [u.id, u.code, u.policy, `"${String(u.patient).replace(/"/g, "'")}"`, u.wrongDate, `"${u.diagnosis}"`].join(","),
    ),
  ].join("\n"),
);

const esc = (s) => String(s).replace(/'/g, "''");
let sql = `-- Move ${fixes.length} requests OFF May 9–19 2026 (not in user's authoritative list)
-- User list preserved via docs/may9-19-2026-verification.csv (${authIds.size} ids)
BEGIN;

ALTER TABLE public.authorization_requests
  DISABLE TRIGGER protect_approved_authorization_requests_trigger;

`;

const CHUNK = 200;
for (let i = 0; i < fixes.length; i += CHUNK) {
  const chunk = fixes.slice(i, i + CHUNK);
  sql += `UPDATE public.authorization_requests AS r
SET created_at = f.correct_date
FROM (VALUES\n`;
  sql += chunk.map((f) => `  ('${esc(f.id)}'::uuid, '${f.newIso}'::timestamptz)`).join(",\n");
  sql += `
) AS f(id, correct_date)
WHERE r.id = f.id;

`;
}

sql += `ALTER TABLE public.authorization_requests
  ENABLE TRIGGER protect_approved_authorization_requests_trigger;

COMMIT;
`;

fs.writeFileSync(OUT_SQL, sql);
console.log("Wrote", OUT_SQL);
console.log("Wrote", OUT_CSV);
