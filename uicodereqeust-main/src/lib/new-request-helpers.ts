import { z } from "zod";

export const BRAND_TO_GENERIC: Record<string, string> = {
  tylenol: "Paracetamol", panadol: "Paracetamol", lipitor: "Atorvastatin",
  crestor: "Rosuvastatin", zestril: "Lisinopril", augmentin: "Amoxycillin",
  amoxil: "Amoxycillin", aspirin: "Acetyl salicylic Acid", disprin: "Acetyl salicylic Acid",
  valium: "Diazepam", rocephin: "Ceftriaxone", zinnat: "Cefuroxime",
  ciprobay: "Ciprofloxacin", flagyl: "Metronidazole", ventolin: "Salbutamol",
  glucophage: "Metformin", daonil: "Glibenclamide", plavix: "Clopidogrel",
  neurontin: "Gabapentin",
};

export const DIAGNOSES = [
  "Malaria", "Severe Malaria", "Uncomplicated Malaria", "Typhoid Fever",
  "Hypertension", "Hypertensive Crisis", "Type 2 Diabetes Mellitus",
  "Type 1 Diabetes Mellitus", "Diabetic Ketoacidosis", "Pneumonia",
  "Community-acquired Pneumonia", "Urinary Tract Infection", "Upper Respiratory Tract Infection",
  "Acute Gastroenteritis", "Peptic Ulcer Disease", "Appendicitis", "Anaemia",
  "Sickle Cell Crisis", "Sickle Cell Disease", "Asthma", "Acute Asthma Attack",
  "Chronic Obstructive Pulmonary Disease", "Heart Failure", "Congestive Heart Failure",
  "Myocardial Infarction", "Stroke", "Ischaemic Stroke", "Haemorrhagic Stroke",
  "Epilepsy", "Seizure Disorder", "Meningitis", "Bacterial Meningitis",
  "Sepsis", "Septic Shock", "Malnutrition", "Severe Acute Malnutrition",
  "Tuberculosis", "Pulmonary Tuberculosis", "HIV/AIDS", "Chronic Kidney Disease",
  "Acute Kidney Injury", "Liver Cirrhosis", "Hepatitis B", "Hepatitis C",
  "Cholera", "Dysentery", "Dengue Fever", "Lassa Fever", "Cellulitis",
  "Wound Infection", "Fracture", "Dislocation", "Burn Injury", "Obstetric Complication",
  "Pre-eclampsia", "Eclampsia", "Postpartum Haemorrhage", "Ectopic Pregnancy",
  "Neonatal Sepsis", "Neonatal Jaundice", "Malaria in Pregnancy", "Anaemia in Pregnancy",
  "COVID-19", "Diabetic Foot Ulcer", "Chronic Liver Disease", "Renal Abscess",
  "Epididymitis", "Orchitis", "Benign Prostatic Proplasia", "Prostatitis",
  "Pelvic Inflammatory Disease", "Ectopic Pregnancy Rupture", "Placenta Praevia",
  "Abruptio Placentae", "Puerperal Sepsis", "Neonatal Pneumonia", "Preterm Labour",
  "Post Term Pregnancy", "Multiple Pregnancy", "Polyhydramnios", "Oligohydramnios",
  "Intrauterine Growth Restriction", "Gestational Diabetes Mellitus", "Pregnancy Induced Hypertension",
  "Anaemia in Pregnancy", "Sickle Cell Trait In Pregnancy",
];

export interface TreatmentItem {
  code: string;
  name: string;
  amount: number;
  category?: string;
  subcategory?: string;
  quantity: number;
}

export type HospitalRequestDraft = {
  selectedPatient: any | null;
  patientSearch: string;
  diagnoses: string[];
  diagnosisSearch: string;
  treatSearch: string;
  treatments: TreatmentItem[];
  phone: string;
  patientEmail?: string;
  urgency: string;
  referralHospitalId: string | null;
  referralHospitalName: string;
};

export const normalizePhone = (value: string) => value.replace(/[^\d+]/g, "");

export const isValidNigerianPhone = (value: string) =>
  /^(\+234|234|0)[789][01]\d{8}$/.test(normalizePhone(value));

export const isValidPolicyNumber = (value: string) =>
  /^[A-Z0-9][A-Z0-9/-]{4,29}$/i.test(String(value || "").trim());

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const hospitalRequestSchema = z.object({
  selectedPatient: z.any().nullable().refine((val) => val !== null, "Patient selection is required"),
  patientSearch: z.string().optional(),
  
  phone: z.string().min(10, "Phone number is too short").max(15, "Phone number is too long").refine(isValidNigerianPhone, "Invalid Nigerian phone number format"),
  
  patientEmail: z.string().email("Invalid email address format").or(z.literal("")),
  noEmail: z.boolean().optional().default(false),
  
  diagnoses: z.array(z.string()).min(1, "At least one diagnosis is required"),
  diagnosisSearch: z.string().optional(),
  
  urgency: z.enum(["routine", "urgent", "emergency"]).default("routine"),
  
  referralHospitalId: z.string().nullable().optional(),
  referralHospitalName: z.string().optional(),
  
  treatments: z.array(z.object({
    code: z.string(),
    name: z.string(),
    amount: z.coerce.number().min(0),
    category: z.string().optional(),
    subcategory: z.string().optional(),
    quantity: z.number().int().positive().min(1).max(999)
  })).min(1, "At least one treatment item is required"),
  treatSearch: z.string().optional(),
}).superRefine((data, ctx) => {
  // If not "no email", we need a valid email
  if (!data.noEmail && (!data.patientEmail || !isValidEmail(data.patientEmail))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Patient email is required unless 'Patient does not have an email' is checked",
      path: ["patientEmail"],
    });
  }
});

export type HospitalRequestFormValues = z.infer<typeof hospitalRequestSchema>;
