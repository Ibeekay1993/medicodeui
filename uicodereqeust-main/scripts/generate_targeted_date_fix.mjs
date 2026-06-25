/**
 * Targeted date fix:
 * - Use exact auth code from Excel Date column (D/M/Y; 03/10/2025 → March 10 2025)
 * - Never change *update/*UPDATE rows if Excel already matches
 * - Fix base codes in update pairs to their own Excel date
 * - Fix 2026-05-19 corruption where Excel has a real date (e.g. OLABODE 19/02/2024)
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "My personal back till may 9th MedAuth_Report_all_20260509 (1).xlsx");
const OUT_SQL = path.join(ROOT, "supabase/migrations/20260521250000_targeted_date_fix_excel.sql");
const RECOVERY = path.join(ROOT, "public/recovery.json");

function isUpdateCode(code) {
  return /update$/i.test(String(code || "").trim());
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

const wb = XLSX.readFile(REPORT);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
const excelByCode = new Map();
for (const r of rows) {
  const code = String(r["Auth Code"] ?? "").trim();
  if (!code) continue;
  const iso = parseReportDate(r.Date);
  if (iso) excelByCode.set(code, { iso, date: String(r.Date).trim(), policy: r["NHIS/ID"], patient: r["Patient Name"] });
}

const recovery = JSON.parse(fs.readFileSync(RECOVERY, "utf8"));
const fixes = new Map(); // code -> iso

function addFix(code, iso, reason) {
  if (!code || !iso) return;
  const key = String(code).trim();
  if (!key || key === "-" || key.toLowerCase().includes("not in order")) return;
  fixes.set(key, { iso, reason });
}

// 1) All recovery mismatches vs Excel (exact code)
for (const [code, recIso] of Object.entries(recovery)) {
  const ex = excelByCode.get(code);
  if (!ex) continue;
  if (recIso.slice(0, 10) === ex.iso.slice(0, 10)) continue;
  // Skip update codes that are already correct in recovery - still fix if wrong
  addFix(code, ex.iso, "recovery_mismatch");
}

// 2) Base codes in update pairs: ensure base gets Excel date (not update's date)
for (const [code, ex] of excelByCode) {
  if (isUpdateCode(code)) continue;
  const updKey = code + "update";
  const updKey2 = code + "UPDATE";
  if (excelByCode.has(updKey) || excelByCode.has(updKey2)) {
    addFix(code, ex.iso, "base_of_pair");
  }
}

// 3) OLABODE / declined rows - match policy 80127512 in excel "Not in order" row
for (const r of rows) {
  const policy = String(r["NHIS/ID"] ?? "").trim();
  const patient = String(r["Patient Name"] ?? "").trim();
  if (policy === "80127512" && patient.includes("OLUSHOLA OLABODE")) {
    const iso = parseReportDate(r.Date);
    if (iso) {
      // Will fix via special SQL by policy+patient pattern
      console.log("OLUSHOLA excel:", r.Date, "->", iso);
    }
  }
}

// Remove fixes where update code is OK (excel matches recovery) - user said leave update
for (const [code, fix] of [...fixes]) {
  if (isUpdateCode(code)) {
    const rec = recovery[code];
    if (rec && rec.slice(0, 10) === fix.iso.slice(0, 10)) {
      fixes.delete(code);
    }
  }
}

const list = [...fixes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log("Total code fixes:", list.length);
console.log("Includes 011006703BD:", list.find(([c]) => c === "R/AG/011006703BD"));
console.log("Includes 011007022BD:", list.find(([c]) => c === "R/AG/011007022BD"));
console.log("Update codes in fix list:", list.filter(([c]) => isUpdateCode(c)).length);

const esc = (s) => s.replace(/'/g, "''");
let sql = `-- Targeted Excel date fix (${list.length} auth codes + OLABODE 80127512)
BEGIN;

ALTER TABLE public.authorization_requests
  DISABLE TRIGGER protect_approved_authorization_requests_trigger;

`;

const CHUNK = 350;
for (let i = 0; i < list.length; i += CHUNK) {
  const chunk = list.slice(i, i + CHUNK);
  sql += `UPDATE public.authorization_requests AS r
SET created_at = f.correct_date
FROM (VALUES\n`;
  sql += chunk.map(([c, f]) => `  ('${esc(c)}', '${f.iso}'::timestamptz)`).join(",\n");
  sql += `
) AS f(auth_code, correct_date)
WHERE r.authorization_code = f.auth_code;

`;
}

// OLABODE rejected, no auth code, policy 80127512
sql += `-- OLABODE OLABODE 80127512: Excel 19/02/2024 (was 19/05/2026)
UPDATE public.authorization_requests
SET created_at = '2024-02-19T12:00:00.000Z'::timestamptz
WHERE policy_number = '80127512'
  AND patient_name ILIKE '%OLUSHOLA OLABODE%'
  AND (authorization_code IS NULL OR authorization_code = '')
  AND created_at::date = '2026-05-19'::date;

`;

sql += `ALTER TABLE public.authorization_requests
  ENABLE TRIGGER protect_approved_authorization_requests_trigger;

COMMIT;
`;

fs.writeFileSync(OUT_SQL, sql);
for (const [code, f] of list) recovery[code] = f.iso;
fs.writeFileSync(RECOVERY, JSON.stringify(recovery, null, 2));
console.log("Wrote", OUT_SQL);
