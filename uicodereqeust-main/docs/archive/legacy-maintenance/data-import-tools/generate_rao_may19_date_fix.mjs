/**
 * Fix R/AO/* codes stored as 2026-05-19 using true Date from MedAuth Excel report.
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "My personal back till may 9th MedAuth_Report_all_20260509 (1).xlsx");
const OUT_SQL = path.join(ROOT, "supabase", "migrations", "20260521240000_fix_rao_may19_dates_from_excel.sql");
const RECOVERY = path.join(ROOT, "public", "recovery.json");

function parseReportDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^0?3\/0?10\/2025$/i.test(raw)) {
    return "2025-03-10T12:00:00.000Z";
  }
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const first = +m[1];
  const second = +m[2];
  let year = +m[3];
  if (year < 100) year += 2000;
  let month;
  let day;
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
const byCode = new Map(
  rows.filter((r) => r["Auth Code"]).map((r) => [String(r["Auth Code"]).trim(), String(r.Date).trim()]),
);

const recovery = JSON.parse(fs.readFileSync(RECOVERY, "utf8"));
const fixes = [];

for (const [code, iso] of Object.entries(recovery)) {
  if (!code.startsWith("R/AO/") || !String(iso).startsWith("2026-05-19")) continue;
  const excelDate = byCode.get(code);
  if (!excelDate) continue;
  const correct = parseReportDate(excelDate);
  if (!correct || correct.slice(0, 10) === iso.slice(0, 10)) continue;
  fixes.push({ code, excelDate, correct });
}

fixes.sort((a, b) => a.code.localeCompare(b.code));
console.log(`Fixes: ${fixes.length} R/AO codes (was 2026-05-19, from Excel Date column)`);

const esc = (s) => s.replace(/'/g, "''");
let sql = `-- Fix ${fixes.length} R/AO codes: wrong 2026-05-19 → Excel report Date (D/M/Y)
BEGIN;

ALTER TABLE public.authorization_requests
  DISABLE TRIGGER protect_approved_authorization_requests_trigger;

UPDATE public.authorization_requests AS r
SET created_at = f.correct_date
FROM (VALUES\n`;
sql += fixes.map((f) => `  ('${esc(f.code)}', '${f.correct}'::timestamptz)`).join(",\n");
sql += `
) AS f(auth_code, correct_date)
WHERE r.authorization_code = f.auth_code;

ALTER TABLE public.authorization_requests
  ENABLE TRIGGER protect_approved_authorization_requests_trigger;

COMMIT;
`;

fs.writeFileSync(OUT_SQL, sql);
for (const f of fixes) recovery[f.code] = f.correct;
fs.writeFileSync(RECOVERY, JSON.stringify(recovery, null, 2));
console.log("Wrote", OUT_SQL);
console.log("R/AO/011042967 →", fixes.find((f) => f.code === "R/AO/011042967"));
