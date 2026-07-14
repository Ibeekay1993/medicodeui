import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser } from "../_shared/auth.ts";

const CLINICAL_ABBREVIATIONS: Record<string, string[]> = {
  ECG: ["Electrocardiography (ECG)", "Electrocardiography (E C G)"],
  EKG: ["Electrocardiography (ECG)", "Electrocardiography (E C G)"],
  FBC: ["Full Blood Count (FBC)"],
  CBC: ["Full Blood Count (FBC)"],
  TSH: ["Thyroid Stimulating Hormones (TSH)", "Thyroid Stimulating Hormone"],
  CXR: ["Chest X-Ray", "Chest X Ray", "Chest"],
  CS: ["Caesarean Section"],
  "C/S": ["Caesarean Section"],
  REVIEW: ["Specialist Review"],
  "FOLLOW UP": ["Specialist Review"],
  "FOLLOW-UP": ["Specialist Review"],
  ELECTROLYTES: ["Full Electrolytes", "Serum Electrolytes", "Urea and Electrolytes"],
  "E/U": ["Urea and Electrolytes"],
  LYTES: ["Serum Electrolytes", "Full Electrolytes"],
  "FULL ELECTROLYTES": ["Full Electrolytes"],
  "SERUM ELECTROLYTES": ["Serum Electrolytes"],
  ESR: ["Erythrocyte Sedimentation Rate"],
  LFT: ["Liver Function Test"],
  KFT: ["Kidney Function Test"],
  "U&E": ["Urea and Electrolytes"],
  "E&U": ["Urea and Electrolytes"],
  SE: ["Serum Electrolytes"],
};

const BRAND_ALIASES: Record<string, string> = {
  COZAAR: "Losartan",
  GLUCOPHAGE: "Metformin",
  NORVASC: "Amlodipine",
  AUGMENTIN: "Amoxicillin Clavulanic Acid",
  "CO-AMOXICLAV": "Amoxicillin Clavulanic Acid",
  PANADOL: "Paracetamol",
  DIOVAN: "Valsartan",
  MICARDIS: "Telmisartan",
  NATRILIX: "Indapamide",
  VENTOLIN: "Salbutamol",
  LASIX: "Furosemide",
  ZESTRIL: "Lisinopril",
  TENORMIN: "Atenolol",
  ADALAT: "Nifedipine",
  LOZOL: "Indapamide",
};

const BRAND_PATTERNS = [
  { pattern: /(^|\s)COZAAR(\s|$)/i, generic: "Losartan" },
  { pattern: /(^|\s)GLUCOPHAGE(\s|$)/i, generic: "Metformin" },
  { pattern: /(^|\s)NORVASC(\s|$)/i, generic: "Amlodipine" },
  { pattern: /(^|\s)AUGMENTIN(\s|$)/i, generic: "Amoxicillin Clavulanic Acid" },
  { pattern: /(^|\s)CO-AMOXICLAV(\s|$)/i, generic: "Amoxicillin Clavulanic Acid" },
  { pattern: /(^|\s)PANADOL(\s|$)/i, generic: "Paracetamol" },
  { pattern: /(^|\s)DIOVAN(\s|$)/i, generic: "Valsartan" },
  { pattern: /(^|\s)MICARDIS(\s|$)/i, generic: "Telmisartan" },
  { pattern: /(^|\s)NATRILIX(\s|$)/i, generic: "Indapamide" },
  { pattern: /(^|\s)VENTOLIN(\s|$)/i, generic: "Salbutamol" },
  { pattern: /(^|\s)LASIX(\s|$)/i, generic: "Furosemide" },
  { pattern: /(^|\s)ZESTRIL(\s|$)/i, generic: "Lisinopril" },
  { pattern: /(^|\s)TENORMIN(\s|$)/i, generic: "Atenolol" },
  { pattern: /(^|\s)ADALAT(\s|$)/i, generic: "Nifedipine" },
  { pattern: /(^|\s)LOZOL(\s|$)/i, generic: "Indapamide" }
];

const CLINICAL_ABBREVIATIONS_MAP = new Map(Object.entries(CLINICAL_ABBREVIATIONS));
const BRAND_ALIASES_MAP = new Map(Object.entries(BRAND_ALIASES));

export interface NHIAItem {
  code?: string;
  name?: string;
  category?: string;
  subcategory?: string;
  amount?: number;
  [key: string]: unknown;
}

function normalizeStrength(value: string) {
  const normalized = String(value || "").toLowerCase()
    .replace(/\t+/g, "")    // Remove tabs
    .replace(/(\w+):\s*/g, "$1") // Strip field label colons
    .replace(/\s+/g, "");   // Remove all whitespace
  // eslint-disable-next-line security/detect-unsafe-regex
  const gram = normalized.match(/\b(\d{1,5}(?:\.\d{1,5})?)g\b/);
  if (gram) return `${Number(gram[1]) * 1000}mg`;
  // eslint-disable-next-line security/detect-unsafe-regex
  const mg = normalized.match(/\b(\d{1,5}(?:\.\d{1,5})?)mg\b/);
  if (mg) return `${Number(mg[1])}mg`;
  return "";
}

function isCombinationItem(item: NHIAItem) {
  const name = String(item.name || "").toLowerCase();
  if (name.includes("+") || name.includes(" and ") || name.includes(" plus ")) return true;
  if (name.includes("/")) {
    // eslint-disable-next-line security/detect-unsafe-regex
    const cleanName = name.replace(/\b\d{1,5}(?:\.\d{1,5})?\s{0,3}(?:mg|g|mcg|ml)?\s{0,3}\/\s{0,3}\d{1,5}(?:\.\d{1,5})?\s{0,3}(?:mg|g|mcg|ml)?\b/gi, "");
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

function expandBrandAliases(term: string) {
  const normalized = term.toUpperCase()
    .replace(/\t+/g, " ")       // Replace tabs with space
    .replace(/(\w+):\s*/g, "$1 ") // Strip field label colons
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  const found: string[] = [];
  for (const { pattern, generic } of BRAND_PATTERNS) {
    if (pattern.test(normalized)) found.push(generic);
  }
  return found;
}

function scoreResult(item: NHIAItem, searchTerm: string, expandedTerms: string[]) {
  const haystack = `${item.name || ""} ${item.code || ""}`.toLowerCase();
  const lower = searchTerm.toLowerCase();
  const requestedStrength = normalizeStrength(searchTerm);
  const itemStrength = normalizeStrength(String(item.name || ""));
  let score = 0;

  if (haystack.includes(lower)) score += 30;
  for (const term of expandedTerms) {
    if (haystack.includes(term.toLowerCase())) score += 70;
  }
  for (const token of lower.split(/\s+/).filter((part) => part.length > 2)) {
    if (haystack.includes(token)) score += 12;
  }
  if (requestedStrength && itemStrength === requestedStrength) score += 80;
  if (requestedStrength && itemStrength && itemStrength !== requestedStrength) score -= 90;
  const isDrug = String(item.category || "").toLowerCase() === "drug";
  if (isCombinationItem(item) && isDrug && !inputSuggestsCombination(searchTerm)) score -= 80;
  return score;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await validateUser(req, ["utilization_manager", "hospital", "admin", "claims"]);

    const { query, category } = await req.json();
    if (!query) throw new Error("Query required");

    const supabase = getServiceClient();
    const searchTerm = String(query).trim();
    const searchLower = searchTerm.toLowerCase();
    const searchUpper = searchTerm.toUpperCase();
    const expandedTerms = [
      ...(CLINICAL_ABBREVIATIONS_MAP.get(searchUpper) || []),
      ...(BRAND_ALIASES_MAP.has(searchUpper) ? [BRAND_ALIASES_MAP.get(searchUpper) as string] : []),
      ...expandBrandAliases(searchTerm),
    ];

    interface QueryBuilder {
      eq(column: string, value: unknown): QueryBuilder;
      [key: string]: unknown;
    }

    const addCategory = (builder: QueryBuilder) => {
      if (category) return builder.eq("category", category);
      return builder;
    };

    const { data: exact } = await addCategory(
      supabase.from("nhia_items").select("*").or(`code.ilike.${searchTerm},code.ilike.%${searchTerm}%`).eq("is_active", true) as unknown as QueryBuilder
    ) as unknown as { data: NHIAItem[] | null };

    const { data: nameMatch } = await addCategory(
      supabase.from("nhia_items").select("*").or(`name.ilike.%${searchTerm}%,subcategory.ilike.%${searchTerm}%`).eq("is_active", true) as unknown as QueryBuilder
    ) as unknown as { data: NHIAItem[] | null };

    const { data: arrayMatch } = await addCategory(
      supabase.from("nhia_items").select("*").contains("common_abbreviations", [searchUpper]).eq("is_active", true) as unknown as QueryBuilder
    ) as unknown as { data: NHIAItem[] | null };

    const { data: abbrevMatch } = await supabase
      .from("abbreviations")
      .select("shorthand, confidence, nhia_items!inner(*)")
      .ilike("shorthand", searchTerm)
      .limit(100);

    const expandedMatches = await Promise.all(
      expandedTerms.map((term) =>
        addCategory(
          supabase.from("nhia_items")
            .select("code,name,amount,category,subcategory")
            .or(`name.ilike.%${term}%,code.ilike.%${term}%,subcategory.ilike.%${term}%`)
            .eq("is_active", true)
            .limit(100) as unknown as QueryBuilder
        ) as unknown as { data: NHIAItem[] | null },
      ),
    );

    const seen = new Set<string>();
    const results: NHIAItem[] = [];

    for (const item of [
      ...(exact || []),
      ...(nameMatch || []),
      ...(arrayMatch || []),
      ...expandedMatches.flatMap((result) => result.data || []),
    ]) {
      if (item.code && !seen.has(item.code)) {
        seen.add(item.code);
        results.push(item as NHIAItem);
      }
    }

    for (const match of abbrevMatch || []) {
      const item = (match as Record<string, unknown>).nhia_items as NHIAItem;
      if (!item || seen.has(item.code)) continue;
      if (category && item.category !== category) continue;
      seen.add(item.code || "");
      results.push({ ...item, matched_via: "abbreviation", confidence: (match as Record<string, unknown>).confidence as number });
    }

    // If query is a short prefix (3+ chars), also fetch partial/substring matches
    if (searchTerm.length >= 3) {
      const { data: partialMatches } = await supabase
        .from("nhia_items")
        .select("code,name,amount,category,subcategory")
        .or(`name.ilike.%${searchTerm}%,subcategory.ilike.%${searchTerm}%,common_abbreviations.cs.{${searchUpper}}`)
        .eq("is_active", true)
        .limit(200);
      
      for (const item of partialMatches || []) {
        if (item.code && !seen.has(item.code)) {
          seen.add(item.code);
          results.push(item as NHIAItem);
        }
      }
    }

    results.sort((left, right) => {
      if (left.code?.toLowerCase() === searchLower) return -1;
      if (right.code?.toLowerCase() === searchLower) return 1;
      const scoreDiff = scoreResult(right, searchTerm, expandedTerms) - scoreResult(left, searchTerm, expandedTerms);
      if (scoreDiff !== 0) return scoreDiff;
      return String(left.name).localeCompare(String(right.name));
    });

    return new Response(JSON.stringify({
      success: true,
      query: searchTerm,
      count: results.length,
      results: results.slice(0, 500),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Search failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
