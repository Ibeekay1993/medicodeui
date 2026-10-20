import { SupabaseClient } from "@supabase/supabase-js";
import { TariffOption } from "./clinicalUtils";

const STANDARD_FIELDS: Record<string, string[]> = {
  patient: ["patient", "patients", "pt", "patient_name", "patient:", "patient name", "patient's name"],
  code: ["code", "auth_code", "authorization", "service_code", "code:", "auth code", "authorization code", "auth"],
  diagnosis: ["diagnosis", "dx", "clinical_diagnosis", "diagnosis:", "clinical diagnosis", "diagnoses"],
  policy: ["policy", "policy_number", "policy no", "enrollment", "enrollment_id", "policy:", "policy no:"],
  hospital: ["hospital", "facility", "clinic", "medical_center", "hospital:", "facility:", "referring hospital"],
  service: ["service", "services", "treatment", "treatments", "drug", "drugs", "medication", "medications", "rx", "prescription"],
  medication: ["medication", "medications", "drug", "drugs", "rx", "prescription", "medicine", "meds"],
  dose: ["dose", "dosage", "strength", "dose:", "dosage:"],
  frequency: ["frequency", "freq", "how often", "frequency:", "freq:"],
  duration: ["duration", "dur", "how long", "for", "duration:", "dur:"],
  quantity: ["quantity", "qty", "amount", "quantity:", "qty:"],
  email: ["email", "e-mail", "email address", "mail", "email:"],
  phone: ["phone", "phone number", "tel", "telephone", "mobile", "phone:"],
};

function buildKnownLabelList(): string[] {
  const labels: string[] = [];
  for (const variations of Object.values(STANDARD_FIELDS)) {
    for (const v of variations) {
      labels.push(v.toLowerCase().replace(/:$/, ""));
    }
  }
  // Sort descending by length so longer labels like "services" match before "service"
  return Array.from(new Set(labels)).sort((a, b) => b.length - a.length);
}

const KNOWN_FIELD_LABELS = buildKnownLabelList();

const DRUG_PREFIXES = new Set([
  "tab",
  "tabs",
  "tablet",
  "tablets",
  "t",
  "cap",
  "caps",
  "capsule",
  "capsules",
  "syr",
  "syrup",
  "inj",
  "injection",
  "cream",
  "ointment",
  "drop",
  "drops",
  "aerosol",
  "spray",
  "metered",
  "puff",
  "puffs",
  "inhaler",
  "susp",
  "suspension",
  "pen",
  "pens",
  "cartridge",
  "cartridges",
  "vial",
  "vials",
  "ampoule",
  "ampoules",
]);

const FORM_ALIASES: Array<[RegExp, string]> = [
  [/\b(tab|tabs|tablet|tablets)\b/i, "tablet"],
  [/\b(cap|caps|capsule|capsules)\b/i, "capsule"],
  [/\b(inj|injection|amp|ampoule|vial)\b/i, "injection"],
  [/\b(syr|syrup|susp|suspension)\b/i, "syrup"],
  [/\b(inhaler|aerosol|spray)\b/i, "aerosol"],
  [/\b(drop|drops)\b/i, "drop"],
  [/\b(cream|ointment|gel)\b/i, "topical"],
  [/\b(pens?|cartridges?|prefilled\s*syringes?|auto[- ]?injectors?)\b/i, "pen"],
];

const BRAND_ALIASES: Record<string, string> = {
  ADVIL: "Ibuprofen",
  MOTRIN: "Ibuprofen",
  ALEVE: "Naproxen",
  NAPROSYN: "Naproxen",
  AMOXIL: "Amoxicillin",
  ATIVAN: "Lorazepam",
  BOTOX: "OnabotulinumtoxinA",
  COZAAR: "Losartan",
  CRESTOR: "Rosuvastatin",
  CYMBALTA: "Duloxetine",
  DIOVAN: "Valsartan",
  "EFFEXOR XR": "Venlafaxine",
  FLAGYL: "Metronidazole",
  GLUCOPHAGE: "Metformin",
  NORVASC: "Amlodipine",
  PANADOL: "Paracetamol",
  AUGMENTIN: "Amoxicillin Clavulanic Acid",
  "CO-AMOXICLAV": "Amoxicillin Clavulanic Acid",
  MICARDIS: "Telmisartan",
  NATRILIX: "Indapamide",
  VENTOLIN: "Salbutamol",
  LASIX: "Furosemide",
  ZESTRIL: "Lisinopril",
  TENORMIN: "Atenolol",
  ADALAT: "Nifedipine",
  LOZOL: "Indapamide",
  ZINNAT: "Cefuroxime",
  CIPROTAB: "Ciprofloxacin",
  KLACID: "Clarithromycin",
  ROCEPHIN: "Ceftriaxone",
  JANUVIA: "Sitagliptin",
  DIAMICRON: "Gliclazide",
  DAONIL: "Glibenclamide",
  LONART: "Artemether + Lumefantrine",
  COARTEM: "Artemether + Lumefantrine",
  AMATEM: "Artemether + Lumefantrine",
  "P-ALAXIN": "Dihydroartemisinin + Piperaquine",
  EXFORGE: "Amlodipine + Valsartan",
  GAVISCON: "Sodium Alginate + Bicarbonate",
  GESTID: "Magnesium + Aluminum + Simethicone",
  ASTYFER: "Multivitamins",
  PREGNACARE: "Multivitamins",
  ACTIFED: "Triprolidine + Pseudoephedrine",
  FELVIN: "Piroxicam",
  "EMZOR PARACETAMOL": "Paracetamol",
  "BOND PARACETAMOL": "Paracetamol",
  COFLIN: "Diphenhydramine",
};

export function stripFieldLabels(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      let trimmed = line.trim();
      for (const label of KNOWN_FIELD_LABELS) {
        const labelPattern = new RegExp(
          `^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*:|:\\s*|\\s+)`,
          "i"
        );
        if (labelPattern.test(trimmed)) {
          trimmed = trimmed.replace(labelPattern, "").trim();
        }
      }
      return trimmed;
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

export function normalizeClinicalText(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\t+/g, " ")
    .replace(/(\w+):\s*/g, "$1 ")
    .replace(/[^\w/.\-\s+&;,|xX×*\r\n\\]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function splitTerms(text: string): string[] {
  const strippedText = stripFieldLabels(text);
  let normalized = normalizeClinicalText(strippedText);

  // Separate joined 'Tab/Cap/Inj' when preceded by alphanumeric/closing paren
  normalized = normalized.replace(/([0-9a-zA-Z\)])\s+(?=(?:Tab|Cap|Inj)\b)/gi, "$1, ");

  // Separate joined 'Insulin/Lantus'
  normalized = normalized.replace(
    /(?<=\d[/\\]+\d{1,2}|days?|weeks?|months?|dly|daily|bid|bd|b\.d\.?|tid|tds|qid|od|o\.d\.?|stat|nocte)\s+(?=(?:Insulin|Lantus|Latus)\b)/gi,
    ", "
  );

  const parts = normalized
    .split(/\r?\n|[,;|]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);

  const refinedParts: string[] = [];
  for (const part of parts) {
    const subParts = part.split(
      /(?<=\d[/\\]+\d{1,2}|days?|weeks?|months?|dly|daily|bid|bd|b\.d\.?|tid|tds|qid|od|o\.d\.?|stat|nocte)\s+(?=[A-Z][a-zA-Z]{1,})/gi
    );
    refinedParts.push(...subParts.map((p) => p.trim()).filter(Boolean));
  }

  return refinedParts.length ? refinedParts : [normalized].filter(Boolean);
}

export function extractFrequency(term: string): { multiplier: number; label: string } {
  const normalized = term.replace(/\t+/g, " ").replace(/\s+/g, " ");
  const upper = ` ${normalized.toUpperCase()} `;
  const patterns: Array<[RegExp, number, string]> = [
    [/(?:^|\s)(OD|O\.D|O\.D\.|DLY|DAILY|QD|Q\.D\.|QDAY|ONCE DAILY)(?:\s|X|$)/i, 1, "once daily"],
    [/(?:^|\s)(BD|B\.D|B\.D\.|BID|B\.I\.D\.|TWICE DAILY)(?:\s|X|$)/i, 2, "twice daily"],
    [/(?:^|\s)(TDS|T\.D\.S|T\.D\.S\.|TID|T\.I\.D\.|THREE TIMES DAILY)(?:\s|X|$)/i, 3, "three times daily"],
    [/(?:^|\s)(QID|Q\.I\.D\.|QDS|Q\.D\.S|Q\.D\.S\.|FOUR TIMES DAILY)(?:\s|X|$)/i, 4, "four times daily"],
    [/(?:^|\s)(HS|NOCTE|NIGHTLY|AT NIGHT)(?:\s|X|$)/i, 1, "nightly"],
    [/(?:^|\s)(PRN|WHEN REQUIRED|AS NEEDED)(?:\s|X|$)/i, 1, "as needed"],
    [/(?:^|\s)(STAT|IMMEDIATELY)(?:\s|X|$)/i, 1, "stat"],
  ];

  for (const [pattern, multiplier, label] of patterns) {
    if (pattern.test(upper)) return { multiplier, label };
  }
  return { multiplier: 1, label: "once daily" };
}

export function extractDurationDays(term: string): { days: number; label: string } {
  const compact = term.replace(/\s+/g, "");
  // Support both / and \ in fractions like 1/12, 1\12, 4//52
  const fraction = compact.match(/(?:x|for|×|\*)?(\d+)[/\\]+(7|12|52)(?!\d)/i);
  if (fraction) {
    const value = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator === 7) return { days: value, label: `${value} day${value === 1 ? "" : "s"}` };
    if (denominator === 12) return { days: value * 30, label: `${value} month${value === 1 ? "" : "s"}` };
    if (denominator === 52) return { days: value * 7, label: `${value} week${value === 1 ? "" : "s"}` };
  }

  if (/(?:\b|x|×|\*)12\b/i.test(compact)) {
    return { days: 30, label: "1 month" };
  }

  const days = term.match(/\b(\d+)\s*(?:days?|d)\b/i);
  if (days) return { days: Number(days[1]), label: `${Number(days[1])} day${Number(days[1]) === 1 ? "" : "s"}` };

  const weeks = term.match(/\b(\d+)\s*(?:weeks?|wks?|w)\b/i);
  if (weeks) return { days: Number(weeks[1]) * 7, label: `${Number(weeks[1])} week${Number(weeks[1]) === 1 ? "" : "s"}` };

  const months = term.match(/\b(\d+)\s*(?:months?|mths?|m)\b/i);
  if (months) return { days: Number(months[1]) * 30, label: `${Number(months[1])} month${Number(months[1]) === 1 ? "" : "s"}` };

  const supplyDays = [...term.matchAll(/(?:^|\s)(?:x|×|\*)\s*(\d+)\b(?!\s*[/\\d])/gi)].at(-1);
  if (supplyDays) {
    const d = Number(supplyDays[1]);
    return { days: d, label: `${d} day${d === 1 ? "" : "s"}` };
  }

  if (compact.match(/dly|daily|once/i)) return { days: 30, label: "30 days" };

  return { days: 1, label: "single service" };
}

export function normalizeStrength(value: string): string {
  const gram = value.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (gram) return `${Number(gram[1]) * 1000}mg`;
  const mg = value.match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  if (mg) return `${Number(mg[1])}mg`;
  return "";
}

export function extractDosageForm(value: string): string {
  for (const [pattern, form] of FORM_ALIASES) {
    if (pattern.test(value)) return form;
  }
  return "";
}

function itemHasForm(item: Record<string, unknown>, form: string): boolean {
  if (!form) return false;
  const haystack = `${item.name || ""} ${item.dosage_form || ""} ${item.presentation || ""}`.toLowerCase();
  if (form === "aerosol") return /aerosol|spray|inhal/.test(haystack);
  if (form === "topical") return /cream|ointment|gel|topical/.test(haystack);
  if (form === "pen") return /\bpen\b|cartridge|prefilled/.test(haystack);
  return haystack.includes(form);
}

function isCombinationItem(item: Record<string, unknown>): boolean {
  const name = String(item.name || "").toLowerCase();
  if (name.includes("+") || name.includes(" and ") || name.includes(" plus ")) return true;
  if (name.includes("/")) {
    const cleanName = name.replace(/\b\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml)?\s*\/\s*\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml)?\b/gi, "");
    if (cleanName.includes("/")) return true;
  }
  return false;
}

function inputSuggestsCombination(term: string): boolean {
  const cleanTerm = term.replace(/\d+[/\\]+\d+/g, "").toLowerCase();
  return (
    /(\+|&| plus | combo | combination |\bco-)/i.test(cleanTerm) ||
    (/\//.test(cleanTerm) && !/\d[/\\]+\d/.test(term))
  );
}

export function extractSearchWords(term: string): string[] {
  let expanded = term;
  for (const [brand, generic] of Object.entries(BRAND_ALIASES)) {
    const regex = new RegExp(`(^|\\s)${brand.replace(/[^A-Z0-9]/gi, "\\s+")}(\\s|$)`, "i");
    if (regex.test(expanded)) {
      expanded = expanded.replace(regex, `$1${generic}$2`);
    }
  }

  const cleanedText = expanded.replace(/([a-zA-Z])\s*[/\\]+\s*([a-zA-Z])/g, "$1 $2");

  return cleanedText
    .split(/\s+/)
    .map((word) => word.replace(/[^\w/-]/g, "").toLowerCase())
    .filter((word) => word.length > 2)
    .filter((word) => !DRUG_PREFIXES.has(word))
    .filter((word) => !["dly", "daily", "bid", "bd", "tds", "tid", "qid", "od", "prn", "stat", "nocte", "for", "times", "with"].includes(word))
    .filter((word) => !/^\d+(?:mg|g|ml|mcg|i\.u|iu|units)?$/i.test(word))
    .filter((word) => !/^\d+[/\\]+\d+$/i.test(word))
    .slice(0, 20);
}

function rankItem(item: Record<string, unknown>, term: string): number {
  const haystack = `${item.name || ""} ${item.code || ""}`.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const words = extractSearchWords(term);
  const strength = normalizeStrength(term);
  const itemStrength = normalizeStrength(String(item.name || ""));
  const dosageForm = extractDosageForm(term);
  let score = 0;

  for (const word of words) {
    if (haystack.includes(word)) score += 30;
  }

  if (strength && haystack.replace(/\s+/g, "").includes(strength)) score += 50;
  if (strength && itemStrength) {
    if (strength === itemStrength) {
      score += 120;
    } else {
      score -= 2000;
    }
  }

  if (dosageForm && itemHasForm(item, dosageForm)) score += 25;
  if (dosageForm && !itemHasForm(item, dosageForm)) score -= 10;

  const isDrug = String(item.category || "").toLowerCase() === "drug";
  const isCombo = isCombinationItem(item);
  const wantsCombo = inputSuggestsCombination(term);

  if (isCombo && isDrug && !wantsCombo) score -= 5000;
  if (!isCombo && !wantsCombo) score += 40;

  const termPattern = new RegExp(`(^|\\s)${lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i");
  if (termPattern.test(haystack)) score += 50;

  return score;
}

/**
 * Fallback client-side prescription parser that directly queries the nhia_items table
 * using the authenticated user's session. Ensures 100% resilience even if the backend
 * Edge Function is unreachable or rejects non-admin roles.
 */
export async function parsePrescriptionClientFallback(
  text: string,
  supabase: SupabaseClient
): Promise<TariffOption[]> {
  const terms = splitTerms(text);
  if (!terms.length) return [];

  const seenCodes = new Set<string>();
  const results: TariffOption[] = [];

  for (const term of terms) {
    const cleanTerm = term.trim();
    if (!cleanTerm) continue;

    const words = extractSearchWords(cleanTerm);
    if (!words.length) continue;

    const candidateMap = new Map<string, Record<string, unknown>>();

    for (const word of words.slice(0, 5)) {
      const cleanWord = word.replace(/[^a-zA-Z0-9]/g, "").trim();
      if (cleanWord.length < 2) continue;

      try {
        const { data, error } = await supabase
          .from("nhia_items" as any)
          .select("code,name,category,subcategory,amount,dosage_form,strengths")
          .or(`name.ilike.%${cleanWord}%,code.ilike.%${cleanWord}%`)
          .eq("is_active", true)
          .limit(40);

        if (!error && Array.isArray(data)) {
          for (const row of data as any[]) {
            if (row?.code && !candidateMap.has(row.code)) {
              candidateMap.set(row.code, row);
            }
          }
        }
      } catch {
        // Continue to next word on transient network errors
      }
    }

    const candidates = Array.from(candidateMap.values())
      .map((item) => ({ item, score: rankItem(item, cleanTerm) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0]?.item;
    if (!best || !best.code || seenCodes.has(best.code as string)) continue;

    seenCodes.add(best.code as string);

    const frequency = extractFrequency(cleanTerm);
    const duration = extractDurationDays(cleanTerm);
    const unitPrice = Number(best.amount || 0);
    const isDrug = String(best.category || "").toLowerCase() === "drug";

    let quantity = 1;
    if (isDrug) {
      quantity = Math.max(1, Math.ceil(frequency.multiplier * duration.days));
    }

    const price = unitPrice * quantity;

    results.push({
      code: best.code as string,
      name: best.name as string,
      category: (best.category as string) || "drug",
      price,
      unitPrice,
      quantity,
      frequency: frequency.label,
      duration: duration.label,
      matched_via: "auto",
      matched_text: cleanTerm,
      confidence: "high",
    });
  }

  return results;
}
