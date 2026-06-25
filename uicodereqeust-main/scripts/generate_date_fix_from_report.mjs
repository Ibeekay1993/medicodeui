/**
 * Build SQL to fix authorization_requests.created_at from MedAuth Excel report.
 * Uses the "Date" column (Nigerian D/M/Y). Ambiguous 03/10/2025 → March 10, 2025 per workbook owner.
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const REPORT_PATH =
  process.argv[2] ||
  path.join(ROOT, "My personal back till may 9th MedAuth_Report_all_20260509 (1).xlsx");
const OUTPUT_SQL =
  process.argv[3] ||
  path.join(ROOT, "supabase", "migrations", "20260521220000_fix_dates_from_medauth_report.sql");

function collapse(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse slash dates: D/M/Y (Nigeria). Override 3/10/2025 & 03/10/2025 → March 10, 2025. */
function parseReportDate(value) {
  const raw = collapse(value);
  if (!raw) return null;

  if (/^0?3\/0?10\/2025$/i.test(raw)) {
    return "2025-03-10T12:00:00.000Z";
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return null;

  const first = Number(slash[1]);
  const second = Number(slash[2]);
  let year = Number(slash[3]);
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
    // Ambiguous: default D/M/Y (day first)
    day = first;
    month = second;
  }

  const ms = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function sqlEscape(code) {
  return code.replace(/'/g, "''");
}

function main() {
  if (!fs.existsSync(REPORT_PATH)) {
    console.error("Report not found:", REPORT_PATH);
    process.exit(1);
  }

  const wb = XLSX.readFile(REPORT_PATH, { cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });

  const byCode = new Map();
  let skipped = 0;

  for (const row of rows) {
    const code = collapse(row["Auth Code"]);
    const dateRaw = row["Date"];
    if (!code || !dateRaw) {
      skipped++;
      continue;
    }
    const iso = parseReportDate(dateRaw);
    if (!iso) {
      skipped++;
      continue;
    }
    byCode.set(code, iso);
  }

  const entries = [...byCode.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`Parsed ${entries.length} codes from "${sheetName}" (${skipped} rows skipped)`);

  const example = entries.find(([c]) => c === "R/AO/011043150");
  if (example) {
    console.log("R/AO/011043150 →", example[1]);
  }

  const CHUNK = 400;
  let sql = `-- Fix created_at from MedAuth report: ${path.basename(REPORT_PATH)}
-- ${entries.length} authorization codes | Generated ${new Date().toISOString()}
BEGIN;

ALTER TABLE public.authorization_requests
  DISABLE TRIGGER protect_approved_authorization_requests_trigger;

`;

  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    sql += `UPDATE public.authorization_requests AS r
SET created_at = f.correct_date
FROM (VALUES\n`;
    sql += chunk
      .map(([code, iso]) => `  ('${sqlEscape(code)}', '${iso}'::timestamptz)`)
      .join(",\n");
    sql += `
) AS f(auth_code, correct_date)
WHERE r.authorization_code = f.auth_code;

`;
  }

  sql += `ALTER TABLE public.authorization_requests
  ENABLE TRIGGER protect_approved_authorization_requests_trigger;

COMMIT;
`;

  fs.writeFileSync(OUTPUT_SQL, sql, "utf8");
  console.log("Wrote", OUTPUT_SQL);
}

main();
