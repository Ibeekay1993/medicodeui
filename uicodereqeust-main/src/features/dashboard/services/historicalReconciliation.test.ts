import { describe, it, expect } from "vitest";
import {
  cleanClinicalText,
  extractMedicationQuantity,
  reconcileHistoricalRow,
  parseHistoricalDate,
  NhiaTariffItem,
  HospitalReference,
  HistoricalRawRow
} from "./historicalReconciliation";

describe("Historical Reconciliation Engine", () => {
  const mockTariffs: NhiaTariffItem[] = [
    { code: "NHIA-12-04-49", name: "Losartan 50mg Tablet Tablet 50mg Tablet", category: "drug", amount: 100.0 },
    { code: "NHIA-12-04-47", name: "Losartan + Amlodipine Tablet 50mg/5mg Tablet", category: "drug", amount: 204.0 },
    { code: "NHIA-12-04-03", name: "Amlodipine Tablet (Besylate) 10mg Tab.", category: "drug", amount: 70.0 },
    { code: "NHIA-17-06-13", name: "Metformin Tablets 500mg (HCL) Tab.", category: "drug", amount: 44.0 },
    { code: "NHIA-17-06-21", name: "Metformin Tablets 1000mg", category: "drug", amount: 106.0 },
    { code: "NHIA-02-04-06", name: "Diclofenac (sodium or potassium salt) Tablet 50mg Tab.", category: "drug", amount: 35.0 },
    { code: "NHIA-02-04-08", name: "Diclofenac sodium Gel 1% Tube", category: "drug", amount: 1200.0 },
    { code: "NHIA-040-008", name: "Electrocardiography (ECG)", category: "procedure", amount: 10000.0 },
    { code: "NHIA-010-001", name: "Specialist Initial Consultation", category: "procedure", amount: 4000.0 },
    { code: "NHIA-010-002", name: "Specialist Review (Per visit)", category: "procedure", amount: 2600.0 },
    { code: "NHIA-081-001", name: "Manual Refraction", category: "procedure", amount: 3000.0 },
    { code: "NHIA-12-06-01", name: "Atorvastatin Tab/Caps 10mg Tab/ Cap.", category: "drug", amount: 122.0 },
    { code: "NHIA-12-06-02", name: "Atorvastatin Tab/Caps 20mg Tab/ Cap.", category: "drug", amount: 154.0 },
    { code: "NHIA-12-06-12", name: "Atorvastatin 40mg Tablet Tablet 40mg Tablet", category: "drug", amount: 494.0 },
    { code: "NHIA-133-005", name: "Physiotherapy", category: "procedure", amount: 7500.0 },
  ];

  const mockHospitals: HospitalReference[] = [
    { id: "hosp-jaja", name: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)", code: "OY/0252/P" },
    { id: "hosp-uch", name: "UNIVERSITY COLLEGE HOSPITAL", code: "OY/0001/P" },
    { id: "hosp-police", name: "POLICE CLINIC HOSPITAL ELEYELE", code: "OY/0231/P" },
  ];

  it("cleans clinical text and fixes common dosage typos", () => {
    expect(cleanClinicalText("HCT 12.,5mg dly x 1/12")).toBe("HCT 12.5mg dly x 1/12");
    expect(cleanClinicalText("Methyldopa500mg BD x1/12")).toBe("Methyldopa 500mg BD x 1/12");
    expect(cleanClinicalText("Amlodipine 10mg dly x 1\\12")).toBe("Amlodipine 10mg dly x 1/12");
  });

  it("extracts medication quantity correctly from duration, frequency and explicit counts", () => {
    // 1 month daily = 30
    expect(extractMedicationQuantity("Tab losartan 50mg dly x 1/12")).toBe(30);
    // Explicit count in parenthesis
    expect(extractMedicationQuantity("Tab losartan 50mg dly x 1/12 (30 TABLETS)")).toBe(30);
    // Twice daily for 1 month = 60
    expect(extractMedicationQuantity("Tab Methyldopa 250mg B.D x 1/12")).toBe(60);
    // 2 weeks supply = 14
    expect(extractMedicationQuantity("Tab Glimepiride 2mg daily x 2/52")).toBe(14);
  });

  it("reconciles single drug prescription with correct unit price and total amount", () => {
    const rawRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "DARAMOLA FOLARIN",
      policy_number: "1639633",
      authorization_code: "R/AO/19062671BD",
      diagnosis: "HYPERTENSION",
      treatment: "Tab losartan 50mg dly x 1/12 (30 TABLETS)",
      status: "APPROVED",
      category: "Drug",
    };

    const reconciled = reconcileHistoricalRow(rawRow, 1, mockTariffs, mockHospitals);

    expect(reconciled.status).toBe("approved");
    expect(reconciled.authorization_code).toBe("R/AO/19062671BD");
    expect(reconciled.hospital_name).toContain("JAJA");
    expect(reconciled.approved_items.length).toBe(1);
    expect(reconciled.approved_items[0].code).toBe("NHIA-12-04-49");
    expect(reconciled.approved_items[0].quantity).toBe(30);
    expect(reconciled.approved_items[0].unit_price).toBe(100.0);
    expect(reconciled.approved_items[0].amount).toBe(3000.0);
    expect(reconciled.total_amount).toBe(3000.0);
    expect(reconciled.reconciliation_status).toBe("matched");
  });

  it("expands optical combo into standard 3-item package (total ₦27,000)", () => {
    const rawRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "Olatunbosun Julius",
      policy_number: "2556961",
      authorization_code: "R/AO/19062678BD",
      diagnosis: "Presbyopia",
      treatment: "consultation, manual refraction, direct ophthalmoscopy, glasses",
      status: "APPROVED",
      category: "optical",
    };

    const reconciled = reconcileHistoricalRow(rawRow, 8, mockTariffs, mockHospitals);

    expect(reconciled.approved_items.length).toBe(3);
    expect(reconciled.total_amount).toBe(27000.0);
    expect(reconciled.approved_items.map((i) => i.code)).toEqual([
      "NHIA-010-001",
      "NHIA-081-001",
      "NHIA-081-015",
    ]);
  });

  it("handles declined requests with zero approved amount and declined item flag", () => {
    const rawRow: HistoricalRawRow = {
      date: "2026-07-03",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "Akpan Matthew",
      policy_number: "2173737",
      authorization_code: "",
      diagnosis: "?BPH",
      treatment: "E/U/CR",
      status: "DEclined. NOT DUE (was given on 10-feb-26)",
      category: "lab",
    };

    const reconciled = reconcileHistoricalRow(rawRow, 60, mockTariffs, mockHospitals);

    expect(reconciled.status).toBe("declined");
    expect(reconciled.total_amount).toBe(0.0);
    expect(reconciled.approved_items[0].declined).toBe(true);
    expect(reconciled.authorization_code).toBeNull();
  });

  it("correctly attributes referral claiming hospital to UCH", () => {
    const rawRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC) referral to University College Hospital",
      patient_name: "OLUYEMISI SHITTU",
      policy_number: "2872895",
      authorization_code: "R/AO/19062673BD",
      diagnosis: "nephropathy",
      treatment: "FOLLOW UP",
      status: "APPROVED",
      category: "Referral requested for OY/0001 University College Hospital.",
    };

    const reconciled = reconcileHistoricalRow(rawRow, 3, mockTariffs, mockHospitals);

    expect(reconciled.requesting_hospital_id).toBe("hosp-jaja");
    expect(reconciled.referred_hospital_id).toBe("hosp-uch");
    expect(reconciled.claiming_hospital_id).toBe("hosp-uch");
    expect(reconciled.total_amount).toBe(2600.0); // Specialist Review (Per visit)
    expect(reconciled.approved_items[0].code).toBe("NHIA-010-002");
    expect(reconciled.approved_items[0].name).toBe("Specialist Review (Per visit)");
  });

  it("differentiates consultation / initial consultation (NHIA-010-001 @ ₦4000) from follow-up / review (NHIA-010-002 @ ₦2600)", () => {
    const consultRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "TEST PATIENT 1",
      policy_number: "1111111",
      authorization_code: "AUTH001",
      diagnosis: "General",
      treatment: "Specialist Initial Consultation",
      status: "APPROVED",
      category: "consultation",
    };
    const reconciledConsult = reconcileHistoricalRow(consultRow, 1, mockTariffs, mockHospitals);
    expect(reconciledConsult.total_amount).toBe(4000.0);
    expect(reconciledConsult.approved_items[0].code).toBe("NHIA-010-001");

    const reviewRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "TEST PATIENT 2",
      policy_number: "2222222",
      authorization_code: "AUTH002",
      diagnosis: "Follow-up",
      treatment: "FOLLOW UP REVIEW",
      status: "APPROVED",
      category: "review",
    };
    const reconciledReview = reconcileHistoricalRow(reviewRow, 2, mockTariffs, mockHospitals);
    expect(reconciledReview.total_amount).toBe(2600.0);
    expect(reconciledReview.approved_items[0].code).toBe("NHIA-010-002");
  });

  it("accurately parses historical date strings like 2-Jul-26 and 2026-07-24 into July 2026 UTC", () => {
    const iso1 = parseHistoricalDate("2-Jul-26");
    expect(iso1).toBe("2026-07-02T12:00:00.000Z");

    const iso2 = parseHistoricalDate("24-Jul-2026");
    expect(iso2).toBe("2026-07-24T12:00:00.000Z");

    const iso3 = parseHistoricalDate("2026-07-15");
    expect(iso3).toBe("2026-07-15T12:00:00.000Z");
  });

  it("strictly prefers single-entity Losartan over combo Losartan+Amlodipine when single drug is prescribed", () => {
    const rawRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "DARAMOLA FOLARIN",
      policy_number: "1639633",
      authorization_code: "R/AO/19062671BD",
      diagnosis: "HYPERTENSION",
      treatment: "Tab losartan 50mg dly x 1/12 (30 TABLETS)",
      status: "APPROVED",
      category: "Drug",
    };

    const res = reconcileHistoricalRow(rawRow, 1, mockTariffs, mockHospitals);
    expect(res.approved_items.length).toBe(1);
    expect(res.approved_items[0].code).toBe("NHIA-12-04-49"); // Plain Losartan 50mg, NOT NHIA-12-04-47
    expect(res.approved_items[0].unit_price).toBe(100.0);
    expect(res.approved_items[0].amount).toBe(3000.0);
  });

  it("normalizes 1g to 1000mg and matches exact Metformin 1000mg tariff", () => {
    const rawRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "ALAWODE OLUBUNMI",
      policy_number: "123456",
      authorization_code: "R/AO/19062672BD",
      diagnosis: "DIABETES",
      treatment: "metformin 1g dly x 1/12",
      status: "APPROVED",
      category: "Drug",
    };

    const res = reconcileHistoricalRow(rawRow, 2, mockTariffs, mockHospitals);
    expect(res.approved_items.length).toBe(1);
    expect(res.approved_items[0].code).toBe("NHIA-17-06-21"); // Metformin 1000mg
    expect(res.approved_items[0].unit_price).toBe(106.0);
  });

  it("prefers tablet formulation over topical gel when prescription specifies Tab", () => {
    const rawRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "OLORUNNISOMO",
      policy_number: "998877",
      authorization_code: "R/AO/19062699BD",
      diagnosis: "ARTHRITIS",
      treatment: "tab diclofenac 50mg bd x 2/52 (14 tabs)",
      status: "APPROVED",
      category: "Drug",
    };

    const res = reconcileHistoricalRow(rawRow, 3, mockTariffs, mockHospitals);
    expect(res.approved_items.length).toBe(1);
    expect(res.approved_items[0].code).toBe("NHIA-02-04-06"); // Diclofenac Tablet 50mg, NOT gel
    expect(res.approved_items[0].unit_price).toBe(35.0);
  });

  it("strictly picks the 10mg tariff for Atorvastatin 10mg and not 40mg or 20mg", () => {
    const rawRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "SANNI ADETUTU",
      policy_number: "1637962",
      authorization_code: "R/AO/19062672BD",
      diagnosis: "Hypertension , dyslipidaemia",
      treatment: "Tab Atorvastatin 10mg nocte x 1/12 (30 tabs each )",
      status: "APPROVED",
      category: "drug",
    };

    const res = reconcileHistoricalRow(rawRow, 2, mockTariffs, mockHospitals);
    expect(res.approved_items.length).toBe(1);
    expect(res.approved_items[0].code).toBe("NHIA-12-06-01"); // 10mg Tab/Caps, NOT 40mg
    expect(res.approved_items[0].name).toContain("10mg");
    expect(res.approved_items[0].unit_price).toBe(122.0);
    expect(res.approved_items[0].quantity).toBe(30);
    expect(res.approved_items[0].amount).toBe(3660.0);
  });

  it("calculates 60 tablets for Tab metformin 1g BD x1/12 (not 120)", () => {
    const rawRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "Okunlola Justina",
      policy_number: "2872766",
      authorization_code: "R/AO/19062691BD",
      diagnosis: "Diabetes mellitus, Hypertension",
      treatment: "Tab metformin 1g BD x1/12",
      status: "APPROVED",
      category: "Drug",
    };

    const res = reconcileHistoricalRow(rawRow, 21, mockTariffs, mockHospitals);
    expect(res.approved_items.length).toBe(1);
    expect(res.approved_items[0].code).toBe("NHIA-17-06-21"); // Metformin 1000mg
    expect(res.approved_items[0].quantity).toBe(60); // 30 days * 2 BD = 60 tabs, NOT 120!
    expect(res.approved_items[0].unit_price).toBe(106.0);
    expect(res.approved_items[0].amount).toBe(6360.0);
  });

  it("extracts discrete unit quantity of 1 for Lantus insulin 1 pen (not 30)", () => {
    expect(extractMedicationQuantity("Lantus insulin 1 pen")).toBe(1);
    expect(extractMedicationQuantity("Lantus insulin 2 pens")).toBe(2);
    expect(extractMedicationQuantity("1 vial gentamycin")).toBe(1);
  });

  it("prices Electrolytes, Urea and Creatinine at the official NHIA sum of ₦9,000.00", () => {
    const rawRow: HistoricalRawRow = {
      date: "2026-07-02",
      hospital: "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
      patient_name: "Alawode Olusola",
      policy_number: "2872373",
      authorization_code: "R/AO/19062686BD",
      diagnosis: "HTN + DM + BPH",
      treatment: "HBA1C, E/U/CR, PSA.",
      status: "APPROVED",
      category: "lab",
    };

    const res = reconcileHistoricalRow(rawRow, 16, mockTariffs, mockHospitals);
    const eucr = res.approved_items.find((i) => i.name.toLowerCase().includes("electrolytes"));
    expect(eucr).toBeDefined();
    expect(eucr?.unit_price).toBe(9000.0);
    expect(eucr?.amount).toBe(9000.0);
  });
});
