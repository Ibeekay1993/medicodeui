import { supabase } from "@/integrations/supabase/client";

export interface NhiaTariffItem {
  code: string;
  name: string;
  category: string;
  amount: number;
}

export interface HospitalReference {
  id: string;
  name: string;
  code: string;
}

export interface HistoricalRawRow {
  date: string;
  hospital: string;
  patient_name: string;
  policy_number: string;
  authorization_code?: string;
  diagnosis: string;
  treatment: string;
  amount?: number | null;
  phone?: string;
  status: string;
  category?: string;
}

export interface HistoricalMatchedItem {
  code: string;
  name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  confidence: "high" | "medium" | "manual";
  source_term: string;
  declined?: boolean;
}

export interface HistoricalReconciledRecord {
  row_number: number;
  authorization_code: string | null;
  request_id: string;
  patient_name: string;
  policy_number: string;
  hospital_id: string | null;
  hospital_name: string;
  requesting_hospital_id: string | null;
  requesting_hospital_name: string;
  referred_hospital_id: string | null;
  referred_hospital_name: string | null;
  claiming_hospital_id: string | null;
  claiming_hospital_name: string | null;
  diagnosis: string;
  treatment: string;
  raw_treatment?: string;
  status: "approved" | "declined" | "pending";
  raw_status: string;
  decided_at: string;
  approved_items: HistoricalMatchedItem[];
  total_amount: number;
  authorized_by_name: string;
  reconciliation_status: "matched" | "needs_review" | "confirmed";
  review_issues: string[];
}

export interface ReconciliationBatchSummary {
  totalRecords: number;
  approvedCount: number;
  declinedCount: number;
  pendingCount: number;
  fullyMatchedCount: number;
  needsReviewCount: number;
  totalCalculatedAmount: number;
  records: HistoricalReconciledRecord[];
}

// ── STANDARD PRESETS ─────────────────────────────────────────────────────────

export const OPTICAL_BUNDLE: HistoricalMatchedItem[] = [
  {
    code: "NHIA-010-001",
    name: "Specialist Initial Consultation",
    quantity: 1,
    unit_price: 4000.0,
    amount: 4000.0,
    confidence: "high",
    source_term: "Consultation",
  },
  {
    code: "NHIA-081-001",
    name: "Manual Refraction",
    quantity: 1,
    unit_price: 3000.0,
    amount: 3000.0,
    confidence: "high",
    source_term: "Manual Refraction",
  },
  {
    code: "NHIA-081-015",
    name: "Low-priced spectacles/contact lens - frame and lens",
    quantity: 1,
    unit_price: 20000.0,
    amount: 20000.0,
    confidence: "high",
    source_term: "Glasses",
  },
];

export const PHYSIOTHERAPY_RATE = 7500.0;

export const LAB_MAP: Record<string, { code: string; name: string; amount: number }> = {
  ecg: { code: "NHIA-040-008", name: "Electrocardiography (ECG)", amount: 10000.0 },
  flp: { code: "NHIA-181-018", name: "Total Cholesterol 2,500.00 Total Lipid Profile (a-d)", amount: 6000.0 },
  lipid: { code: "NHIA-181-018", name: "Total Cholesterol 2,500.00 Total Lipid Profile (a-d)", amount: 6000.0 },
  psa: { code: "NHIA-181-082", name: "Prostate Specific Antigen (PSA): (a - b)", amount: 15000.0 },
  hba1c: { code: "NHIA-181-046", name: "Glycated Hemoglobin (HbA1c)", amount: 10000.0 },
  hbalc: { code: "NHIA-181-046", name: "Glycated Hemoglobin (HbA1c)", amount: 10000.0 },
  hbaic: { code: "NHIA-181-046", name: "Glycated Hemoglobin (HbA1c)", amount: 10000.0 },
  "e/u/cr": { code: "NHIA-181-030", name: "Electrolytes, Urea and Creatinine", amount: 9000.0 },
  "e/u": { code: "NHIA-181-030", name: "Electrolytes, Urea and Creatinine", amount: 9000.0 },
  eucr: { code: "NHIA-181-030", name: "Electrolytes, Urea and Creatinine", amount: 9000.0 },
  "serum e/u": { code: "NHIA-181-030", name: "Electrolytes, Urea and Creatinine", amount: 9000.0 },
  "urine mcs": { code: "NHIA-183-005", name: "b) Microscopy, Culture & Sensitivity", amount: 4000.0 },
  "stool microscopy": { code: "NHIA-183-004", name: "a) Microscopy R/E only", amount: 2314.29 },
  scan: { code: "NHIA-179-006", name: "Abdominal Pelvic Scan", amount: 8500.0 },
  uss: { code: "NHIA-179-006", name: "Abdominal Pelvic Scan", amount: 8500.0 },
  "x-ray": { code: "NHIA-173-001", name: "Chest (PA/AP) (1 view)", amount: 6000.0 },
  xray: { code: "NHIA-173-001", name: "Chest (PA/AP) (1 view)", amount: 6000.0 },
  hbsag: { code: "NHIA-184-004", name: "Hepatitis B Surface Antigen (HbsAg)", amount: 4628.57 },
  "anti-hcv": { code: "NHIA-184-013", name: "Hepatitis C Antibody (HCVAb)", amount: 11112.5 },
  rvs: { code: "NHIA-184-009", name: "HIV Screening", amount: 9992.86 },
  "pap smear": { code: "NHIA-185-005", name: "Pap Smear", amount: 11320.0 },
  mammogram: { code: "NHIA-178-025", name: "Mammogram", amount: 26770.0 },
  "semen analysis": { code: "NHIA-183-013", name: "a) Semen Analysis", amount: 4527.78 },
  tonometry: { code: "NHIA-081-003", name: "Tonometry (Pulsair/Goldmann Applanation)", amount: 4562.5 },
  "direct ophthalmoscopy": { code: "NHIA-081-007", name: "Direct Ophthalmoscopy", amount: 4000.0 },
  ophthalmoscopy: { code: "NHIA-081-007", name: "Direct Ophthalmoscopy", amount: 4000.0 },
  "d.o": { code: "NHIA-081-007", name: "Direct Ophthalmoscopy", amount: 4000.0 },
  "d/o": { code: "NHIA-081-007", name: "Direct Ophthalmoscopy", amount: 4000.0 },
  "specialist consultation": { code: "NHIA-010-001", name: "Specialist Initial Consultation", amount: 4000.0 },
  consultation: { code: "NHIA-010-001", name: "Specialist Initial Consultation", amount: 4000.0 },
  "initial consultation": { code: "NHIA-010-001", name: "Specialist Initial Consultation", amount: 4000.0 },
  "specialist initial consultation": { code: "NHIA-010-001", name: "Specialist Initial Consultation", amount: 4000.0 },
  consult: { code: "NHIA-010-001", name: "Specialist Initial Consultation", amount: 4000.0 },
  "follow up": { code: "NHIA-010-002", name: "Specialist Review (Per visit)", amount: 2600.0 },
  "follow-up": { code: "NHIA-010-002", name: "Specialist Review (Per visit)", amount: 2600.0 },
  "follw up": { code: "NHIA-010-002", name: "Specialist Review (Per visit)", amount: 2600.0 },
  review: { code: "NHIA-010-002", name: "Specialist Review (Per visit)", amount: 2600.0 },
  "specialist review": { code: "NHIA-010-002", name: "Specialist Review (Per visit)", amount: 2600.0 },
};

export const BRAND_MAP: Record<string, { code: string; name: string; amount: number }> = {
  vasoprin: { code: "NHIA-11-03-01", name: "Acetylsalicylic acid Tablet 75 mg Tab", amount: 11.0 },
  moduretic: { code: "NHIA-12-03-01", name: "Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab", amount: 36.0 },
  aldomet: { code: "NHIA-12-04-51", name: "Methyldopa Tablet 500mg Tablet", amount: 69.0 },
  daonil: { code: "NHIA-17-06-14", name: "Glibenclamide Tablets 5mg Tab", amount: 28.0 },
  tegretol: { code: "NHIA-05-01-01", name: "Carbamazepine Tablet 200mg Tab.", amount: 149.0 },
  avsar: { code: "NHIA-12-04-04", name: "Amlodipine + Valsartan Tablet 5 mg + 160mg Tab", amount: 280.0 },
  neurovite: { code: "NHIA-25-01-20", name: "Vitamin B Complex Tablets/Capsules Tab.", amount: 6.0 },
  lantus: { code: "NHIA-17-06-03", name: "Insulin Soluble Injection 100 units/ml Vial", amount: 12474.0 },
  insulin: { code: "NHIA-17-06-03", name: "Insulin Soluble Injection 100 units/ml Vial", amount: 12474.0 },
  insulisn: { code: "NHIA-17-06-03", name: "Insulin Soluble Injection 100 units/ml Vial", amount: 12474.0 },
  hct: { code: "NHIA-12-03-05", name: "Hydrochlorothiazide Tablet 25mg Tab.", amount: 40.0 },
  htc: { code: "NHIA-12-03-05", name: "Hydrochlorothiazide Tablet 25mg Tab.", amount: 40.0 },
  amiloride: { code: "NHIA-12-03-01", name: "Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab", amount: 36.0 },
  indapamide: { code: "NHIA-12-04-31", name: "Indapamide 1.5mg tab Tab 1.5mg Tab", amount: 310.0 },
  indapimide: { code: "NHIA-12-04-31", name: "Indapamide 1.5mg tab Tab 1.5mg Tab", amount: 310.0 },
  tamsulosin: { code: "NHIA-17-08-03", name: "Tamsulosin Tablet 400mcg Tab", amount: 439.0 },
  benxehexol: { code: "NHIA-09-01-02", name: "Benzhexol Tablets 5 mg (as HCl) Tab.", amount: 16.0 },
  chlorpromazine: { code: "NHIA-23-03-06", name: "Chlorpromazine Tablet 100mg (HCL) Tab.", amount: 82.0 },
  clopidogrel: { code: "NHIA-11-03-04", name: "Clopidogrel Tablet 75mg Tab.", amount: 190.0 },
};

// ── CLINICAL TEXT CLEANING & PARSING ─────────────────────────────────────────

export function cleanClinicalText(value: unknown): string {
  let t = String(value || "").trim();
  // Fix typos like 12.,5mg or 12 .5mg -> 12.5mg
  t = t.replace(/(\d+)\s*\.\s*,\s*(\d+)/g, "$1.$2");
  t = t.replace(/(\d+)\s*\.\s*(\d+)/g, "$1.$2");
  // Fix unspaced words like Methyldopa500mg -> Methyldopa 500mg
  t = t.replace(/([A-Za-z]+)(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml))/g, "$1 $2");
  // Fix backslashes in durations 1\12 -> 1/12
  t = t.replace(/\\/g, "/");
  // Normalize multipliers e.g. x1/12 -> x 1/12
  t = t.replace(/\s*x\s*(\d+)/gi, " x $1");
  // Normalize 1g / 2g to 1000mg / 2000mg so strength matches exactly
  t = t.replace(/\b1\s*g\b/gi, "1000mg");
  t = t.replace(/\b2\s*g\b/gi, "2000mg");
  // Normalize drug spelling variants to ensure generic matching with correct mg:
  t = t.replace(/\b(?:artovastatin|atovastatin)\b/gi, "atorvastatin");
  t = t.replace(/\bamlodipne\b/gi, "amlodipine");
  t = t.replace(/\blorsatan\b/gi, "losartan");
  t = t.replace(/\bglibenciamide\b/gi, "glibenclamide");
  t = t.replace(/\bmetroprolol\b/gi, "metoprolol");
  t = t.replace(/\blabetelol\b/gi, "labetalol");
  t = t.replace(/\bdonapezil\b/gi, "donepezil");
  t = t.replace(/\bbisoporol\b/gi, "bisoprolol");
  t = t.replace(/\b(?:temisartan|telmisitan)\b/gi, "telmisartan");
  t = t.replace(/\bchlopidogrel\b/gi, "clopidogrel");
  // Normalize common brands that carry variable strengths:
  t = t.replace(/\bamaryl\b/gi, "glimepiride");
  t = t.replace(/\bnorvasc\b/gi, "amlodipine");
  t = t.replace(/\bcozaar\b/gi, "losartan");
  t = t.replace(/\bglucophage\b/gi, "metformin");
  t = t.replace(/\bamilode\b/gi, "amiloride");
  t = t.replace(/\blatus\b/gi, "lantus");

  // Automatically insert boundary comma between unseparated drug lines
  // (e.g. "...x 1/12 Tab Indapamide..." or "...10mg bd x 1/12 Tab Amlodipine...")
  t = t.replace(/(\b(?:1\/12|2\/12|3\/12|1\/52|2\/52|3\/52|4\/52|5\/52|5\/7|3\/7|7\/7|10\/7|14\/7|dly|daily|bd|tds|tid|qid|nocte|mane|od|\d+mg|\d+g|\d+\s*tabs?)\b|\))\s+(?=(?:Tab|Cap|Inj)\s+[A-Za-z])/gi, "$1, ");

  return t;
}

export function extractMedicationQuantity(text: string): number {
  // 1. Detect discrete unit-based prescriptions (1 pen, 1 cartridge, 1 vial, 1 inhaler, 2 pens)
  const unitMatch = text.match(
    /\b(\d+)\s*(?:pens?|cartridges?|vials?|ampoules?|inhalers?|prefilled\s*syringes?|auto[- ]?injectors?)\b/i
  );
  if (unitMatch) {
    const qty = parseInt(unitMatch[1], 10);
    if (!isNaN(qty) && qty > 0) return Math.min(qty, 600);
  }

  // 2. Check for explicit total supply count enclosed in parentheses or with 'each'
  // e.g. "(30 tabs)", "(60 tabs)", "(14 tabs each)", "30 tabs each"
  const explicit = Array.from(text.matchAll(/(?:\(\s*(\d+)\s*(?:tabs?|tablets?|caps?|capsules?|each)\b[^\)]*\)|\b(\d+)\s*(?:tabs?|tablets?|caps?|capsules?)\s+each\b)/gi));
  if (explicit.length > 0) {
    const match = explicit[explicit.length - 1];
    const qty = parseInt(match[1] || match[2], 10);
    if (!isNaN(qty) && qty > 0) return Math.min(qty, 600);
  }

  let days = 30;
  const dur = text.match(/(\d+)\s*[/\\]\s*(12|52|7)/);
  if (dur) {
    const num = parseInt(dur[1], 10);
    const denom = parseInt(dur[2], 10);
    if (denom === 12) days = num * 30;
    else if (denom === 52) days = num * 7;
    else if (denom === 7) days = num;
  }

  let freq = 1;
  if (/\b(bd|b\.d|bid|twice)\b/i.test(text)) freq = 2;
  else if (/\b(tds|tid|t\.i\.d|three)\b/i.test(text)) freq = 3;
  else if (/\b(qid|four)\b/i.test(text)) freq = 4;
  else if (/\b(dly|daily|nocte|mane|od|once)\b/i.test(text)) freq = 1;

  let dose = 1;
  const multiDose = text.match(/\b([1-4])\s*(?:tabs?|tablets?|caps?|capsules?)\s*(?:bd|b\.d|bid|tds|tid|qid|dly|daily|nocte|mane)\b/i);
  if (multiDose) {
    dose = parseInt(multiDose[1], 10);
  }

  return Math.max(1, Math.min(days * freq * dose, 600));
}

// ── HOSPITAL RESOLUTION ──────────────────────────────────────────────────────

export function resolveHospitalEntities(
  rawHospital: string,
  hospitals: HospitalReference[]
): {
  hospital_id: string | null;
  hospital_name: string;
  requesting_hospital_id: string | null;
  requesting_hospital_name: string;
  referred_hospital_id: string | null;
  referred_hospital_name: string | null;
  claiming_hospital_id: string | null;
  claiming_hospital_name: string | null;
} {
  const norm = rawHospital.trim();
  const lower = norm.toLowerCase();

  // Find Jaja Clinic
  const jaja = hospitals.find(
    (h) => h.code === "OY/0252/P" || (h.name.toLowerCase().includes("jaja") && h.name.toLowerCase().includes("ibadan"))
  ) || { id: "OY/0252/P", name: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)", code: "OY/0252/P" };

  // Find UCH
  const uch = hospitals.find(
    (h) => h.code === "OY/0001/P" || (h.name.toLowerCase().includes("university college hospital") && !h.name.toLowerCase().includes("jaja"))
  ) || { id: "OY/0001/P", name: "UNIVERSITY COLLEGE HOSPITAL", code: "OY/0001/P" };

  // Find Police Clinic
  const police = hospitals.find(
    (h) => h.code.startsWith("OY/") && h.name.toLowerCase().includes("police")
  ) || hospitals.find((h) => h.name.toLowerCase().includes("police clinic")) || {
    id: "OY/0231/P",
    name: "POLICE CLINIC HOSPITAL ELEYELE",
    code: "OY/0231/P",
  };

  // 1. UCH (Direct or Referral from Jaja)
  if (lower.includes("university college hospital") || lower.includes("oy/0001") || lower.includes("college hospital") || lower.includes("uch")) {
    const isReferralFromJaja = lower.includes("referral") || lower.includes("refferal") || lower.includes("health service") || lower.includes("jaja");
    return {
      hospital_id: uch.id,
      hospital_name: uch.name,
      requesting_hospital_id: isReferralFromJaja ? jaja.id : uch.id,
      requesting_hospital_name: isReferralFromJaja ? jaja.name : uch.name,
      referred_hospital_id: isReferralFromJaja ? uch.id : null,
      referred_hospital_name: isReferralFromJaja ? uch.name : null,
      claiming_hospital_id: uch.id,
      claiming_hospital_name: uch.name,
    };
  }

  // 2. Police Clinic (Direct or Referral from Jaja)
  if (lower.includes("police")) {
    const isReferralFromJaja = lower.includes("referral") || lower.includes("refferal") || lower.includes("health service") || lower.includes("jaja");
    return {
      hospital_id: police.id,
      hospital_name: police.name,
      requesting_hospital_id: isReferralFromJaja ? jaja.id : police.id,
      requesting_hospital_name: isReferralFromJaja ? jaja.name : police.name,
      referred_hospital_id: isReferralFromJaja ? police.id : null,
      referred_hospital_name: isReferralFromJaja ? police.name : null,
      claiming_hospital_id: police.id,
      claiming_hospital_name: police.name,
    };
  }

  // 3. Foremost Base Hospital
  if (lower.includes("foremost")) {
    const foremost = hospitals.find((h) => h.name.toLowerCase().includes("foremost") || h.code === "OY/0348/P");
    const fId = foremost ? foremost.id : "OY/0348/P";
    const fName = foremost ? foremost.name : "FOREMOST BASE HOSPITAL LIMITED";
    return {
      hospital_id: fId,
      hospital_name: fName,
      requesting_hospital_id: fId,
      requesting_hospital_name: fName,
      referred_hospital_id: null,
      referred_hospital_name: null,
      claiming_hospital_id: fId,
      claiming_hospital_name: fName,
    };
  }

  // 4. LA/1283/P (A. B. 10 Hospital)
  if (lower.includes("la/1283") || lower.includes("1283")) {
    const ab = hospitals.find((h) => h.code === "LA/1283/P" || h.name.toLowerCase().includes("a. b. 10"));
    const abId = ab ? ab.id : "LA/1283/P";
    const abName = ab ? ab.name : "A. B. 10 HOSPITAL";
    return {
      hospital_id: abId,
      hospital_name: abName,
      requesting_hospital_id: abId,
      requesting_hospital_name: abName,
      referred_hospital_id: null,
      referred_hospital_name: null,
      claiming_hospital_id: abId,
      claiming_hospital_name: abName,
    };
  }

  // 5. Default Jaja Clinic primary request
  return {
    hospital_id: jaja.id,
    hospital_name: jaja.name,
    requesting_hospital_id: jaja.id,
    requesting_hospital_name: jaja.name,
    referred_hospital_id: null,
    referred_hospital_name: null,
    claiming_hospital_id: jaja.id,
    claiming_hospital_name: jaja.name,
  };
}

export function parseHistoricalDate(rawDate: any): string {
  if (!rawDate) return new Date().toISOString();
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    let year = rawDate.getFullYear();
    if (year < 2000) year += 100;
    return new Date(Date.UTC(year, rawDate.getMonth(), rawDate.getDate(), 12, 0, 0)).toISOString();
  }
  const str = String(rawDate).trim();
  const dMonY = str.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})$/);
  if (dMonY) {
    const day = parseInt(dMonY[1], 10);
    const monthStr = dMonY[2].toLowerCase().slice(0, 3);
    let year = parseInt(dMonY[3], 10);
    if (year < 100) year += 2000;
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = months[monthStr] ?? 6;
    return new Date(Date.UTC(year, month, day, 12, 0, 0)).toISOString();
  }
  const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10) - 1;
    const day = parseInt(ymd[3], 10);
    return new Date(Date.UTC(year, month, day, 12, 0, 0)).toISOString();
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    let year = parsed.getFullYear();
    if (year < 2000) year += 100;
    return new Date(Date.UTC(year, parsed.getMonth(), parsed.getDate(), 12, 0, 0)).toISOString();
  }
  return new Date().toISOString();
}

// ── MAIN RECONCILIATION ENGINE ───────────────────────────────────────────────

export function reconcileHistoricalRow(
  row: HistoricalRawRow,
  rowNumber: number,
  tariffs: NhiaTariffItem[],
  hospitals: HospitalReference[]
): HistoricalReconciledRecord {
  const cleanTreatment = cleanClinicalText(row.treatment);
  const rawStatus = String(row.status || "").trim();
  const upperStatus = rawStatus.toUpperCase();

  const isDeclined = upperStatus.includes("DECLINED");
  const isPending = upperStatus.includes("PENDING");

  const status: "approved" | "declined" | "pending" = isDeclined
    ? "declined"
    : isPending
    ? "pending"
    : "approved";

  let hospEntities = resolveHospitalEntities(row.hospital, hospitals);

  const matchedItems: HistoricalMatchedItem[] = [];
  const reviewIssues: string[] = [];

  // ── DENTAL UCH REFERRAL OVERRIDE ────────────────────────────────────────────
  // Dental procedures such as RPD, dentures, prosthodontics, crown & bridge,
  // root canal treatment, and advanced restorations are performed at the UCH
  // Department of Restorative Dentistry. When the Excel hospital field is Jaja
  // (meaning Jaja initiated the referral but UCH actually performed the work),
  // we promote the claim to UCH as the claiming/treating hospital.
  const isDentalUchProcedure = /rpd|removable\s*partial\s*denture|denture|prosthodontic|kennedy\s*class|implant|crown\s*&\s*bridge|crown\s*and\s*bridge/i.test(cleanTreatment);
  const isJajaHospital = hospEntities.hospital_name.toLowerCase().includes("jaja") ||
    hospEntities.hospital_name.toLowerCase().includes("university of ibadan health service");
  if (isDentalUchProcedure && isJajaHospital) {
    const uch = hospitals.find(
      (h) => h.code === "OY/0001/P" || (h.name.toLowerCase().includes("university college hospital") && !h.name.toLowerCase().includes("jaja"))
    ) || { id: "OY/0001/P", name: "UNIVERSITY COLLEGE HOSPITAL", code: "OY/0001/P" };
    const jaja = hospitals.find(
      (h) => h.code === "OY/0252/P" || (h.name.toLowerCase().includes("jaja") && h.name.toLowerCase().includes("ibadan"))
    ) || { id: "OY/0252/P", name: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)", code: "OY/0252/P" };
    hospEntities = {
      hospital_id: uch.id,
      hospital_name: uch.name,
      requesting_hospital_id: jaja.id,
      requesting_hospital_name: jaja.name,
      referred_hospital_id: uch.id,
      referred_hospital_name: uch.name,
      claiming_hospital_id: uch.id,
      claiming_hospital_name: uch.name,
    };
  }

  const category = String(row.category || "").toLowerCase();
  const cleanLower = cleanTreatment.toLowerCase();

  // If request is declined or pending, no approved items should be payable
  if (isDeclined || isPending) {
    matchedItems.push({
      code: "DECLINED",
      name: row.treatment || "Declined Service",
      quantity: 1,
      unit_price: 0,
      amount: 0,
      confidence: "high",
      source_term: cleanTreatment,
      declined: true,
    });
  } else if (
    (cleanLower.includes("refraction") && cleanLower.includes("glasses")) ||
    ((cleanLower.includes("refraction") || cleanLower.includes("glasses") || cleanLower.includes("ophthalmoscopy") || cleanLower.includes("d.o") || cleanLower.includes("d/o")) &&
      (category.includes("optical") || cleanLower.includes("presbyop") || cleanLower.includes("astigmatism") || cleanLower.includes("eye") || cleanLower.includes("vision") || cleanLower.includes("refractive")))
  ) {
    // 1. Optical Bundle & Procedures
    // Consultation
    if (cleanLower.includes("consult") || cleanLower.includes("specialist") || (!cleanLower.includes("tonometry") && !cleanLower.includes("refraction") && !cleanLower.includes("glasses"))) {
      matchedItems.push({
        code: "NHIA-010-001",
        name: "Specialist Initial Consultation",
        quantity: 1,
        unit_price: 4000.0,
        amount: 4000.0,
        confidence: "high",
        source_term: "Consultation",
      });
    } else {
      matchedItems.push({
        code: "NHIA-010-001",
        name: "Specialist Initial Consultation",
        quantity: 1,
        unit_price: 4000.0,
        amount: 4000.0,
        confidence: "high",
        source_term: "Consultation",
      });
    }

    // Manual Refraction
    if (cleanLower.includes("refraction") || cleanLower.includes("refractiion")) {
      matchedItems.push({
        code: "NHIA-081-001",
        name: "Manual Refraction",
        quantity: 1,
        unit_price: 3000.0,
        amount: 3000.0,
        confidence: "high",
        source_term: "Manual Refraction",
      });
    }

    // Direct Ophthalmoscopy (NHIA-081-007: ₦4,000.00)
    if (
      cleanLower.includes("ophthalmoscopy") ||
      cleanLower.includes("ophthamoscopy") ||
      /\b(d\.o|d\/o)\b/i.test(cleanLower)
    ) {
      matchedItems.push({
        code: "NHIA-081-007",
        name: "Direct Ophthalmoscopy",
        quantity: 1,
        unit_price: 4000.0,
        amount: 4000.0,
        confidence: "high",
        source_term: "Direct Ophthalmoscopy",
      });
    }

    // Tonometry (NHIA-081-003: ₦4,562.50)
    if (cleanLower.includes("tonometry")) {
      matchedItems.push({
        code: "NHIA-081-003",
        name: "Tonometry (Pulsair/Goldmann Applanation)",
        quantity: 1,
        unit_price: 4562.5,
        amount: 4562.5,
        confidence: "high",
        source_term: "Tonometry",
      });
    }

    // Spectacles / Glasses (NHIA-081-015: ₦20,000.00)
    if (cleanLower.includes("glasses") || cleanLower.includes("spectacle") || cleanLower.includes("lens")) {
      matchedItems.push({
        code: "NHIA-081-015",
        name: "Low-priced spectacles/contact lens - frame and lens",
        quantity: 1,
        unit_price: 20000.0,
        amount: 20000.0,
        confidence: "high",
        source_term: "Glasses",
      });
    }
  } else if (cleanLower.includes("physiotherapy") || category.includes("physio")) {
    // 2. Physiotherapy Sessions
    const m = cleanTreatment.match(/(\d+)\s*(?:sessions?|physiotherapy)/i);
    const sessions = m ? parseInt(m[1], 10) : 3;
    matchedItems.push({
      code: "NHIA-133-005",
      name: `Physiotherapy (${sessions} Sessions)`,
      quantity: sessions,
      unit_price: PHYSIOTHERAPY_RATE,
      amount: sessions * PHYSIOTHERAPY_RATE,
      confidence: "high",
      source_term: cleanTreatment,
    });
  } else if (
    cleanTreatment.toUpperCase() === "FOLLOW UP" ||
    cleanTreatment.toUpperCase() === "FOLLW UP" ||
    cleanTreatment.toUpperCase() === "FOLLOW-UP" ||
    cleanTreatment.toUpperCase() === "REVIEW" ||
    cleanTreatment.toUpperCase() === "SPECIALIST REVIEW" ||
    cleanTreatment.toUpperCase().startsWith("FOLLOW UP") ||
    cleanTreatment.toUpperCase().startsWith("FOLLOW-UP")
  ) {
    // 3. Follow up / Specialist Review (Per visit) - ₦2,600.00
    matchedItems.push({
      code: "NHIA-010-002",
      name: "Specialist Review (Per visit)",
      quantity: 1,
      unit_price: 2600.0,
      amount: 2600.0,
      confidence: "high",
      source_term: cleanTreatment,
    });
  } else if (
    cleanTreatment.toUpperCase() === "CONSULT" ||
    cleanTreatment.toUpperCase() === "CONSULTATION" ||
    cleanTreatment.toUpperCase() === "SPECIALIST CONSULTATION" ||
    cleanTreatment.toUpperCase() === "INITIAL CONSULTATION" ||
    cleanTreatment.toUpperCase() === "SPECIALIST INITIAL CONSULTATION"
  ) {
    // 4. Specialist Initial Consultation - ₦4,000.00 (same flow/amount for initial consultation and consultation)
    matchedItems.push({
      code: "NHIA-010-001",
      name: "Specialist Initial Consultation",
      quantity: 1,
      unit_price: 4000.0,
      amount: 4000.0,
      confidence: "high",
      source_term: cleanTreatment,
    });
  } else if (
    category.includes("dental") ||
    /s&p|scaling|extraction|rct|root canal|denture|composite|rpd|kennedy\s*class|removable\s*partial|prosthodontic|curettage|amalgam|fissure\s*seal|fistulect|sequest|pulpal|periodon|periapic|bitewing|panoram|tongue\s*tie|adenoid|cleft|submandib|parotid|thyroglos|tracheost|mandibul|sialoa|salivary|jaw\s*fract|maxillar\s*fract|sequestr/i.test(cleanTreatment)
  ) {
    // ── DENTAL & ORAL SURGERY PROCEDURES ─────────────────────────────────────
    // All codes from the official NHIA 2025 dental tariff schedule

    // ── Dental Radiology ──────────────────────────────────────────────────────
    if (/periapical\s*(?:x[- ]?ray)?/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-001",
        name: "Periapical X-Ray",
        quantity: 1,
        unit_price: 5000.0,
        amount: 5000.0,
        confidence: "high",
        source_term: "Periapical X-Ray",
      });
    }
    if (/bitewing/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-002",
        name: "Bitewings (X-Ray)",
        quantity: 1,
        unit_price: 6000.0,
        amount: 6000.0,
        confidence: "high",
        source_term: "Bitewings X-Ray",
      });
    }
    if (/panoram/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-003",
        name: "Panoramic View (X-Ray)",
        quantity: 1,
        unit_price: 9000.0,
        amount: 9000.0,
        confidence: "high",
        source_term: "Panoramic X-Ray",
      });
    }

    // ── Scaling & Polishing ───────────────────────────────────────────────────
    if (/s\s*&\s*p|scaling\s*(?:and|&)?\s*polish/i.test(cleanTreatment)) {
      // Heavy (therapeutic) if specified, otherwise default to light
      const isHeavy = /heavy|therapeu/i.test(cleanTreatment);
      matchedItems.push({
        code: isHeavy ? "NHIA-121-004" : "NHIA-121-005",
        name: isHeavy ? "Scaling & Polishing - heavy (therapeutic)" : "Scaling & Polishing - light (therapeutic)",
        quantity: 1,
        unit_price: isHeavy ? 10000.0 : 9000.0,
        amount: isHeavy ? 10000.0 : 9000.0,
        confidence: "high",
        source_term: "Scaling and Polishing",
      });
    }

    // ── Curettage ─────────────────────────────────────────────────────────────
    if (/curettage/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-006",
        name: "Curettage",
        quantity: 1,
        unit_price: 15000.0,
        amount: 15000.0,
        confidence: "high",
        source_term: "Curettage",
      });
    }

    // ── Amalgam Restoration ───────────────────────────────────────────────────
    if (/amalgam/i.test(cleanTreatment)) {
      const isClassII = /class\s*ii/i.test(cleanTreatment);
      matchedItems.push({
        code: isClassII ? "NHIA-121-008" : "NHIA-121-007",
        name: isClassII ? "Amalgam Restoration (Class II)" : "Amalgam Restoration",
        quantity: 1,
        unit_price: isClassII ? 15000.0 : 25000.0,
        amount: isClassII ? 15000.0 : 25000.0,
        confidence: "high",
        source_term: "Amalgam Restoration",
      });
    }

    // ── Composite Restoration ─────────────────────────────────────────────────
    if (/composite/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-009",
        name: "Composite Restoration",
        quantity: 1,
        unit_price: 15000.0,
        amount: 15000.0,
        confidence: "high",
        source_term: "Composite Restoration",
      });
    }

    // ── Pulpal Treatment ──────────────────────────────────────────────────────
    if (/pulpal|pulpot|pulpect/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-010",
        name: "Pulpal Treatment for Children",
        quantity: 1,
        unit_price: 10000.0,
        amount: 10000.0,
        confidence: "high",
        source_term: "Pulpal Treatment",
      });
    }

    // ── Periodontal Gum Treatment ─────────────────────────────────────────────
    if (/periodon|gum\s*treat/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-011",
        name: "Periodontal Gum Treatment",
        quantity: 1,
        unit_price: 10000.0,
        amount: 10000.0,
        confidence: "high",
        source_term: "Periodontal Gum Treatment",
      });
    }

    // ── Fissure Sealant ───────────────────────────────────────────────────────
    if (/fissure\s*seal/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-012",
        name: "Fissure Sealant",
        quantity: 1,
        unit_price: 8000.0,
        amount: 8000.0,
        confidence: "high",
        source_term: "Fissure Sealant",
      });
    }

    // ── Dental Fistulectomy ───────────────────────────────────────────────────
    if (/fistulect/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-013",
        name: "Fistulectomy (Dental)",
        quantity: 1,
        unit_price: 48000.0,
        amount: 48000.0,
        confidence: "high",
        source_term: "Fistulectomy",
      });
    }

    // ── Sequestrectomy (dental) ───────────────────────────────────────────────
    if (/sequest/i.test(cleanTreatment)) {
      const isMajorGA = /major|under\s*ga/i.test(cleanTreatment);
      const isMinorLA = /minor|under\s*la/i.test(cleanTreatment);
      if (isMajorGA) {
        matchedItems.push({
          code: "NHIA-024-007",
          name: "Major Sequestrectomy (Under GA)",
          quantity: 1,
          unit_price: 120160.0,
          amount: 120160.0,
          confidence: "high",
          source_term: "Major Sequestrectomy",
        });
      } else if (isMinorLA) {
        matchedItems.push({
          code: "NHIA-024-008",
          name: "Minor Sequestrectomy (Under LA)",
          quantity: 1,
          unit_price: 80000.0,
          amount: 80000.0,
          confidence: "high",
          source_term: "Minor Sequestrectomy",
        });
      } else {
        matchedItems.push({
          code: "NHIA-121-014",
          name: "Sequestrectomy",
          quantity: 1,
          unit_price: 32800.0,
          amount: 32800.0,
          confidence: "high",
          source_term: "Sequestrectomy",
        });
      }
    }

    // ── Root Canal Therapy ────────────────────────────────────────────────────
    if (/root\s*canal|rct/i.test(cleanTreatment)) {
      const isPosterior = /posterior|molar|premolar/i.test(cleanTreatment);
      matchedItems.push({
        code: isPosterior ? "NHIA-121-016" : "NHIA-121-015",
        name: isPosterior ? "Root Canal Therapy Posterior" : "Root Canal Therapy Anterior",
        quantity: 1,
        unit_price: isPosterior ? 28250.0 : 30000.0,
        amount: isPosterior ? 28250.0 : 30000.0,
        confidence: "high",
        source_term: isPosterior ? "Root Canal Therapy Posterior" : "Root Canal Therapy Anterior",
      });
    }

    // ── Dentures / RPD ────────────────────────────────────────────────────────
    if (/relin|repair.*denture|impression.*denture|denture.*relin|denture.*repair|denture.*impression/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-018",
        name: "Denture (relining/repair/impression)",
        quantity: 1,
        unit_price: 6600.0,
        amount: 6600.0,
        confidence: "high",
        source_term: "Denture relining/repair",
      });
    } else if (/rpd|removable\s*partial|kennedy\s*class|prosthodontic/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-870-022",
        name: "Removable Partial Denture (RPD)",
        quantity: 1,
        unit_price: 25000.0,
        amount: 25000.0,
        confidence: "high",
        source_term: "Removable Partial Denture",
      });
    } else if (/denture/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-121-017",
        name: "Dentures",
        quantity: 1,
        unit_price: 11777.78,
        amount: 11777.78,
        confidence: "high",
        source_term: "Dentures",
      });
    }

    // ── Minor Oral Surgeries ──────────────────────────────────────────────────
    if (/tongue\s*tie|ankyloglossia/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-022-001-B",
        name: "Release of Tongue Tie",
        quantity: 1,
        unit_price: 26833.33,
        amount: 26833.33,
        confidence: "high",
        source_term: "Release of Tongue Tie",
      });
    }
    if (/surgical\s*extract/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-022-003-B",
        name: "Surgical Extraction",
        quantity: 1,
        unit_price: 16666.67,
        amount: 16666.67,
        confidence: "high",
        source_term: "Surgical Extraction",
      });
    } else if (/extraction/i.test(cleanTreatment)) {
      // Simple extraction (default if not surgical)
      matchedItems.push({
        code: "NHIA-070-004",
        name: "Simple Tooth Extraction",
        quantity: 1,
        unit_price: 4000.0,
        amount: 4000.0,
        confidence: "high",
        source_term: "Simple Extraction",
      });
    }

    // ── Intermediate Oral Surgeries ───────────────────────────────────────────
    if (/adenoidect/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-023-001-B",
        name: "Adenoidectomy",
        quantity: 1,
        unit_price: 120000.0,
        amount: 120000.0,
        confidence: "high",
        source_term: "Adenoidectomy",
      });
    }
    if (/cleft\s*lip/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-023-002-B",
        name: "Cleft Lip Repairs",
        quantity: 1,
        unit_price: 150000.0,
        amount: 150000.0,
        confidence: "high",
        source_term: "Cleft Lip Repairs",
      });
    }
    if (/submandibular\s*gland\s*excis/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-022-003-C",
        name: "Submandibular Gland Excision",
        quantity: 1,
        unit_price: 150000.0,
        amount: 150000.0,
        confidence: "high",
        source_term: "Submandibular Gland Excision",
      });
    }
    if (/superficial\s*parotid/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-022-004-B",
        name: "Superficial Parotidectomy",
        quantity: 1,
        unit_price: 118000.0,
        amount: 118000.0,
        confidence: "high",
        source_term: "Superficial Parotidectomy",
      });
    }
    if (/thyroglos/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-022-005-B",
        name: "Thyroglossal Cyst/Fistula Excision",
        quantity: 1,
        unit_price: 93000.0,
        amount: 93000.0,
        confidence: "high",
        source_term: "Thyroglossal Cyst Excision",
      });
    }
    if (/tracheostom/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-022-006-B",
        name: "Tracheostomy",
        quantity: 1,
        unit_price: 58000.0,
        amount: 58000.0,
        confidence: "high",
        source_term: "Tracheostomy",
      });
    }

    // ── Major Oral / Maxillofacial Surgeries ──────────────────────────────────
    if (/cleft\s*palate/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-024-002",
        name: "Cleft Palate Repairs",
        quantity: 1,
        unit_price: 200000.0,
        amount: 200000.0,
        confidence: "high",
        source_term: "Cleft Palate Repairs",
      });
    }
    if (/fract.*nose|nasal\s*fract/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-024-004",
        name: "Fracture Reduction of the Nose",
        quantity: 1,
        unit_price: 200000.0,
        amount: 200000.0,
        confidence: "high",
        source_term: "Fracture Reduction Nose",
      });
    }
    if (/jaw\s*fract|fract.*jaw/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-024-005",
        name: "Reduction and Fixation of Jaw Fractures",
        quantity: 1,
        unit_price: 200000.0,
        amount: 200000.0,
        confidence: "high",
        source_term: "Jaw Fracture Fixation",
      });
    }
    if (/fixation.*jaw|jaw.*fixation/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-024-010",
        name: "Fixation of Fracture of the Jaw",
        quantity: 1,
        unit_price: 180000.0,
        amount: 180000.0,
        confidence: "high",
        source_term: "Fixation of Jaw Fracture",
      });
    }
    if (/maxillar.*fract|fract.*maxillar/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-024-006",
        name: "Reduction and Fixation of Maxillary Fractures",
        quantity: 1,
        unit_price: 150200.0,
        amount: 150200.0,
        confidence: "high",
        source_term: "Maxillary Fracture Fixation",
      });
    }
    if (/total\s*parotid/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-024-009",
        name: "Total Parotidectomy",
        quantity: 1,
        unit_price: 131966.67,
        amount: 131966.67,
        confidence: "high",
        source_term: "Total Parotidectomy",
      });
    }
    if (/salivary\s*gland.*excis|excis.*salivary/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-024-011",
        name: "Salivary Gland - Excision",
        quantity: 1,
        unit_price: 200000.0,
        amount: 200000.0,
        confidence: "high",
        source_term: "Salivary Gland Excision",
      });
    }
    if (/hemi\s*mandibul/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-024-012",
        name: "Hemi Mandibulectomy",
        quantity: 1,
        unit_price: 180000.0,
        amount: 180000.0,
        confidence: "high",
        source_term: "Hemi Mandibulectomy",
      });
    }
    if (/submandibular.*mass.*excis|submandibular.*reconst/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-024-013",
        name: "Submandibular Mass Excision + Reconstruction",
        quantity: 1,
        unit_price: 180000.0,
        amount: 180000.0,
        confidence: "high",
        source_term: "Submandibular Mass Excision",
      });
    }
    if (/sialoa/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-024-014",
        name: "Submandibular Sialoadenectomy",
        quantity: 1,
        unit_price: 150000.0,
        amount: 150000.0,
        confidence: "high",
        source_term: "Submandibular Sialoadenectomy",
      });
    }

    // ── Dental Consultation ───────────────────────────────────────────────────
    if (/consult/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-010-001",
        name: "Specialist Dental Consultation",
        quantity: 1,
        unit_price: 4000.0,
        amount: 4000.0,
        confidence: "high",
        source_term: "Consultation",
      });
    }

    // Fallback: if nothing matched, flag for manual review
    if (matchedItems.length === 0) {
      reviewIssues.push(`Dental procedure not auto-matched: "${cleanTreatment}". Please select correct NHIA tariff manually.`);
      matchedItems.push({
        code: "MANUAL_REVIEW",
        name: cleanTreatment,
        quantity: 1,
        unit_price: 0,
        amount: 0,
        confidence: "manual",
        source_term: cleanTreatment,
      });
    }

  } else {
    // 5. Prescriptions & Lab Investigations
    const rawParts = cleanTreatment.split(/,|;|\n/);
    const splitParts: string[] = [];

    rawParts.forEach((p) => {
      const trimmed = p.trim();
      if (!trimmed) return;
      if (trimmed.includes(" & ") && !/s&p|amiloride/i.test(trimmed)) {
        splitParts.push(...trimmed.split(" & ").map((sp) => sp.trim()).filter(Boolean));
      } else {
        splitParts.push(trimmed);
      }
    });

    // Expand split morning/evening doses (e.g., "Metformin 1000mg am, 500mg pm x 2/52")
    const subParts: string[] = [];
    let lastDrugStem = "";
    for (const rawPart of splitParts) {
      let p = rawPart.trim();
      if (/^\(?\d+\s*tabs?\s*(?:each)?\)?$/i.test(p)) {
        continue; // skip standalone count note e.g. "(30 tabs each)"
      }
      const doseOnlyMatch = p.match(/^\s*(\d+(?:\.\d+)?\s*(?:mg|g|mcg))\s+(am|pm|nocte|mane|dly|daily|bd)/i);
      if (doseOnlyMatch && lastDrugStem) {
        p = `${lastDrugStem} ${p}`;
      } else {
        const drugWordMatch = p.match(/(?:Tab|Cap|Inj)?\s*([A-Za-z]{4,})/i);
        if (drugWordMatch) {
          lastDrugStem = drugWordMatch[1];
        }
      }
      subParts.push(p);
    }

    for (const part of subParts) {
      if (part.length < 2) continue;
      const pLower = part.toLowerCase();
      const qty = extractMedicationQuantity(part);
      let foundMatch: HistoricalMatchedItem | null = null;

      // Check Lab Map
      for (const [key, lab] of Object.entries(LAB_MAP)) {
        if (pLower.includes(key)) {
          foundMatch = {
            code: lab.code,
            name: lab.name,
            quantity: 1,
            unit_price: lab.amount,
            amount: lab.amount,
            confidence: "high",
            source_term: part,
          };
          break;
        }
      }

      // Check Brand Map
      if (!foundMatch) {
        if (pLower.includes("indapamide") || pLower.includes("indapimide")) {
          const isSr = /\b(sr|slow\s*release|retard)\b/i.test(pLower);
          const itemCode = isSr ? "NHIA-12-03-15" : "NHIA-12-04-31";
          const itemName = isSr
            ? "Indapamide Tablet 1.5mg, 2.5mg, SR Tablet"
            : "Indapamide 1.5mg tab Tab 1.5mg Tab";
          const unitPrice = isSr ? 363.0 : 310.0;
          foundMatch = {
            code: itemCode,
            name: itemName,
            quantity: qty,
            unit_price: unitPrice,
            amount: qty * unitPrice,
            confidence: "high",
            source_term: part,
          };
        } else {
          for (const [key, brand] of Object.entries(BRAND_MAP)) {
            if (pLower.includes(key)) {
              foundMatch = {
                code: brand.code,
                name: brand.name,
                quantity: qty,
                unit_price: brand.amount,
                amount: qty * brand.amount,
                confidence: "high",
                source_term: part,
              };
              break;
            }
          }
        }
      }

      // Check Generic Catalogs
      if (!foundMatch) {
        // Safe combo detection: strip duration fractions e.g. 1/12, 2/52 so they don't fool combo detection
        const cleanComboText = pLower.replace(/\d+\s*\/\s*\d+/g, " ");
        const wantsCombo =
          cleanComboText.includes("+") ||
          cleanComboText.includes(" with ") ||
          cleanComboText.includes(" and ") ||
          cleanComboText.includes("&") ||
          /[a-z]\s*\/\s*[a-z]/i.test(cleanComboText);

        const wantsTablet = /tab|cap/i.test(part) || !/inj|drops|gel|ointment|cream|suppository/i.test(part);
        const wantsInj = /inj|pen|vial|amp/i.test(part);

        const STOP_TOKENS = new Set([
          "tablets", "tablet", "tab", "tabs",
          "capsules", "capsule", "cap", "caps",
          "injection", "inj", "syrup", "suspension", "drops", "ointment", "cream", "gel",
          "daily", "dly", "nocte", "bd", "tds", "qid", "stat", "prn", "mane",
          "each", "dose", "oral", "month", "days", "weeks", "dlyx", "bdx",
          "acid", "sodium", "potassium", "hcl", "besylate", "maleate", "retard", "chloride", "hydrochloride"
        ]);

        const drugTokens = pLower
          .replace(/\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|iu|u)\b/gi, " ")
          .replace(/[0-9/\\().,+-]/g, " ")
          .split(/\s+/)
          .map((w) => w.trim())
          .filter((w) => w.length >= 3 && !STOP_TOKENS.has(w));

        const stMatch = pLower.match(/(\d+(?:\.\d+)?)\s*mg/i);
        const targetMg = stMatch ? `${stMatch[1]}mg`.toLowerCase() : null;

        // Scored drug candidate selection:
        // Prioritizes single-entity drugs when prescription is single-entity (e.g. Losartan 50mg -> Losartan 50mg Tablet, NOT Losartan + Amlodipine)
        if (drugTokens.length > 0) {
          const candidates: Array<{ tariff: NhiaTariffItem; score: number; exactMg: boolean }> = [];

          for (const t of tariffs) {
            if (t.category === "drug") {
              const tLower = t.name.toLowerCase();
              const tNorm = tLower.replace(/\s+/g, "");
              const hasStem = drugTokens.some((tok) => tLower.includes(tok));
              if (hasStem) {
                // Strip formulation/packaging slashes like Tab/Cap, mg/ml, units/ml before combo detection
                const cleanTariffText = tLower
                  .replace(/\b(?:tab|tabs?|caps?|cap|tablets?|capsules?)\s*\/\s*(?:tab|tabs?|caps?|cap|tablets?|capsules?)\b/gi, " ")
                  .replace(/\b\d+(?:\.\d+)?\s*(?:mg|g|mcg|iu|u)\s*\/\s*(?:\d+(?:\.\d+)?)?\s*(?:ml|l|drop|dose|amp|vial|g)\b/gi, " ");
                const isCombo =
                  cleanTariffText.includes("+") ||
                  cleanTariffText.includes(" with ") ||
                  cleanTariffText.includes("&") ||
                  /[a-z]{3,}\s*\/\s*[a-z]{3,}/.test(cleanTariffText);

                let score = 0;
                let exactMg = false;

                // 1. Strength matching:
                const tariffMgMatch = tLower.match(/(\d+(?:\.\d+)?)\s*mg\b/i);
                const tariffMg = tariffMgMatch ? `${tariffMgMatch[1]}mg`.toLowerCase() : null;

                if (targetMg) {
                  if (tNorm.includes(targetMg) || (tariffMg && tariffMg === targetMg)) {
                    score += 300;
                    exactMg = true;
                  } else if (tariffMg && tariffMg !== targetMg) {
                    score -= 500; // Strong penalty if candidate has an explicit different strength!
                  } else {
                    score -= 100;
                  }
                }

                // 2. Combo alignment:
                if (wantsCombo && isCombo) {
                  score += 80;
                  for (const tok of drugTokens) {
                    if (tLower.includes(tok)) score += 30;
                  }
                } else if (!wantsCombo && !isCombo) {
                  score += 80;
                } else if (!wantsCombo && isCombo) {
                  score -= 150; // Heavily penalize combination drugs when prescription only asked for a single entity!
                } else if (wantsCombo && !isCombo) {
                  score -= 40;
                }

                // 3. Formulation alignment (Tablet vs Gel vs Inj vs Drops)
                const isTablet = tLower.includes("tab") || tLower.includes("cap");
                const isInj = tLower.includes("inj") || tLower.includes("vial") || tLower.includes("amp");
                const isTopical = tLower.includes("gel") || tLower.includes("cream") || tLower.includes("drops") || tLower.includes("suppository");

                if (wantsTablet) {
                  if (isTablet) score += 50;
                  if (isTopical) score -= 100;
                  if (isInj) score -= 100;
                } else if (wantsInj) {
                  if (isInj) score += 60;
                  if (isTablet) score -= 50;
                  if (isTopical) score -= 50;
                }

                // 4. Name starts with primary drug stem
                if (drugTokens.some((tok) => tLower.startsWith(tok))) {
                  score += 40;
                }

                // 5. Shorter name preference
                score -= Math.min(t.name.length / 4, 15);

                candidates.push({ tariff: t, score, exactMg });
              }
            }
          }

          if (candidates.length > 0) {
            // Strictly prefer exact strength matches if any exist
            const exactCandidates = candidates.filter((c) => c.exactMg);
            const eligibleCandidates = exactCandidates.length > 0 ? exactCandidates : candidates;
            eligibleCandidates.sort((a, b) => b.score - a.score);
            const best = eligibleCandidates[0];
            foundMatch = {
              code: best.tariff.code,
              name: best.tariff.name,
              quantity: qty,
              unit_price: best.tariff.amount,
              amount: qty * best.tariff.amount,
              confidence: best.exactMg ? "high" : "medium",
              source_term: part,
            };
            if (!best.exactMg) {
              reviewIssues.push(
                `Prescription strength (${part}) differs from standard NHIA catalog strength (${best.tariff.name}); matched nearest entry.`
              );
            }
          }
        }
      }

      if (foundMatch) {
        matchedItems.push(foundMatch);
      } else {
        reviewIssues.push(`Unmatched item: "${part}"`);
        matchedItems.push({
          code: "MANUAL_REVIEW",
          name: part,
          quantity: qty,
          unit_price: 0,
          amount: 0,
          confidence: "manual",
          source_term: part,
        });
      }
    }
  }

  const totalAmount = status === "approved"
    ? matchedItems.reduce((sum, it) => sum + (it.declined ? 0 : it.amount), 0)
    : 0;

  let reconciliationStatus: "matched" | "needs_review" | "confirmed" = "matched";
  if (reviewIssues.length > 0 || matchedItems.some((it) => it.confidence === "manual")) {
    reconciliationStatus = "needs_review";
  }

  // Generate canonical request_id
  const rawAuth = row.authorization_code ? row.authorization_code.trim() : null;
  const requestId = rawAuth
    ? `REQ-HIST-${rawAuth.replace(/[^0-9A-Za-z]/g, "")}`
    : `REQ-HIST-${rowNumber.toString().padStart(4, "0")}`;

  // Parse ISO date
  const decidedAt = parseHistoricalDate(row.date);

  return {
    row_number: rowNumber,
    authorization_code: rawAuth,
    request_id: requestId,
    patient_name: (row.patient_name || "").trim() || "Unknown Patient",
    policy_number: (row.policy_number || "").trim() || "UNKNOWN",
    hospital_id: hospEntities.hospital_id,
    hospital_name: hospEntities.hospital_name,
    requesting_hospital_id: hospEntities.requesting_hospital_id,
    requesting_hospital_name: hospEntities.requesting_hospital_name,
    referred_hospital_id: hospEntities.referred_hospital_id,
    referred_hospital_name: hospEntities.referred_hospital_name,
    claiming_hospital_id: hospEntities.claiming_hospital_id,
    claiming_hospital_name: hospEntities.claiming_hospital_name,
    diagnosis: (row.diagnosis || "").trim() || "No diagnosis recorded",
    treatment: cleanTreatment || "Treatment details unavailable",
    raw_treatment: String(row.treatment || "").trim() || cleanTreatment || "Treatment details unavailable",
    status,
    raw_status: rawStatus,
    decided_at: decidedAt,
    approved_items: matchedItems,
    total_amount: totalAmount,
    authorized_by_name: "Authorizing Officer (AO)",
    reconciliation_status: reconciliationStatus,
    review_issues: reviewIssues,
  };
}

export function reconcileHistoricalBatch(
  rows: HistoricalRawRow[],
  tariffs: NhiaTariffItem[],
  hospitals: HospitalReference[]
): ReconciliationBatchSummary {
  const records = rows.map((r, i) => reconcileHistoricalRow(r, i + 1, tariffs, hospitals));

  const approvedCount = records.filter((r) => r.status === "approved").length;
  const declinedCount = records.filter((r) => r.status === "declined").length;
  const pendingCount = records.filter((r) => r.status === "pending").length;
  const fullyMatchedCount = records.filter((r) => r.reconciliation_status === "matched").length;
  const needsReviewCount = records.filter((r) => r.reconciliation_status === "needs_review").length;
  const totalCalculatedAmount = records.reduce((sum, r) => sum + r.total_amount, 0);

  return {
    totalRecords: records.length,
    approvedCount,
    declinedCount,
    pendingCount,
    fullyMatchedCount,
    needsReviewCount,
    totalCalculatedAmount,
    records,
  };
}

// ── COMMIT IN SAFE CONTROLLED CHUNKS ─────────────────────────────────────────

export async function commitReconciledHistoricalChunk(
  records: HistoricalReconciledRecord[],
  onProgress?: (progressPercent: number, processed: number, total: number) => void
): Promise<{ inserted: number; updated: number; total: number }> {
  const CHUNK_SIZE = 25;
  let totalInserted = 0;
  let totalUpdated = 0;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const payload = chunk.map((r) => ({
      request_id: r.request_id,
      authorization_code: r.authorization_code,
      patient_name: r.patient_name,
      policy_number: r.policy_number,
      diagnosis: r.diagnosis,
      treatment: r.treatment,
      hospital_id: r.hospital_id,
      hospital_name: r.hospital_name,
      requesting_hospital_id: r.requesting_hospital_id,
      requesting_hospital_name: r.requesting_hospital_name,
      referred_hospital_id: r.referred_hospital_id,
      referred_hospital_name: r.referred_hospital_name,
      claiming_hospital_id: r.claiming_hospital_id,
      claiming_hospital_name: r.claiming_hospital_name,
      status: r.status,
      approved_items: r.approved_items,
      total_amount: r.total_amount,
      decided_at: r.decided_at,
      authorized_by_name: r.authorized_by_name,
    }));

    const { data, error } = await (supabase.rpc as any)("rpc_commit_historical_authorisations_chunk", {
      p_rows: payload,
    });

    if (error) {
      throw new Error(`Failed to commit batch at row ${i + 1}-${i + chunk.length}: ${error.message}`);
    }

    totalInserted += Number(data?.inserted_count || 0);
    totalUpdated += Number(data?.updated_count || 0);

    const processed = Math.min(i + CHUNK_SIZE, records.length);
    if (onProgress) {
      onProgress(Math.round((processed / records.length) * 100), processed, records.length);
    }
  }

  return {
    inserted: totalInserted,
    updated: totalUpdated,
    total: records.length,
  };
}
