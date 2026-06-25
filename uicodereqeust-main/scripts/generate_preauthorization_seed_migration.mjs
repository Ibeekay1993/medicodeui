import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const INPUT_WORKBOOK = process.argv[2] || path.join(ROOT, "preauthorization-report-1774985665692.xlsx");
const OUTPUT_MIGRATION =
  process.argv[3] ||
  path.join(ROOT, "supabase", "migrations", "20260401120000_seed_preauthorization_2025_workbook.sql");

function text(value) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

function collapse(value) {
  return text(value).replace(/\s+/g, " ");
}

function compactPolicy(value) {
  return text(value).replace(/\s+/g, "");
}

function sql(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeHeader(value) {
  return collapse(value)
    .toLowerCase()
    .replace(/\uFEFF/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeStatus(statusRaw, authCodeRaw) {
  const status = collapse(statusRaw).toLowerCase();
  const code = collapse(authCodeRaw).toLowerCase();
  const hasCode = Boolean(code) && !["-", "pending", "null", "undefined", "none"].includes(code);

  if (status.includes("reject") || status.includes("declin")) return "rejected";
  if (status.includes("defer")) return "deferred";
  if (hasCode) return "approved";
  if (status.includes("approv") || status.includes("active") || status.includes("code received")) return "approved";
  if (status.includes("pending")) return "pending";
  return hasCode ? "approved" : "pending";
}

function excelSerialToIso(serial) {
  const value = Number(serial);
  if (!Number.isFinite(value)) return null;
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return null;
  const ms = Date.UTC(
    parsed.y,
    parsed.m - 1,
    parsed.d,
    parsed.H ?? 0,
    parsed.M ?? 0,
    Math.floor(parsed.S ?? 0),
    Math.round(((parsed.S ?? 0) - Math.floor(parsed.S ?? 0)) * 1000),
  );
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseLooseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return excelSerialToIso(value);

  const raw = collapse(value);
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) return excelSerialToIso(Number(raw));

  // Nigerian / UK style: D/M/Y (day/month/year)
  if (/^0?3\/0?10\/2025$/i.test(raw)) {
    return new Date(Date.UTC(2025, 2, 10, 12, 0, 0)).toISOString();
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const yearValue = Number(slash[3]);
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;

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

    const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeDateLabel(value) {
  const iso = parseLooseDate(value);
  return iso ? iso : collapse(value);
}

function metaLine(label, value) {
  const compact = collapse(value);
  return compact ? `${label}: ${compact}` : "";
}

function buildClinicalNotes(row) {
  const parts = [
    metaLine("Family status", row.family_status),
    metaLine("Gender", row.gender),
    metaLine("Age", row.age),
    metaLine("Company", row.company),
    metaLine("Provider code issued to", row.provider_code_issued_to),
    metaLine("Reason for code", row.reason_for_code),
    metaLine("Retainer", row.retainer),
    metaLine("Issued by", row.issued_by),
  ].filter(Boolean);

  return parts.join(" | ") || null;
}

function buildDecisionReason(row) {
  const reason = collapse(row.reason_for_code);
  if (reason) return reason;
  const fallback = [row.family_status, row.company, row.retainer].map(collapse).filter(Boolean).join(" | ");
  return fallback || null;
}

function buildRequestId(row) {
  const date = normalizeDateLabel(row.date_issued) || "nodate";
  const policy = compactPolicy(row.policy_number) || "na";
  const code = collapse(row.authorization_code) || "pending";
  const name = collapse(row.patient_name) || "noname";
  return `preauth2025:${policy}:${code}:${date}:${name}`;
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const headerLine = rows[i].map((cell) => normalizeHeader(cell));
    if (headerLine.some((cell) => cell.includes("policy_enrollee_number"))) {
      return i;
    }
  }
  return 0;
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && collapse(row[key]) !== "") {
      return row[key];
    }
  }
  return "";
}

function mapRow(rawRow) {
  const row = Object.fromEntries(Object.entries(rawRow).map(([key, value]) => [normalizeHeader(key), value]));
  const fallbackIso = new Date().toISOString();

  const policy_number = compactPolicy(pick(row, ["policy_enrollee_number", "policy_number", "policy", "enrollee_number"]));
  const patient_name = collapse(pick(row, ["enrollee_name", "patient_name", "name"]));
  const authorization_code = collapse(
    pick(row, ["pre_authorization_code", "preauthorization_code", "authorization_code", "code"]),
  );
  const diagnosis = collapse(pick(row, ["diagnosis"]));
  const services = collapse(pick(row, ["services", "service", "treatment"]));
  const primary_provider = collapse(pick(row, ["primary_provider", "provider", "hospital", "facility"]));
  const statusRaw = collapse(pick(row, ["current_status", "status"]));
  const dateIssued = pick(row, ["date_issued", "issued_date", "date"]);

  if (!policy_number && !patient_name && !authorization_code) return null;

  const mapped = {
    policy_number,
    patient_name,
    authorization_code,
    diagnosis: diagnosis || services || "Not specified",
    treatment: services || diagnosis || "Not specified",
    hospital_name: primary_provider || "Unknown",
    status: normalizeStatus(statusRaw, authorization_code),
    doctor_name: collapse(pick(row, ["issued_by"])) || null,
    submitted_by: null,
    decision_reason: buildDecisionReason({
      reason_for_code: pick(row, ["reason_for_code"]),
      family_status: pick(row, ["family_status"]),
      company: pick(row, ["company"]),
      retainer: pick(row, ["retainer"]),
    }),
    clinical_notes: buildClinicalNotes({
      family_status: pick(row, ["family_status"]),
      gender: pick(row, ["gender"]),
      age: pick(row, ["age"]),
      company: pick(row, ["company"]),
      provider_code_issued_to: pick(row, ["provider_code_issued_to"]),
      reason_for_code: pick(row, ["reason_for_code"]),
      retainer: pick(row, ["retainer"]),
      issued_by: pick(row, ["issued_by"]),
    }),
    source: "preauthorization_2025_workbook",
    created_at: normalizeDateLabel(dateIssued) || fallbackIso,
    updated_at: normalizeDateLabel(dateIssued) || fallbackIso,
    decided_at: normalizeDateLabel(dateIssued) || fallbackIso,
    request_id: buildRequestId({
      policy_number,
      patient_name,
      authorization_code,
      date_issued: dateIssued,
    }),
  };

  return mapped;
}

function quoteValue(value) {
  return sql(value);
}

const workbookPath = path.resolve(INPUT_WORKBOOK);
if (!fs.existsSync(workbookPath)) {
  throw new Error(`Workbook not found: ${workbookPath}`);
}

const workbook = XLSX.readFile(workbookPath, { cellDates: false });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
if (!sheet) {
  throw new Error("No worksheet found in workbook");
}

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
const headerRowIndex = findHeaderRow(rows);
const headers = rows[headerRowIndex].map((cell) => normalizeHeader(cell));
const dataRows = rows.slice(headerRowIndex + 1);

const deduped = new Map();

for (const rawRow of dataRows) {
  const values = Object.fromEntries(headers.map((header, index) => [header, rawRow[index] ?? ""]));
  const mapped = mapRow(values);
  if (!mapped) continue;
  deduped.set(mapped.request_id, mapped);
}

const values = Array.from(deduped.values()).map(
  (row) => `(${[
    quoteValue(row.request_id),
    quoteValue(row.patient_name || "Unknown"),
    quoteValue(row.policy_number),
    quoteValue(row.diagnosis),
    quoteValue(row.treatment),
    quoteValue(row.hospital_name),
    quoteValue(row.authorization_code),
    quoteValue(row.status),
    quoteValue(row.doctor_name),
    quoteValue(row.submitted_by),
    quoteValue(row.decision_reason),
    quoteValue(row.clinical_notes),
    quoteValue(row.source),
    quoteValue(row.created_at),
    quoteValue(row.updated_at),
    quoteValue(row.decided_at),
  ].join(", ")})`,
);

if (!values.length) {
  throw new Error("No importable rows were found in the workbook");
}

const sqlBody = `-- Generated from scripts/generate_preauthorization_seed_migration.mjs
begin;

delete from public.authorization_requests
where source = 'preauthorization_2025_workbook';

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

fs.writeFileSync(path.resolve(OUTPUT_MIGRATION), sqlBody, "utf8");
console.log(`Wrote migration: ${path.resolve(OUTPUT_MIGRATION)}`);
console.log(`Imported rows: ${values.length}`);
