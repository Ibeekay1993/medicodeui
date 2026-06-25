const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

function normalizeCode(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

const supportedFields = [
  "record_type", "original_code", "beneficiary_code", "policy_number",
  "authorization_code", "claim_number", "hospital_code", "provider_code",
  "invoice_number", "payment_reference", "patient_name", "hospital_name",
  "date_of_birth", "legacy_creation_date",
];

function guessField(header) {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (supportedFields.includes(normalized)) return normalized;
  if (normalized.includes("auth")) return "authorization_code";
  if (normalized.includes("claim")) return "claim_number";
  if (normalized.includes("policy")) return "policy_number";
  if (normalized.includes("beneficiary") || normalized.includes("enrollee")) return "beneficiary_code";
  if (normalized.includes("hospital")) return normalized.includes("name") ? "hospital_name" : "hospital_code";
  if (normalized.includes("payment")) return "payment_reference";
  if (normalized === "code" || normalized.includes("legacy_code")) return "original_code";
  return "";
}

async function run() {
  const excelFile = path.join(__dirname, "../update to merge for mssing cde.xlsx");
  if (!fs.existsSync(excelFile)) {
    console.error("File not found:", excelFile);
    return;
  }

  console.log("Reading Excel file...");
  const workbook = XLSX.readFile(excelFile, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const predefinedHeaders = ["legacy_creation_date", "hospital_name", "patient_name", "policy_number", "authorization_code", "diagnosis"];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: predefinedHeaders, defval: "" });

  if (rows.length === 0) {
    console.log("No rows found.");
    return;
  }

  const mappedRows = rows.map(row => {
    const output = { ...row };
    const bestCode = output.original_code || output.authorization_code || output.claim_number || output.policy_number || output.beneficiary_code || output.hospital_code || output.payment_reference;
    output.original_code = bestCode;
    output.record_type = output.record_type || (
      output.authorization_code ? "authorization" :
      output.claim_number ? "claim" :
      output.policy_number ? "policy" :
      output.beneficiary_code ? "beneficiary" :
      output.hospital_code ? "hospital" :
      output.payment_reference ? "payment" :
      "code"
    );
    return output;
  });

  console.log(`Processed ${mappedRows.length} mapped rows.`);

  const CHUNK_SIZE = 1000;
  let sql = `BEGIN;\n\nDO $$\nDECLARE\n  admin_id uuid;\nBEGIN\n  SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin' LIMIT 1;\n  IF admin_id IS NULL THEN\n    RAISE EXCEPTION 'No admin user found to attribute import to.';\n  END IF;\n\n  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', admin_id)::text, true);\n  PERFORM set_config('role', 'authenticated', true);\n\n`;

  for (let i = 0; i < mappedRows.length; i += CHUNK_SIZE) {
    const chunk = mappedRows.slice(i, i + CHUNK_SIZE);
    const escapedJson = JSON.stringify(chunk).replace(/'/g, "''");
    sql += `  PERFORM public.import_historical_codes('update to merge for mssing cde.xlsx (Part ${Math.floor(i / CHUNK_SIZE) + 1})', '${escapedJson}'::jsonb);\n`;
  }

  sql += `END $$;\n\nCOMMIT;\n`;

  const migrationPath = path.join(__dirname, "../supabase/migrations/20260518120000_seed_historical_codes_from_xlsx.sql");
  fs.writeFileSync(migrationPath, sql);
  console.log("Migration generated at:", migrationPath);
}

run();
