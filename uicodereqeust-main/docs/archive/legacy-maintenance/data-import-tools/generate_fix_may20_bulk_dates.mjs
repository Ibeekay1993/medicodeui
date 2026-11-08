/**
 * Fix records stamped 2026-05-20 from migration runs — restore created_at/updated_at from Excel.
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "My personal back till may 9th MedAuth_Report_all_20260509 (1).xlsx");
const DUMP = path.join(ROOT, "scratch/db_dump.json");
const OUT_SQL = path.join(ROOT, "supabase/migrations/20260521310000_fix_may20_bulk_dates_from_excel.sql");
const OUT_CSV = path.join(ROOT, "docs/may20-bulk-date-fix-audit.csv");

const STAMP_DAY = "2026-05-20";

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
for (const r of excelRows) {
  const code = String(r["Auth Code"] ?? "").trim();
  const iso = parseReportDate(r.Date);
  if (code && iso && !/^(not in order|confirm|declined)$/i.test(code)) {
    excelByCode.set(code.toUpperCase(), { iso, date: r.Date, policy: String(r["NHIS/ID"] ?? ""), patient: r["Patient Name"] });
  }
}

const dump = JSON.parse(fs.readFileSync(DUMP, "utf8")).rows;
const stamped = dump.filter((r) => {
  const c = String(r.created_at ?? "").slice(0, 10);
  const u = String(r.updated_at ?? "").slice(0, 10);
  return c === STAMP_DAY || u === STAMP_DAY;
});

console.log("Records with created_at or updated_at on", STAMP_DAY, ":", stamped.length);

const fixes = [];
for (const rec of stamped) {
  const code = String(rec.authorization_code ?? "").trim();
  let match = code ? excelByCode.get(code.toUpperCase()) : null;
  if (match && match.iso.slice(0, 10) === STAMP_DAY) {
    continue;
  }
  if (match && match.iso.slice(0, 10) !== STAMP_DAY) {
    fixes.push({ id: rec.id, code, patient: rec.patient_name, policy: rec.policy_number, excelDate: match.date, newIso: match.iso, method: "auth_code" });
    continue;
  }
  if (!code && policyKey(rec.policy_number)) {
    const pk = policyKey(rec.policy_number);
    const pNorm = String(rec.patient_name ?? "").toLowerCase();
    const candidates = excelRows.filter((ex) => policyKey(ex["NHIS/ID"]) === pk);
    const hit = candidates.find((ex) => pNorm.includes(String(ex["Patient Name"] ?? "").toLowerCase().split(" ")[0]));
    const iso = hit ? parseReportDate(hit.Date) : null;
    if (iso && iso.slice(0, 10) !== STAMP_DAY) {
      fixes.push({ id: rec.id, code: "(no code)", patient: rec.patient_name, policy: rec.policy_number, excelDate: hit.Date, newIso: iso, method: "fuzzy" });
    }
  }
}

const byId = new Map();
for (const f of fixes) byId.set(f.id, f);
const list = [...byId.values()];
console.log("Fixes from Excel (not May 20):", list.length);

fs.writeFileSync(
  OUT_CSV,
  ["id,code,policy,patient,excel_date,method", ...list.map((f) => [f.id, f.code, f.policy, `"${String(f.patient).replace(/"/g, "'")}"`, f.excelDate, f.method].join(","))].join("\n"),
);

const esc = (s) => String(s).replace(/'/g, "''");
let sql = `-- Fix ${list.length} rows wrongly stamped ${STAMP_DAY}; align created_at + updated_at to Excel
BEGIN;

ALTER TABLE public.authorization_requests
  DISABLE TRIGGER protect_approved_authorization_requests_trigger;

`;

const CHUNK = 200;
for (let i = 0; i < list.length; i += CHUNK) {
  const chunk = list.slice(i, i + CHUNK);
  sql += `UPDATE public.authorization_requests AS r
SET created_at = f.correct_date, updated_at = f.correct_date
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
