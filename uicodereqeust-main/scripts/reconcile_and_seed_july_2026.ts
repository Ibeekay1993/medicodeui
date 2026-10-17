// Polyfill localStorage for Node execution
if (typeof (globalThis as any).localStorage === "undefined") {
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null,
  };
}

import fs from "node:fs";
import path from "node:path";
import * as XLSXModule from "xlsx";
const XLSX = (XLSXModule as any).default || XLSXModule;
import type {
  NhiaTariffItem,
  HospitalReference,
  HistoricalRawRow
} from "../src/features/dashboard/services/historicalReconciliation";

const ROOT = process.cwd();
const EXCEL_PATH = "C:\\Users\\WINDOWS\\Downloads\\july ao.xlsx";
const TARIFF_MIGRATION = path.join(ROOT, "supabase", "migrations", "20260620090000_fresh_nhia_2025_tariffs.sql");
const HOSPITAL_MIGRATION = path.join(ROOT, "supabase", "migrations", "20260527173000_sync_nhia_accredited_hospitals.sql");
const OUTPUT_MIGRATION = path.join(ROOT, "supabase", "migrations", "20261017103000_seed_july_2026_reconciled_historical_authorisations.sql");

function loadTariffsFromSql(): NhiaTariffItem[] {
  console.log("Loading tariffs from:", TARIFF_MIGRATION);
  const sqlContent = fs.readFileSync(TARIFF_MIGRATION, "utf-8");
  const regex = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*([0-9.]+)\)/g;
  const items: NhiaTariffItem[] = [];
  let match;
  while ((match = regex.exec(sqlContent)) !== null) {
    items.push({
      code: match[1],
      name: match[2],
      category: match[3],
      amount: parseFloat(match[4]),
    });
  }
  console.log(`Parsed ${items.length} active NHIA tariff items.`);
  return items;
}

function loadHospitalsFromSql(): HospitalReference[] {
  console.log("Loading hospitals from:", HOSPITAL_MIGRATION);
  const sqlContent = fs.readFileSync(HOSPITAL_MIGRATION, "utf-8");
  const regex = /\('([^']+)',\s*'([^']+)',\s*'([^']*)',\s*'([^']*)'\)/g;
  const hospitals: HospitalReference[] = [];
  let match;
  while ((match = regex.exec(sqlContent)) !== null) {
    hospitals.push({
      id: match[1], // fallback id
      name: match[2],
      code: match[1],
    });
  }
  console.log(`Parsed ${hospitals.length} accredited hospitals.`);
  return hospitals;
}

function sqlEscape(val: string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "NULL";
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function main() {
  const { reconcileHistoricalBatch } = await import("../src/features/dashboard/services/historicalReconciliation");
  const tariffs = loadTariffsFromSql();
  const hospitals = loadHospitalsFromSql();

  console.log("Reading Excel file:", EXCEL_PATH);
  const buf = fs.readFileSync(EXCEL_PATH);
  const workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const cleanRows = rawRows.filter((r) => r && r.some((c) => String(c).trim() !== ""));
  console.log(`Total rows in Excel: ${cleanRows.length}`);

  let startIndex = 0;
  const firstCol = String(cleanRows[0]?.[0] || "").toLowerCase();
  if (firstCol.includes("date") || firstCol.includes("hospital") || firstCol.includes("sn")) {
    startIndex = 1;
  }

  const parsedRawRows: HistoricalRawRow[] = [];
  for (let i = startIndex; i < cleanRows.length; i++) {
    const r = cleanRows[i];
    parsedRawRows.push({
      date: String(r[0] || "").trim(),
      hospital: String(r[1] || "").trim(),
      patient_name: String(r[2] || "").trim(),
      policy_number: String(r[3] || "").trim(),
      authorization_code: String(r[4] || "").trim(),
      diagnosis: String(r[5] || "").trim(),
      treatment: String(r[6] || "").trim(),
      amount: r[7] ? Number(r[7]) : null,
      phone: String(r[8] || "").trim(),
      status: String(r[9] || "APPROVED").trim(),
      category: String(r[10] || "").trim(),
    });
  }

  console.log(`Executing reconciliation on ${parsedRawRows.length} historical records...`);
  const summary = reconcileHistoricalBatch(parsedRawRows, tariffs, hospitals);

  console.log("\n================ RECONCILIATION SUMMARY ================");
  console.log(`Total Records:          ${summary.totalRecords}`);
  console.log(`Approved:               ${summary.approvedCount}`);
  console.log(`Declined:               ${summary.declinedCount}`);
  console.log(`Pending:                ${summary.pendingCount}`);
  console.log(`Fully Matched:          ${summary.fullyMatchedCount}`);
  console.log(`Needs Review:           ${summary.needsReviewCount}`);
  console.log(`Total Calculated ₦:     ₦${summary.totalCalculatedAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`);
  console.log("========================================================\n");

  const reviewRecords = summary.records.filter((r) => r.reconciliation_status === "needs_review");
  if (reviewRecords.length > 0) {
    console.log("Records needing review:");
    for (const r of reviewRecords) {
      console.log(`- Row ${r.row_number}: ${r.patient_name} (${r.authorization_code || "NO CODE"}) | Status: ${r.status}`);
      console.log(`  Treatment: "${r.treatment}"`);
      console.log(`  Issues: ${r.review_issues.join(", ")}`);
    }
    console.log("");
  }

  // Let's generate the idempotent SQL migration
  const lines: string[] = [
    "-- ============================================================================",
    "-- MIGRATION: 20261017103000_seed_july_2026_reconciled_historical_authorisations.sql",
    "-- Description: Reconciled historical pre-authorisations with NHIA tariffs (July 2026)",
    "-- Source: july ao.xlsx (256 records, 251 approved, 4 declined, 1 pending)",
    "-- Authorisations populate public.authorization_requests for Payment Advice Schedule",
    "-- Does NOT create premature paid claims in hospital_claims or payment_batches",
    "-- ============================================================================",
    "",
    "BEGIN;",
    "",
    "-- Temporarily disable intake-path trigger to allow direct historical seeding",
    "ALTER TABLE public.authorization_requests DISABLE TRIGGER USER;",
    "",
    "-- 1. Identify primary hospital IDs",
    "DO $$",
    "DECLARE",
    "  v_jaja_id UUID;",
    "  v_uch_id UUID;",
    "  v_police_id UUID;",
    "  v_ab10_id UUID;",
    "  v_admin_id UUID;",
    "BEGIN",
    "  -- Look up Jaja Health Clinic",
    "  SELECT id INTO v_jaja_id FROM public.hospitals",
    "  WHERE code IN ('OY/0252/P', 'OY/0267/P', 'UHS-003') OR name ILIKE '%jaja%' OR name ILIKE '%university health%'",
    "  LIMIT 1;",
    "",
    "  -- Look up UCH",
    "  SELECT id INTO v_uch_id FROM public.hospitals",
    "  WHERE code = 'OY/0001/P' OR name ILIKE '%university college hospital%'",
    "  LIMIT 1;",
    "",
    "  -- Look up Police Clinic Eleyele",
    "  SELECT id INTO v_police_id FROM public.hospitals",
    "  WHERE code = 'OY/0231/P' OR name ILIKE '%police clinic%'",
    "  LIMIT 1;",
    "",
    "  -- Look up A.B. 10 Hospital",
    "  SELECT id INTO v_ab10_id FROM public.hospitals",
    "  WHERE code = 'LA/1283/P' OR name ILIKE '%a.b. 10%' OR name ILIKE '%ab 10%'",
    "  LIMIT 1;",
    "",
    "  -- Pick first admin as fallback audit actor",
    "  SELECT user_id INTO v_admin_id FROM public.user_roles WHERE role = 'admin' LIMIT 1;",
    "  IF v_admin_id IS NULL THEN",
    "    SELECT id INTO v_admin_id FROM auth.users LIMIT 1;",
    "  END IF;",
    "",
  ];

  for (const rec of summary.records) {
    const rawAuth = rec.authorization_code;
    const reqId = rec.request_id;
    const pName = sqlEscape(rec.patient_name);
    const polNum = sqlEscape(rec.policy_number);
    const diag = sqlEscape(rec.diagnosis);
    const treat = sqlEscape(rec.treatment);
    const status = sqlEscape(rec.status);
    const itemsJson = sqlEscape(JSON.stringify(rec.approved_items));
    const total = rec.total_amount;
    const decidedAt = sqlEscape(rec.decided_at);
    const authName = sqlEscape(rec.authorized_by_name);

    // Determine hospital UUID expression
    let hospIdExp = "v_jaja_id";
    let reqHospIdExp = "v_jaja_id";
    let refHospIdExp = "NULL";
    let claimHospIdExp = "v_jaja_id";

    if (rec.hospital_name.toUpperCase().includes("COLLEGE HOSPITAL") || rec.claiming_hospital_name?.toUpperCase().includes("COLLEGE HOSPITAL")) {
      hospIdExp = "v_uch_id";
      claimHospIdExp = "v_uch_id";
      if (rec.requesting_hospital_name?.toUpperCase().includes("JAJA")) {
        reqHospIdExp = "v_jaja_id";
        refHospIdExp = "v_uch_id";
      } else {
        reqHospIdExp = "v_uch_id";
      }
    } else if (rec.hospital_name.toUpperCase().includes("POLICE") || rec.claiming_hospital_name?.toUpperCase().includes("POLICE")) {
      hospIdExp = "v_police_id";
      claimHospIdExp = "v_police_id";
      if (rec.requesting_hospital_name?.toUpperCase().includes("JAJA")) {
        reqHospIdExp = "v_jaja_id";
        refHospIdExp = "v_police_id";
      } else {
        reqHospIdExp = "v_police_id";
      }
    } else if (rec.hospital_name.toUpperCase().includes("A.B. 10") || rec.hospital_name.toUpperCase().includes("A. B. 10") || rec.hospital_name.includes("1283")) {
      hospIdExp = "COALESCE(v_ab10_id, v_jaja_id)";
      reqHospIdExp = "COALESCE(v_ab10_id, v_jaja_id)";
      claimHospIdExp = "COALESCE(v_ab10_id, v_jaja_id)";
    }

    const hospName = sqlEscape(rec.hospital_name);
    const reqHospName = sqlEscape(rec.requesting_hospital_name);
    const refHospName = sqlEscape(rec.referred_hospital_name);
    const claimHospName = sqlEscape(rec.claiming_hospital_name);

    if (rawAuth) {
      lines.push(`  -- Row ${rec.row_number}: ${rec.patient_name} (${rawAuth})`);
      lines.push(`  INSERT INTO public.authorization_requests (`);
      lines.push(`    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,`);
      lines.push(`    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,`);
      lines.push(`    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,`);
      lines.push(`    status, source, is_historical, approved_items, total_amount, decided_at,`);
      lines.push(`    authorized_by_name, submitted_by, decided_by, created_at, updated_at`);
      lines.push(`  ) VALUES (`);
      lines.push(`    ${sqlEscape(reqId)}, ${sqlEscape(rawAuth)}, ${pName}, ${polNum}, ${diag}, ${treat},`);
      lines.push(`    ${hospIdExp}, ${hospName}, ${reqHospIdExp}, ${reqHospName},`);
      lines.push(`    ${refHospIdExp}, ${refHospName}, ${claimHospIdExp}, ${claimHospName},`);
      lines.push(`    ${status}, 'historical_import', TRUE, ${itemsJson}::jsonb, ${total}, ${decidedAt}::timestamptz,`);
      lines.push(`    ${authName}, v_admin_id, v_admin_id, ${decidedAt}::timestamptz, now()`);
      lines.push(`  )`);
      lines.push(`  ON CONFLICT (request_id) DO UPDATE SET`);
      lines.push(`    patient_name = EXCLUDED.patient_name,`);
      lines.push(`    policy_number = EXCLUDED.policy_number,`);
      lines.push(`    diagnosis = EXCLUDED.diagnosis,`);
      lines.push(`    treatment = EXCLUDED.treatment,`);
      lines.push(`    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),`);
      lines.push(`    hospital_name = EXCLUDED.hospital_name,`);
      lines.push(`    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),`);
      lines.push(`    requesting_hospital_name = EXCLUDED.requesting_hospital_name,`);
      lines.push(`    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),`);
      lines.push(`    referred_hospital_name = EXCLUDED.referred_hospital_name,`);
      lines.push(`    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),`);
      lines.push(`    claiming_hospital_name = EXCLUDED.claiming_hospital_name,`);
      lines.push(`    status = EXCLUDED.status,`);
      lines.push(`    approved_items = EXCLUDED.approved_items,`);
      lines.push(`    total_amount = EXCLUDED.total_amount,`);
      lines.push(`    decided_at = EXCLUDED.decided_at,`);
      lines.push(`    authorized_by_name = EXCLUDED.authorized_by_name,`);
      lines.push(`    is_historical = TRUE,`);
      lines.push(`    source = 'historical_import',`);
      lines.push(`    updated_at = now();`);
      lines.push("");
    } else {
      // Row with null authorization code (e.g. clinical decline)
      lines.push(`  -- Row ${rec.row_number}: ${rec.patient_name} (DECLINED without code)`);
      lines.push(`  IF NOT EXISTS (SELECT 1 FROM public.authorization_requests WHERE request_id = ${sqlEscape(reqId)}) THEN`);
      lines.push(`    INSERT INTO public.authorization_requests (`);
      lines.push(`      request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,`);
      lines.push(`      hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,`);
      lines.push(`      referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,`);
      lines.push(`      status, source, is_historical, approved_items, total_amount, decided_at,`);
      lines.push(`      authorized_by_name, submitted_by, decided_by, created_at, updated_at`);
      lines.push(`    ) VALUES (`);
      lines.push(`      ${sqlEscape(reqId)}, NULL, ${pName}, ${polNum}, ${diag}, ${treat},`);
      lines.push(`      ${hospIdExp}, ${hospName}, ${reqHospIdExp}, ${reqHospName},`);
      lines.push(`      ${refHospIdExp}, ${refHospName}, ${claimHospIdExp}, ${claimHospName},`);
      lines.push(`      ${status}, 'historical_import', TRUE, ${itemsJson}::jsonb, ${total}, ${decidedAt}::timestamptz,`);
      lines.push(`      ${authName}, v_admin_id, v_admin_id, ${decidedAt}::timestamptz, now()`);
      lines.push(`    );`);
      lines.push(`  END IF;`);
      lines.push("");
    }
  }

  lines.push("  -- Audit log entry");
  lines.push("  INSERT INTO public.audit_logs (");
  lines.push("    action, user_id, details, created_at");
  lines.push("  ) VALUES (");
  lines.push("    'import_historical_authorisations',");
  lines.push("    v_admin_id,");
  lines.push(`    jsonb_build_object('source_file', 'july ao.xlsx', 'total_records', ${summary.totalRecords}, 'approved_count', ${summary.approvedCount}, 'total_amount', ${summary.totalCalculatedAmount}),`);
  lines.push("    now()");
  lines.push("  );");
  lines.push("END $$;");
  lines.push("");
  lines.push("-- Re-enable triggers after historical seeding");
  lines.push("ALTER TABLE public.authorization_requests ENABLE TRIGGER USER;");
  lines.push("");
  lines.push("COMMIT;");

  fs.writeFileSync(OUTPUT_MIGRATION, lines.join("\n"), "utf-8");
  const scriptsCopy = path.join(ROOT, "scripts", "seed_july_2026_reconciled_historical_authorisations.sql");
  fs.writeFileSync(scriptsCopy, lines.join("\n"), "utf-8");
  console.log(`Successfully generated migration file: ${OUTPUT_MIGRATION} and scripts copy: ${scriptsCopy}`);
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
