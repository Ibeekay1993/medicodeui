/**
 * Fix rows stamped 2026-05-20 (migration run day) using Excel auth-code dates.
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "My personal back till may 9th MedAuth_Report_all_20260509 (1).xlsx");
const OUT_SQL = path.join(ROOT, "supabase/migrations/20260521310000_fix_may20_bulk_dates_from_excel.sql");
const STAMP = "2026-05-20";

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

const fixes = [];
for (const r of rows) {
  const code = String(r["Auth Code"] ?? "").trim().toUpperCase();
  const iso = parseReportDate(r.Date);
  if (!code || !iso || /^(NOT IN ORDER|CONFIRM|DECLINED)$/i.test(code)) continue;
  if (iso.slice(0, 10) === STAMP) continue;
  fixes.push({ code, iso, excelDate: r.Date });
}

console.log("Excel codes to apply when DB row is stamped", STAMP, ":", fixes.length);

const esc = (s) => String(s).replace(/'/g, "''");
let sql = `-- Re-align rows stamped ${STAMP} (migration day) to Excel dates by auth code
BEGIN;

ALTER TABLE public.authorization_requests
  DISABLE TRIGGER protect_approved_authorization_requests_trigger;

`;

const CHUNK = 150;
for (let i = 0; i < fixes.length; i += CHUNK) {
  const chunk = fixes.slice(i, i + CHUNK);
  sql += `UPDATE public.authorization_requests AS r
SET created_at = f.correct_date, updated_at = f.correct_date
FROM (VALUES\n`;
  sql += chunk.map((f) => `  ('${esc(f.code)}', '${f.iso}'::timestamptz)`).join(",\n");
  sql += `
) AS f(auth_code, correct_date)
WHERE upper(trim(r.authorization_code)) = f.auth_code
  AND (
    (r.created_at AT TIME ZONE 'Africa/Lagos')::date = DATE '${STAMP}'
    OR (r.updated_at AT TIME ZONE 'Africa/Lagos')::date = DATE '${STAMP}'
  );

`;
}

sql += `ALTER TABLE public.authorization_requests
  ENABLE TRIGGER protect_approved_authorization_requests_trigger;

COMMIT;
`;

fs.writeFileSync(OUT_SQL, sql);
console.log("Wrote", OUT_SQL);
