import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const WORKBOOK_PATH = path.join(ROOT, "supabase", "functions", "google-integration", "ibadan_code.xlsx");
const OUT_MIGRATION = path.join(ROOT, "supabase", "migrations", "20260330193000_single_source_seed_authorization_requests.sql");

const wb = XLSX.readFile(WORKBOOK_PATH);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

function text(v) {
  return String(v ?? "").replace(/\r/g, "").trim();
}

function policy(v) {
  return text(v).replace(/\s+/g, "");
}

function sql(s) {
  return `'${String(s ?? "").replace(/'/g, "''")}'`;
}

function toIsoDate(raw) {
  const value = text(raw);
  if (!value) return null;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const part1 = Number(m[1]);
    const part2 = Number(m[2]);
    const yy = Number(m[3]);
    const year = yy < 100 ? 2000 + yy : yy;
    // 4-digit years in this workbook are mostly US-style MM/DD/YYYY.
    if (m[3].length === 4) {
      const monthFirst = new Date(Date.UTC(year, part1 - 1, part2, 0, 0, 0));
      if (!Number.isNaN(monthFirst.getTime())) return monthFirst.toISOString();
    }
    // 2-digit years are mostly DD/MM/YY.
    const dayFirst = new Date(Date.UTC(year, part2 - 1, part1, 0, 0, 0));
    if (!Number.isNaN(dayFirst.getTime())) return dayFirst.toISOString();
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function normalizeStatus(statusRaw, authCodeRaw) {
  const status = text(statusRaw).toLowerCase();
  const code = text(authCodeRaw).toLowerCase();
  const hasCode = code && !["pending", "-", "null", "undefined", "none"].includes(code);
  if (status.includes("defer")) return "deferred";
  if (status.includes("declin") || status.includes("reject")) return "rejected";
  if (hasCode) return "approved";
  if (status.includes("code received") || status.includes("approv")) return "approved";
  if (status.includes("pending")) return "pending";
  return hasCode ? "approved" : "rejected";
}

const deduped = new Map();
for (let i = 1; i < rows.length; i += 1) {
  const row = rows[i] || [];
  const date = text(row[0]);
  const hospital = text(row[1]);
  const patient = text(row[2]);
  const policyNo = policy(row[3]);
  const authCode = text(row[4]);
  const diagnosisServices = text(row[5]);
  const officer = text(row[6]);
  const note = text(row[7]);
  const statusLabel = text(row[8]);

  if (!patient && !policyNo && !authCode) continue;

  const iso = toIsoDate(date) || new Date().toISOString();
  const status = normalizeStatus(statusLabel, authCode);
  const requestId = `seed:${policyNo || "na"}:${authCode || "pending"}:${date || "nodate"}:${patient || "noname"}`;

  deduped.set(
    requestId,
    `(${sql(requestId)}, ${sql(patient || "Unknown")}, ${sql(policyNo)}, ${sql(diagnosisServices || "No DX")}, ${sql(diagnosisServices || "No TX")}, ${sql(hospital)}, ${authCode ? sql(authCode) : "NULL"}, ${sql(status)}, ${sql(officer)}, NULL, ${note ? sql(note) : "NULL"}, ${note ? sql(note) : "NULL"}, ${sql("workbook_import")}, ${sql(iso)}, ${sql(iso)}, ${sql(iso)})`
  );
}
const values = Array.from(deduped.values());

const sqlBody = `-- Generated from scripts/generate_workbook_seed_migration.mjs
begin;

do $$
begin
  if to_regclass('public.authorization_requests_backup_20260330') is null then
    create table public.authorization_requests_backup_20260330 as
    table public.authorization_requests with data;
  end if;
end $$;

delete from public.authorization_requests
where source in ('sheet_history', 'ibadan_workbook', 'workbook_import');

insert into public.authorization_requests (
  request_id,
  patient_name,
  policy_number,
  diagnosis,
  treatment,
  hospital_name,
  authorization_code,
  status,
  doctor_name,
  submitted_by,
  decision_reason,
  clinical_notes,
  source,
  created_at,
  updated_at,
  decided_at
) values
${values.join(",\n")}
on conflict (request_id) do update set
  patient_name = excluded.patient_name,
  policy_number = excluded.policy_number,
  diagnosis = excluded.diagnosis,
  treatment = excluded.treatment,
  hospital_name = excluded.hospital_name,
  authorization_code = excluded.authorization_code,
  status = excluded.status,
  doctor_name = excluded.doctor_name,
  submitted_by = excluded.submitted_by,
  decision_reason = excluded.decision_reason,
  clinical_notes = excluded.clinical_notes,
  source = excluded.source,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  decided_at = excluded.decided_at;

commit;
`;

fs.writeFileSync(OUT_MIGRATION, sqlBody, "utf8");
console.log(`Wrote migration: ${OUT_MIGRATION}`);
console.log(`Seed rows: ${values.length}`);
