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
  flp: { code: "NHIA-181-042", name: "Fasting Lipid Profile", amount: 8000.0 },
  lipid: { code: "NHIA-181-042", name: "Fasting Lipid Profile", amount: 8000.0 },
  psa: { code: "NHIA-181-082", name: "Prostate Specific Antigen (PSA)", amount: 15000.0 },
  hba1c: { code: "NHIA-181-046", name: "Glycated Hemoglobin (HbA1c)", amount: 10000.0 },
  hbalc: { code: "NHIA-181-046", name: "Glycated Hemoglobin (HbA1c)", amount: 10000.0 },
  hbaic: { code: "NHIA-181-046", name: "Glycated Hemoglobin (HbA1c)", amount: 10000.0 },
  "e/u/cr": { code: "NHIA-181-030", name: "Electrolytes, Urea and Creatinine", amount: 8500.0 },
  "e/u": { code: "NHIA-181-030", name: "Electrolytes, Urea and Creatinine", amount: 8500.0 },
  eucr: { code: "NHIA-181-030", name: "Electrolytes, Urea and Creatinine", amount: 8500.0 },
  "serum e/u": { code: "NHIA-181-030", name: "Electrolytes, Urea and Creatinine", amount: 8500.0 },
  "urine mcs": { code: "NHIA-181-110", name: "Urine Microscopy, Culture & Sensitivity", amount: 5000.0 },
  "stool microscopy": { code: "NHIA-181-098", name: "Stool Microscopy, Culture & Sensitivity", amount: 5000.0 },
  scan: { code: "NHIA-030-001", name: "Abdominopelvic Ultrasound Scan", amount: 6000.0 },
  uss: { code: "NHIA-030-001", name: "Abdominopelvic Ultrasound Scan", amount: 6000.0 },
  "x-ray": { code: "NHIA-020-001", name: "Plain Radiography (X-Ray)", amount: 5000.0 },
  xray: { code: "NHIA-020-001", name: "Plain Radiography (X-Ray)", amount: 5000.0 },
  hbsag: { code: "NHIA-181-050", name: "Hepatitis B Surface Antigen (HBsAg)", amount: 3500.0 },
  "anti-hcv": { code: "NHIA-181-051", name: "Hepatitis C Virus Antibody (Anti-HCV)", amount: 4000.0 },
  rvs: { code: "NHIA-181-055", name: "Retroviral Screening (RVS / HIV)", amount: 3000.0 },
  "pap smear": { code: "NHIA-181-075", name: "Cervical Cytology (Pap Smear)", amount: 8000.0 },
  mammogram: { code: "NHIA-020-015", name: "Mammography (Bilateral)", amount: 15000.0 },
  "semen analysis": { code: "NHIA-181-090", name: "Seminal Fluid Analysis", amount: 6000.0 },
  tonometry: { code: "NHIA-081-008", name: "Applanation Tonometry", amount: 3000.0 },
  "specialist consultation": { code: "NHIA-010-001", name: "Specialist Initial Consultation", amount: 4000.0 },
  consultation: { code: "NHIA-010-001", name: "Specialist Initial Consultation", amount: 4000.0 },
  "follow up": { code: "NHIA-010-001", name: "Specialist Follow-up Consultation", amount: 4000.0 },
  "follow-up": { code: "NHIA-010-001", name: "Specialist Follow-up Consultation", amount: 4000.0 },
};

export const BRAND_MAP: Record<string, { code: string; name: string; amount: number }> = {
  vasoprin: { code: "NHIA-02-03-01", name: "Acetylsalicylic Acid Tablet 75mg/100mg", amount: 30.0 },
  moduretic: { code: "NHIA-12-03-01", name: "Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab", amount: 36.0 },
  aldomet: { code: "NHIA-12-04-51", name: "Methyldopa Tablet 500mg Tablet", amount: 69.0 },
  amaryl: { code: "NHIA-17-06-18", name: "Glimepiride Tab 2mg", amount: 102.0 },
  daonil: { code: "NHIA-17-06-14", name: "Glibenclamide Tablet 5mg Tab.", amount: 30.0 },
  tegretol: { code: "NHIA-05-01-01", name: "Carbamazepine Tablet 200mg Tab", amount: 50.0 },
  avsar: { code: "NHIA-12-04-04", name: "Amlodipine + Valsartan Tablet 5 mg + 160mg Tab", amount: 280.0 },
  neurovite: { code: "NHIA-27-01-01", name: "Vitamin B Complex Tablet Tab.", amount: 20.0 },
  lantus: { code: "NHIA-17-06-03", name: "Insulin Soluble/Glargine Injection 100 units/ml Vial", amount: 12474.0 },
  insulin: { code: "NHIA-17-06-03", name: "Insulin Soluble/Glargine Injection 100 units/ml Vial", amount: 12474.0 },
  insulisn: { code: "NHIA-17-06-03", name: "Insulin Soluble/Glargine Injection 100 units/ml Vial", amount: 12474.0 },
  glucophage: { code: "NHIA-17-06-13", name: "Metformin Tablets 500mg (HCL) Tab.", amount: 44.0 },
  norvasc: { code: "NHIA-12-04-03", name: "Amlodipine Tablet (Besylate) 10mg Tab.", amount: 70.0 },
  cozaar: { code: "NHIA-12-04-49", name: "Losartan 50mg Tablet Tablet 50mg Tablet", amount: 100.0 },
  hct: { code: "NHIA-12-03-05", name: "Hydrochlorothiazide Tablet 25mg Tab.", amount: 40.0 },
  htc: { code: "NHIA-12-03-05", name: "Hydrochlorothiazide Tablet 25mg Tab.", amount: 40.0 },
  amiloride: { code: "NHIA-12-03-01", name: "Amiloride + Hydrochlorothiazide Tablet", amount: 36.0 },
  indapamide: { code: "NHIA-12-03-08", name: "Indapamide Tablet 1.5mg Tab.", amount: 80.0 },
  indapimide: { code: "NHIA-12-03-08", name: "Indapamide Tablet 1.5mg Tab.", amount: 80.0 },
  bisoprolol: { code: "NHIA-12-04-12", name: "Bisoprolol Tablet 5mg Tab.", amount: 95.0 },
  bisoporol: { code: "NHIA-12-04-12", name: "Bisoprolol Tablet 5mg Tab.", amount: 95.0 },
  tamsulosin: { code: "NHIA-18-01-01", name: "Tamsulosin Capsule 0.4mg Cap.", amount: 150.0 },
  telmisartan: { code: "NHIA-12-04-63", name: "Telmisartan Tablet 40mg/80mg Tab.", amount: 180.0 },
  temisartan: { code: "NHIA-12-04-63", name: "Telmisartan Tablet 40mg/80mg Tab.", amount: 180.0 },
  telmisitan: { code: "NHIA-12-04-63", name: "Telmisartan Tablet 40mg/80mg Tab.", amount: 180.0 },
  benxehexol: { code: "NHIA-05-02-01", name: "Trihexyphenidyl (Benzhexol) 5mg Tab.", amount: 45.0 },
  chlorpromazine: { code: "NHIA-24-01-01", name: "Chlorpromazine Tablet 100mg/300mg", amount: 55.0 },
  clopidogrel: { code: "NHIA-12-04-20", name: "Clopidogrel Tablet 75mg Tab.", amount: 110.0 },
  chlopidogrel: { code: "NHIA-12-04-20", name: "Clopidogrel Tablet 75mg Tab.", amount: 110.0 },
  atovastatin: { code: "NHIA-12-06-01", name: "Atorvastatin Tab/Caps 10mg Tab/ Cap.", amount: 122.0 },
  artovastatin: { code: "NHIA-12-06-02", name: "Atorvastatin Tab/Caps 20mg Tab/ Cap.", amount: 154.0 },
  amlodipne: { code: "NHIA-12-04-03", name: "Amlodipine Tablet (Besylate) 10mg Tab.", amount: 70.0 },
  lorsatan: { code: "NHIA-12-04-49", name: "Losartan 50mg Tablet Tablet 50mg Tablet", amount: 100.0 },
  glibenciamide: { code: "NHIA-17-06-14", name: "Glibenclamide Tablet 5mg Tab.", amount: 30.0 },
  metroprolol: { code: "NHIA-12-04-55", name: "Metoprolol Succinate 50mg tab Tablet 50mg Tablet", amount: 157.0 },
  metoprolol: { code: "NHIA-12-04-55", name: "Metoprolol Succinate 50mg tab Tablet 50mg Tablet", amount: 157.0 },
  labetelol: { code: "NHIA-12-04-40", name: "Labetalol Tablet (HCL) 200mg Tab.", amount: 318.0 },
  labetalol: { code: "NHIA-12-04-40", name: "Labetalol Tablet (HCL) 200mg Tab.", amount: 318.0 },
  donapezil: { code: "NHIA-10-02-02", name: "Donepezil HCL Tablet 5mg, 10mg tablet", amount: 417.0 },
  donepezil: { code: "NHIA-10-02-02", name: "Donepezil HCL Tablet 5mg, 10mg tablet", amount: 417.0 },
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
  return t;
}

export function extractMedicationQuantity(text: string): number {
  const explicit = Array.from(text.matchAll(/\(?\b(\d+)\s*(?:tabs?|tablets?|caps?|capsules?|each)\b\)?/gi));
  if (explicit.length > 0) {
    const qty = parseInt(explicit[explicit.length - 1][1], 10);
    if (!isNaN(qty) && qty > 0) return Math.min(qty, 600);
  }

  let days = 30;
  const dur = text.match(/(\d+)\s*\/\s*(12|52|7)/);
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

  let dose = 1;
  if (/1000mg|1g/i.test(text) && !/500mg/i.test(text)) dose = 2;

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

  // Check referral from Jaja to UCH
  if (lower.includes("referral to university college hospital") || lower.includes("refferal from university health service")) {
    return {
      hospital_id: jaja.id,
      hospital_name: jaja.name,
      requesting_hospital_id: jaja.id,
      requesting_hospital_name: jaja.name,
      referred_hospital_id: uch.id,
      referred_hospital_name: uch.name,
      claiming_hospital_id: uch.id,
      claiming_hospital_name: uch.name,
    };
  }

  // Check referral to Police Clinic
  if (lower.includes("police clinic")) {
    return {
      hospital_id: jaja.id,
      hospital_name: jaja.name,
      requesting_hospital_id: jaja.id,
      requesting_hospital_name: jaja.name,
      referred_hospital_id: police.id,
      referred_hospital_name: police.name,
      claiming_hospital_id: police.id,
      claiming_hospital_name: police.name,
    };
  }

  // Foremost Base Hospital
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

  // LA/1283/P (A. B. 10 Hospital)
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

  // Default Jaja Clinic primary request
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

  const hospEntities = resolveHospitalEntities(row.hospital, hospitals);

  const matchedItems: HistoricalMatchedItem[] = [];
  const reviewIssues: string[] = [];

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
    ((cleanLower.includes("refraction") || cleanLower.includes("glasses") || cleanLower.includes("ophthalmoscopy") || cleanLower.includes("d.o")) &&
      (category.includes("optical") || cleanLower.includes("presbyop") || cleanLower.includes("astigmatism") || cleanLower.includes("eye") || cleanLower.includes("vision")))
  ) {
    // 1. Optical Bundle Preset
    OPTICAL_BUNDLE.forEach((item) => matchedItems.push({ ...item }));
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
    cleanTreatment.toUpperCase() === "CONSULT" ||
    cleanTreatment.toUpperCase() === "SPECIALIST CONSULTATION"
  ) {
    // 3. Specialist Consult / Follow-up Referral
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
    /s&p|scaling|extraction|rct|denture|composite|rpd/i.test(cleanTreatment)
  ) {
    // 4. Dental procedures
    if (/s&p|scaling/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-070-001",
        name: "Scaling and Polishing (Routine)",
        quantity: 1,
        unit_price: 5000.0,
        amount: 5000.0,
        confidence: "high",
        source_term: "Scaling and Polishing",
      });
    }
    if (/extraction/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-070-004",
        name: "Simple Tooth Extraction",
        quantity: 1,
        unit_price: 4000.0,
        amount: 4000.0,
        confidence: "high",
        source_term: "Extraction",
      });
    }
    if (/rct/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-070-008",
        name: "Root Canal Treatment",
        quantity: 1,
        unit_price: 15000.0,
        amount: 15000.0,
        confidence: "high",
        source_term: "RCT",
      });
    }
    if (/composite/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-070-006",
        name: "Composite Restoration (Light Cure)",
        quantity: 1,
        unit_price: 6000.0,
        amount: 6000.0,
        confidence: "high",
        source_term: "Composite",
      });
    }
    if (/rpd|denture/i.test(cleanTreatment)) {
      matchedItems.push({
        code: "NHIA-070-022",
        name: "Removable Partial Denture",
        quantity: 1,
        unit_price: 25000.0,
        amount: 25000.0,
        confidence: "high",
        source_term: "Partial Denture",
      });
    }
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
                const isCombo = tLower.includes("+") || tLower.includes(" with ") || tLower.includes("&") || tLower.includes("/");
                let score = 0;
                let exactMg = false;

                // 1. Exact strength match (highest priority)
                if (targetMg && tNorm.includes(targetMg)) {
                  score += 120;
                  exactMg = true;
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
            candidates.sort((a, b) => b.score - a.score);
            const best = candidates[0];
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
