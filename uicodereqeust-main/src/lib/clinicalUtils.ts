export type TariffOption = {
  code: string | null;
  name: string;
  category: string | null;
  price: number;
  unitPrice?: number;
  quantity?: number;
  frequency?: string | null;
  duration?: string | null;
  matched_via?: string;
  matched_text?: string;
  confidence?: string;
  original_text?: string;
  declined?: boolean;
  decline_reason?: string | null;
};

export function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function itemUnitPrice(item: TariffOption) {
  return Number(item.unitPrice ?? item.price ?? 0);
}

export function itemQuantity(item: TariffOption) {
  const quantity = Number(item.quantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

export function itemTotal(item: TariffOption) {
  if (item.declined) return 0;
  return itemUnitPrice(item) * itemQuantity(item);
}

export function cleanPatientName(name: string) {
  if (!name) return "";
  return name
    .split(/diagnosis/i)[0]
    .replace(/\b(null|nil|none|undefined|n\/a|na)\b/gi, "")
    .replace(/\b(mr|mrs|ms|miss|dr|prof|master|chief|alhaji|alhaja|pastor|rev|nurse|pharm)\b\.?/gi, "")
    .replace(/\b0[789][01]\d{8}\b/g, "") // Nigerian 11-digit phone numbers
    .replace(/\b\d{7,}\b/g, "") // Any long digit sequence/phone
    .replace(/[:\-_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanDiagnosisText(diagnosis: string, patientName: string) {
  const raw = String(diagnosis || "").trim();
  if (!raw) return "";

  const normalized = raw.replace(/^diagnosis[:\s-]*/i, "").trim();
  const name = cleanPatientName(patientName);
  if (name && normalized.toLowerCase().startsWith(name.toLowerCase())) {
    return normalized.slice(name.length).replace(/^[:\-\s]+/, "").trim() || normalized;
  }
  return normalized;
}

export function normalizePolicyNumber(value: unknown) {
  return String(value ?? "")
    .replace(/[^\dA-Za-z-]/g, "")
    .replace(/\.0+$/, "")
    .trim();
}

export function normalizePolicyRoot(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  
  // Extract core numeric sequence if 4+ digits (e.g. 2173573-1 -> 2173573, OY/2173573/01 -> 2173573)
  const numMatch = raw.match(/([0-9]{4,12})/);
  if (numMatch) {
    return numMatch[1];
  }
  
  const base = raw.replace(/[-_/]\d*$/, "");
  return normalizePolicyNumber(base);
}

export function recordMatchesPolicy(record: any, policy: string) {
  const recordRawPolicy = String(record?.policy_number || record?.nhis_no || record?.plan_code || "").trim();
  if (!recordRawPolicy && !policy) return false;

  const recordPolicy = normalizePolicyNumber(recordRawPolicy);
  const normalizedPolicy = normalizePolicyNumber(policy);
  const recordRoot = normalizePolicyRoot(recordRawPolicy);
  const policyRoot = normalizePolicyRoot(policy);

  if (recordPolicy && normalizedPolicy && recordPolicy === normalizedPolicy) return true;
  if (recordRoot && policyRoot && recordRoot === policyRoot) return true;
  if (recordPolicy && policyRoot && (recordPolicy.startsWith(policyRoot) || recordPolicy.includes(policyRoot))) return true;
  if (normalizedPolicy && recordRoot && (normalizedPolicy.startsWith(recordRoot) || normalizedPolicy.includes(recordRoot))) return true;

  // Name fallback match for same patient if policy numbers are slightly dissimilar
  const recordName = normalizePatientNameForMatch(record?.patient_name || record?.name);
  const targetName = normalizePatientNameForMatch(record?.target_patient_name || policy);
  if (recordName && targetName && recordName === targetName) return true;

  return false;
}

export function recordMatchesHistory(record: any, policy: string) {
  return policy ? recordMatchesPolicy(record, policy) : false;
}

export function normalizePatientNameForMatch(value: unknown) {
  const cleaned = cleanPatientName(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();

  return cleaned
    .split(/\s+/)
    .filter(w => w.length >= 2 && !["null", "nil", "none", "na", "undefined"].includes(w))
    .sort()
    .join(" ");
}

export function canDeleteRequestRecord(record: any) {
  const status = String(record?.status || "").toLowerCase().trim();
  return status === "pending";
}

export function getInitials(nameOrEmail?: string | null) {
  const raw = String(nameOrEmail || "").trim();
  const source = raw.includes("@") ? raw.split("@")[0].replace(/[._-]+/g, " ") : raw;
  const parts = source
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "AG";
}

export function parseReferralTreatment(treatmentText: string) {
  const originalMarker = "[ORIGINAL REFERRAL REASON";
  const proposedMarker = "[PROPOSED TREATMENT PLAN";
  
  const text = treatmentText || "";
  
  if (text.includes(originalMarker) && text.includes(proposedMarker)) {
    const origIndex = text.indexOf(originalMarker);
    const propIndex = text.indexOf(proposedMarker);
    
    // Extract original request
    let original = text.substring(origIndex, propIndex).trim();
    const firstNewline = original.indexOf("\n");
    if (firstNewline !== -1) {
      original = original.substring(firstNewline).trim();
    }
    
    // Extract proposed request
    let proposed = text.substring(propIndex).trim();
    const propNewline = proposed.indexOf("\n");
    if (propNewline !== -1) {
      proposed = proposed.substring(propNewline).trim();
    }
    
    return { original, proposed };
  }
  
  return { original: text, proposed: "" };
}
