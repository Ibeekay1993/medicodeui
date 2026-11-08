/**
 * Fix records stuck on 2026-05-19 that don't belong there per Excel report.
 * Match by: auth code (exact) > policy + patient + diagnosis overlap > policy + patient
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "My personal back till may 9th MedAuth_Report_all_20260509 (1).xlsx");
const DUMP = path.join(ROOT, "scratch/db_dump.json");
const OUT_SQL = path.join(ROOT, "supabase/migrations/20260521260000_fix_may19_wrong_dates.sql");
const OUT_CSV = path.join(ROOT, "docs/may19-date-fix-audit.csv");

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
const may19 = dump.filter((r) => String(r.created_at ?? "").startsWith("2026-05-19"));

const fixes = [];

for (const rec of may19) {
  const code = String(rec.authorization_code ?? "").trim();
  const recIso = String(rec.created_at).slice(0, 10);

  // 1) Exact auth code in Excel
  if (code) {
    const ex = excelByCode.get(code.toUpperCase());
    if (ex && ex.iso.slice(0, 10) !== recIso) {
      fixes.push({
        id: rec.id,
        code,
        patient: rec.patient_name,
        policy: rec.policy_number,
        diagnosis: rec.diagnosis,
        status: rec.status,
        excelDate: ex.date,
        newIso: ex.iso,
        match: "auth_code",
        score: 1,
      });
      continue;
    }
  }

  // 2) Fuzzy match for null/declined codes - policy + patient + diagnosis
  const pKey = policyKey(rec.policy_number);
  const pNorm = norm(rec.patient_name);
  const dNorm = norm(rec.diagnosis);

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

  // Require strong diagnosis match when multiple Excel rows share policy+patient
  const minScore = candidates.length > 1 ? 0.45 : 0.35;

  if (best && best.iso.slice(0, 10) !== recIso && bestScore >= minScore) {
    fixes.push({
      id: rec.id,
      code: code || "(no code)",
      patient: rec.patient_name,
      policy: rec.policy_number,
      diagnosis: (rec.diagnosis || "").slice(0, 60),
      status: rec.status,
      excelDate: best.date,
      newIso: best.iso,
      match: `fuzzy_${Math.round(bestScore * 100)}`,
      score: bestScore,
    });
  }
}

// Dedupe by id
const byId = new Map();
for (const f of fixes) byId.set(f.id, f);
const list = [...byId.values()].sort((a, b) => a.policy.localeCompare(b.policy));

console.log("May-19 records:", may19.length);
console.log("Fixes to apply:", list.length);
console.log("Rejected fixes:", list.filter((f) => f.status === "rejected").length);
console.log("OLOYEDE 80125960:", list.find((f) => f.policy === "80125960"));

// CSV audit
fs.writeFileSync(
  OUT_CSV,
  [
    "id,auth_code,policy,patient,status,diagnosis,excel_date,match_method,score",
    ...list.map((f) =>
      [f.id, f.code, f.policy, `"${String(f.patient).replace(/"/g, "'")}"`, f.status, `"${f.diagnosis}"`, f.excelDate, f.match, f.score].join(","),
    ),
  ].join("\n"),
);

const esc = (s) => String(s).replace(/'/g, "''");
let sql = `-- Fix ${list.length} records wrongly dated 2026-05-19 (matched to Excel by code + policy/diagnosis)
BEGIN;

ALTER TABLE public.authorization_requests
  DISABLE TRIGGER protect_approved_authorization_requests_trigger;

`;

const CHUNK = 200;
for (let i = 0; i < list.length; i += CHUNK) {
  const chunk = list.slice(i, i + CHUNK);
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
