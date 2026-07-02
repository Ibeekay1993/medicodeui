// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser } from "../_shared/auth.ts";

const CLINICAL_ABBREVIATIONS: Record<string, string[]> = {
  ECG: ["Electrocardiography"],
  EKG: ["Electrocardiography"],
  ECHO: ["Echocardiography"],
  FBC: ["Full Blood Count"],
  CBC: ["Full Blood Count"],
  PCV: ["Packed Cell Volume"],
  HB: ["Haemoglobin"],
  "U&E": ["Urea and Electrolytes"],
  "E&U": ["Urea and Electrolytes"],
  SE: ["Serum Electrolytes"],
  CR: ["Creatinine"],
  ESR: ["Erythrocyte Sedimentation Rate"],
  TSH: ["Thyroid Stimulating Hormone"],
  TFT: ["Thyroid Function Test"],
  CXR: ["Chest X-Ray"],
  USS: ["Ultrasound Scan"],
  MRI: ["Magnetic Resonance Imaging"],
  CT: ["Computed Tomography Scan"],
  RBS: ["Random Blood Sugar"],
  FBS: ["Fasting Blood Sugar"],
  HBA1C: ["Glycated Hemoglobin"],
  LFT: ["Liver Function Test"],
  KFT: ["Kidney Function Test"],
  MCS: ["Microscopy Culture and Sensitivity"],
  HVS: ["High Vaginal Swab"],
  ECS: ["Endocervical Swab"],
  UA: ["Urinalysis"],
  "I&D": ["Incision and Drainage"],
  POP: ["Plaster of Paris"],
  PT: ["Prothrombin Time"],
  APTT: ["Activated Partial Thromboplastin Time"],
  CS: ["Caesarean Section"],
  "C/S": ["Caesarean Section"],
  SVD: ["Spontaneous Vaginal Delivery"],
  ELECTROLYTES: ["Full Electrolytes", "Serum Electrolytes", "Urea and Electrolytes"],
  "E/U": ["Urea and Electrolytes"],
  LYTES: ["Serum Electrolytes", "Full Electrolytes"],
  "FULL ELECTROLYTES": ["Full Electrolytes"],
  "SERUM ELECTROLYTES": ["Serum Electrolytes"],
  LIPID: ["Lipid Profile", "Lipid Panel"],
  FBC: ["Full Blood Count", "Complete Blood Count"],
  "FULL BLOOD COUNT": ["Full Blood Count"],
  "COMPLETE BLOOD COUNT": ["Full Blood Count"],
  GLUCOSE: ["Random Blood Sugar", "Fasting Blood Sugar"],
  URINALYSIS: ["Urinalysis"],
  ELECTROCARDIOGRAPHY: ["Electrocardiography"],
  ECHOCARDIOGRAPHY: ["Echocardiography"],
  LIVER: ["Liver Function Test"],
  KIDNEY: ["Kidney Function Test"],
  THYROID: ["Thyroid Function Test", "Thyroid Stimulating Hormone"],
};

/**
 * Canonical field name mappings for standardizing hospital data input.
 * Maps various hospital-specific field labels to canonical normalized field names.
 */
const STANDARD_FIELDS: Record<string, string[]> = {
  patient: ["patient", "patients", "pt", "patient_name", "patient:", "patient name", "patient's name"],
  code: ["code", "auth_code", "authorization", "service_code", "code:", "auth code", "authorization code", "auth"],
  diagnosis: ["diagnosis", "dx", "clinical_diagnosis", "diagnosis:", "clinical diagnosis", "diagnoses"],
  policy: ["policy", "policy_number", "policy no", "enrollment", "enrollment_id", "policy:", "policy no:"],
  hospital: ["hospital", "facility", "clinic", "medical_center", "hospital:", "facility:", "referring hospital"],
  service: ["service", "services", "treatment", "treatments", "drug", "drugs", "medication", "medications", "rx", "prescription"],
  medication: ["medication", "medications", "drug", "drugs", "rx", "prescription", "medicine", "meds", "service:"],
  dose: ["dose", "dosage", "strength", "dose:", "dosage:"],
  frequency: ["frequency", "freq", "how often", "frequency:", "freq:"],
  duration: ["duration", "dur", "how long", "for", "duration:", "dur:"],
  quantity: ["quantity", "qty", "amount", "quantity:", "qty:"],
  email: ["email", "e-mail", "email address", "mail", "email:"],
  email: ["email", "e-mail", "email address", "mail", "email:"],
  phone: ["phone", "phone number", "tel", "telephone", "mobile", "phone:"],
};

const SPECIALIST_REVIEW_TERMS = [
  "follow up",
  "follow-up",
  "review",
  "clinic review",
  "specialist review",
  "consultant review",
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

const DRUG_PREFIXES = new Set([
  "tab",
  "tabs",
  "tablet",
  "tablets",
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
]);

const FORM_ALIASES: Array<[RegExp, string]> = [
  [/\b(tab|tabs|tablet|tablets)\b/i, "tablet"],
  [/\b(cap|caps|capsule|capsules)\b/i, "capsule"],
  [/\b(inj|injection|amp|ampoule|vial)\b/i, "injection"],
  [/\b(syr|syrup|susp|suspension)\b/i, "syrup"],
  [/\b(inhaler|aerosol|spray)\b/i, "aerosol"],
  [/\b(drop|drops)\b/i, "drop"],
  [/\b(cream|ointment|gel)\b/i, "topical"],
];

/**
 * Build a set of known field labels (lowercased, without trailing colon) for
 * use in stripping field label prefixes from unstructured text.
 */
function buildKnownLabelSet(): Set<string> {
  const labels = new Set<string>();
  for (const variations of Object.values(STANDARD_FIELDS)) {
    for (const v of variations) {
      labels.add(v.toLowerCase().replace(/:$/, ""));
    }
  }
  return labels;
}

const KNOWN_FIELD_LABELS = buildKnownLabelSet();

/**
 * Strips known field label prefixes (e.g., "Patient:", "Code:", "Diagnosis:")
 * from each line of text, preserving the value portion that follows.
 * This prevents field labels from interfering with medical term parsing.
 */
function stripFieldLabels(text: string): string {
  return text
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim();
      for (const label of KNOWN_FIELD_LABELS) {
        const labelPattern = new RegExp(
          `^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s:]*`,
          "i"
        );
        if (labelPattern.test(trimmed)) {
          return trimmed.replace(labelPattern, "").trim();
        }
      }
      return trimmed;
    })
    .filter(line => line.length > 0)
    .join("\n");
}

function normalizeClinicalText(value: string) {
  return String(value || "")
    .normalize("NFKD")
    // Remove tab characters entirely before any other processing
    .replace(/\t+/g, " ")
    // Strip colons when they appear after field labels (e.g., "Patient:" -> "Patient")
    .replace(/(\w+):\s*/g, "$1 ")
    // Keep word chars, slash, dot, dash, space, plus, ampersand, comma, pipe, x/×/*, newlines
    .replace(/[^\w/.\-\s+&;,|xX×*\r\n]+/g, " ")
    // Collapse multiple spaces/tabs into single space
    .replace(/[ \t]+/g, " ")
    .trim();
}

function splitTerms(text: string) {
  // First strip known field labels from the text so they don't interfere
  const strippedText = stripFieldLabels(text);
  const normalized = normalizeClinicalText(strippedText);

  // Step 1: Split by newlines, then by common punctuation and conjunctions
  const parts = normalized
    .split(/\r?\n|[\+,\&;\|]|\band\b|\bthen\b|\bwith\b|\bplus\b/gi)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);

  // Step 2: Heuristic split for joined prescriptions (e.g., "Drug A ... Drug B ...")
  // Look for a duration/frequency followed by a capitalized word that might be another drug
  const refinedParts: string[] = [];
  for (const part of parts) {
    // This splits "Amlodipine 10mg dly 1/12 Losartan 25mg" into two
    const subParts = part.split(/(?<=\d\/\d{1,2}|days?|weeks?|months?|dly|daily|bid|tid|qid|od|stat|nocte)\s+(?=[A-Z][a-z]{2,})/gi);
    refinedParts.push(...subParts.map(p => p.trim()).filter(Boolean));
  }

  return refinedParts.length ? refinedParts : [normalized].filter(Boolean);
}

function extractFrequency(term: string) {
  // Normalize whitespace first (handle tabs, multiple spaces)
  const normalized = term.replace(/\t+/g, " ").replace(/\s+/g, " ");
  const upper = ` ${normalized.toUpperCase()} `;
  const patterns: Array<[RegExp, number, string]> = [
    [/(?:^|\s)(OD|DLY|DAILY|QD|Q\.D\.|QDAY|ONCE DAILY)(?:\s|X|$)/i, 1, "once daily"],
    [/(?:^|\s)(BD|BID|B\.I\.D\.|TWICE DAILY)(?:\s|X|$)/i, 2, "twice daily"],
    [/(?:^|\s)(TDS|TID|T\.I\.D\.|THREE TIMES DAILY)(?:\s|X|$)/i, 3, "three times daily"],
    [/(?:^|\s)(QID|Q\.I\.D\.|FOUR TIMES DAILY)(?:\s|X|$)/i, 4, "four times daily"],
    [/(?:^|\s)(HS|NOCTE|NIGHTLY|AT NIGHT)(?:\s|X|$)/i, 1, "nightly"],
    [/(?:^|\s)(PRN|WHEN REQUIRED|AS NEEDED)(?:\s|X|$)/i, 1, "as needed"],
    [/(?:^|\s)(STAT|IMMEDIATELY)(?:\s|X|$)/i, 1, "stat"],
  ];

  for (const [pattern, multiplier, label] of patterns) {
    if (pattern.test(upper)) return { multiplier, label };
  }
  return { multiplier: 1, label: "once daily" };
}

function extractDurationDays(term: string) {
  const compact = term.replace(/\s+/g, "");
  const fraction = compact.match(/(?:x|for|×|\*)?(\d+)\/(7|12|52)\b/i);
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

  if (compact.match(/dly|daily|once/i)) return { days: 30, label: "30 days" };

  return { days: 1, label: "single service" };
}

function extractDoseMultiplier(term: string) {
  const dose = term.match(/\b(?:take\s*)?(\d+(?:\.\d+)?)\s*(?:tabs?|tablets?|caps?|capsules?)\b/i);
  const parsed = dose ? Number(dose[1]) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeStrength(value: string) {
  const gram = value.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (gram) return `${Number(gram[1]) * 1000}mg`;
  const mg = value.match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  if (mg) return `${Number(mg[1])}mg`;
  return "";
}

function extractDosageForm(value: string) {
  for (const [pattern, form] of FORM_ALIASES) {
    if (pattern.test(value)) return form;
  }
  return "";
}

function itemHasForm(item: any, form: string) {
  if (!form) return false;
  const haystack = `${item.name || ""} ${item.dosage_form || ""} ${item.presentation || ""}`.toLowerCase();
  if (form === "aerosol") return /aerosol|spray|inhal/.test(haystack);
  if (form === "topical") return /cream|ointment|gel|topical/.test(haystack);
  return haystack.includes(form);
}

function normalizeDrugToken(value: string) {
  return value.toUpperCase()
    // Remove tab characters
    .replace(/\t+/g, " ")
    // Strip colons after field labels
    .replace(/(\w+):\s*/g, "$1 ")
    // Keep only alphanumeric
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function expandBrandAliases(term: string) {
  const normalized = normalizeDrugToken(term);
  const expansions: Array<{ brand: string; generic: string }> = [];
  for (const [brand, generic] of Object.entries(BRAND_ALIASES)) {
    const pattern = new RegExp(`(^|\\s)${brand.replace(/[^A-Z0-9]/g, "\\s+")}(\\s|$)`, "i");
    if (pattern.test(normalized)) expansions.push({ brand, generic });
  }
  return expansions;
}

function normalizeHospitalText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    // Remove tab characters
    .replace(/\t+/g, " ")
    // Strip colons after field labels
    .replace(/(\w+):\s*/g, "$1 ")
    // Replace non-alphanumeric sequences with single space
    .replace(/[^a-z0-9]+/g, " ")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    .trim();
}

function hospitalAcronym(value: string) {
  return normalizeHospitalText(value)
    .split(/\s+/)
    .filter((part) => !["of", "and", "the", "for"].includes(part))
    .map((part) => part[0])
    .join("");
}

function scoreHospitalMatch(hospital: any, text: string) {
  const source = normalizeHospitalText(text);
  const name = normalizeHospitalText(hospital?.name);
  const code = normalizeHospitalText(hospital?.code);
  const short = hospitalAcronym(hospital?.name || "");
  if (!source || !name) return 0;
  if (code && new RegExp(`\\b${code}\\b`, "i").test(source)) return 120;
  if (short && new RegExp(`\\b${short}\\b`, "i").test(source)) return 115;
  if (source.includes(name)) return 110;
  const words = name.split(/\s+/).filter((part) => part.length > 3);
  const matched = words.filter((word) => source.includes(word)).length;
  if (matched >= 2) return 60 + matched * 5;
  return 0;
}

function isCombinationItem(item: any) {
  const name = String(item.name || "").toLowerCase();
  if (name.includes("+") || name.includes(" and ") || name.includes(" plus ")) return true;
  if (name.includes("/")) {
    const cleanName = name.replace(/\b\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml)?\s*\/\s*\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml)?\b/gi, "");
    if (cleanName.includes("/")) return true;
  }
  return false;
}

function inputSuggestsCombination(term: string) {
  // Remove fractions like 1/12, 1/7, 1/52 which are common for durations
  const cleanTerm = term.replace(/\d+\/\d+/g, "").toLowerCase();
  // Check for combination indicators
  return /(\+| plus | combo | combination |\bco-)/i.test(cleanTerm) || 
         (/\//.test(cleanTerm) && !/\d\/\d/.test(term));
}

function extractSearchWords(term: string) {
  const brandExpanded = expandBrandAliases(term).reduce(
    (current, alias) => current.replace(new RegExp(alias.brand, "ig"), alias.generic),
    normalizeClinicalText(term),
  );

  // Replace slash '/' between letters with space to split combination drugs like amiloride/hydrochlorothiazide
  const cleanedText = brandExpanded.replace(/([a-zA-Z])\s*\/\s*([a-zA-Z])/g, "$1 $2");

  return cleanedText
    .split(/\s+/)
    .map((word) => word.replace(/[^\w/-]/g, "").toLowerCase())
    .filter((word) => word.length > 2)
    .filter((word) => !DRUG_PREFIXES.has(word))
    .filter((word) => !["dly", "daily", "bid", "bd", "tds", "tid", "qid", "od", "prn", "stat", "nocte", "for", "times", "with"].includes(word))
    .filter((word) => !/^\d+(?:mg|g|ml|mcg|i\.u|iu|units)?$/i.test(word))
    .slice(0, 20);
}

function rankItem(item: any, term: string, expandedNames: string[]) {
  const haystack = `${item.name || ""} ${item.code || ""}`.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const words = extractSearchWords(term);
  const strength = normalizeStrength(term);
  const itemStrength = normalizeStrength(String(item.name || ""));
  const dosageForm = extractDosageForm(term);
  const brandAliases = expandBrandAliases(term);
  let score = 0;

  if (expandedNames.some((name) => haystack.includes(name.toLowerCase()))) score += 120;
  for (const alias of brandAliases) {
    if (haystack.includes(alias.generic.toLowerCase())) score += 70;
  }
  for (const word of words) {
    if (haystack.includes(word)) score += 18;
  }
  if (strength && haystack.replace(/\s+/g, "").includes(strength)) score += 45;
  if (strength && itemStrength && itemStrength !== strength) score -= 1000;
  if (dosageForm && itemHasForm(item, dosageForm)) score += 20;
  if (dosageForm && !itemHasForm(item, dosageForm)) score -= 8;
  
  const isDrug = String(item.category || "").toLowerCase() === "drug";
  
  // CRITICAL: Heavily penalize combination drugs if the input term is a single drug
  if (isCombinationItem(item) && isDrug && !inputSuggestsCombination(term)) {
    score -= 5000; 
  }
  
  // Bonus for single item matching single term
  if (!isCombinationItem(item) && !inputSuggestsCombination(term)) {
    score += 40; 
  }
  
  if (String(item.category || "").toLowerCase() === "drug" && (strength || words.some((word) => DRUG_PREFIXES.has(word)))) score += 15;
  
  // Use whole word match for lowerTerm instead of substring
  const termPattern = new RegExp(`(^|\\s)${lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i");
  if (termPattern.test(haystack)) score += 40;
  
  return score;
}

async function findBestItem(supabase: any, term: string) {
  const upperTerm = term.toUpperCase().trim();
  const lowerTerm = term.toLowerCase();
  const abbreviationNames = CLINICAL_ABBREVIATIONS[upperTerm] || [];
  const expandedNames = [...abbreviationNames];

  for (const [abbr, names] of Object.entries(CLINICAL_ABBREVIATIONS)) {
    const pattern = new RegExp(`(^|\\s)${abbr.replace("/", "\\/")}(\\s|$)`, "i");
    if (pattern.test(term)) expandedNames.push(...names);
  }

  if (SPECIALIST_REVIEW_TERMS.some((phrase) => lowerTerm.includes(phrase))) {
    expandedNames.push("Specialist Review");
  }

  const brandAliases = expandBrandAliases(term);
  const directSearches = [
    ...expandedNames,
    ...brandAliases.map((alias) => alias.generic),
    ...extractSearchWords(term),
    term,
  ].filter(Boolean);

  const seen = new Map<string, any>();

  const addRows = (rows: any[] | null | undefined) => {
    for (const row of rows || []) {
      if (row?.code && !seen.has(row.code)) seen.set(row.code, row);
    }
  };

  // Targeted Code Search (e.g. NHIA-12-04-48)
  const codeMatch = term.match(/(?:NHIA|HMO)[- ]\d+[- ]\d+[- ]\d+/i) || term.match(/\d+[- ]\d+[- ]\d+/);
  if (codeMatch) {
    const cleanCode = codeMatch[0].replace(/\s+/g, "-");
    const { data: codeRows } = await supabase
      .from("nhia_items")
      .select("*")
      .or(`code.ilike.${cleanCode},code.ilike.%${cleanCode}%`)
      .eq("is_active", true)
      .limit(50);
    addRows(codeRows);
  }

  const { data: exactCode } = await supabase
    .from("nhia_items")
    .select("*")
    .or(`code.ilike.${term},code.ilike.%${term}%`)
    .eq("is_active", true)
    .limit(50);
  addRows(exactCode);

  const { data: abbreviationRows } = await supabase
    .from("abbreviations")
    .select("shorthand, confidence, nhia_items!inner(*)")
    .ilike("shorthand", term)
    .limit(50);
  for (const row of abbreviationRows || []) addRows([(row as any).nhia_items]);

  const { data: arrayRows } = await supabase
    .from("nhia_items")
    .select("*")
    .contains("common_abbreviations", [upperTerm])
    .eq("is_active", true)
    .limit(50);
  addRows(arrayRows);

  for (const query of directSearches.slice(0, 30)) {
    const { data } = await supabase
      .from("nhia_items")
      .select("*")
      .or(`name.ilike.%${query}%,code.ilike.%${query}%`)
      .eq("is_active", true)
      .limit(50);
    addRows(data);
  }

  const candidates = Array.from(seen.values())
    .map((item) => ({ item, score: rankItem(item, term, expandedNames) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.item || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await validateUser(req, ["utilization_manager", "admin", "hospital", "claims"]);
    const { text } = await req.json();
    if (!text) throw new Error("Text required");

    const supabase = getServiceClient();
    const seen = new Set<string>();
    const items: any[] = [];

    // Trim whitespace from entire input text (handle leading/trailing tabs, spaces)
    const trimmedText = String(text).replace(/\t+/g, " ").trim();

    const { data: hospitalRows } = await supabase
      .from("hospitals")
      .select("id,name,code,state")
      .eq("is_active", true)
      .limit(500);
    const referralHospital = (hospitalRows || [])
      .map((hospital: any) => ({ hospital, score: scoreHospitalMatch(hospital, trimmedText) }))
      .filter((entry: any) => entry.score > 0)
      .sort((left: any, right: any) => right.score - left.score)[0]?.hospital || null;

    const terms = splitTerms(trimmedText);
    for (const term of terms) {
      const cleanTerm = String(term || "").trim();
      if (!cleanTerm) continue;

      const item = await findBestItem(supabase, cleanTerm);
      if (!item || seen.has(item.code)) continue;


      const frequency = extractFrequency(term);
      const duration = extractDurationDays(term);
      const doseMultiplier = extractDoseMultiplier(term);
      const unitPrice = Number(item.amount || 0);
      const isDrug = String(item.category || "").toLowerCase() === "drug";
      const quantity = isDrug
        ? Math.max(1, Math.ceil(frequency.multiplier * duration.days * doseMultiplier))
        : 1;
      const amount = unitPrice * quantity;

      seen.add(item.code);
      items.push({
        code: item.code,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        amount,
        unit_price: unitPrice,
        quantity,
        dosage_form: item.dosage_form,
        strengths: item.strengths,
        matched_via: expandBrandAliases(term).length ? "brand" : CLINICAL_ABBREVIATIONS[term.toUpperCase()] ? "abbreviation" : "text",
        matched_text: term,
        confidence: "high",
        frequency: frequency.label,
        duration: duration.label,
        duration_days: duration.days,
        dose_multiplier: doseMultiplier,
      });
    }

    const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return new Response(JSON.stringify({
      success: true,
      text,
      count: items.length,
      total,
      items,
      referral_hospital: referralHospital
        ? {
            id: referralHospital.id,
            name: referralHospital.name,
            code: referralHospital.code,
            state: referralHospital.state,
          }
        : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Parse failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
