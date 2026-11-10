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

export function normalizeBeneficiaryNumber(value: unknown) {
  return normalizePolicyNumber(value)
    .toUpperCase()
    .replace(/-0+([1-9]\d*)$/, "-$1");
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
  const recordRawPolicy = String(record?.policy_number || record?.beneficiary_number || record?.nhis_no || record?.plan_code || "").trim();
  const recordRawBen = String(record?.beneficiary_number || "").trim();
  if (!recordRawPolicy && !recordRawBen && !policy) return false;

  const recordPolicy = normalizePolicyNumber(recordRawPolicy);
  const recordBen = normalizePolicyNumber(recordRawBen);
  const normalizedPolicy = normalizePolicyNumber(policy);

  if (recordPolicy && normalizedPolicy && recordPolicy === normalizedPolicy) return true;
  if (recordBen && normalizedPolicy && recordBen === normalizedPolicy) return true;

  // Family membership is represented by a numeric policy root plus an
  // optional numeric dependant suffix (for example 1639554 and 1639554-2).
  // Avoid substring/prefix matching: policy 1639554 must never match 11639554.
  const familyNumber = (value: string) => value.toUpperCase().match(/^(\d{4,12})(?:-(\d+))?$/);
  const targetFamily = familyNumber(normalizedPolicy);
  const recordFamily = familyNumber(recordPolicy || recordBen);
  return Boolean(targetFamily && recordFamily && targetFamily[1] === recordFamily[1]);
}

export function recordMatchesHistory(record: any, policy: string) {
  return policy ? recordMatchesPolicy(record, policy) : false;
}

export function normalizePatientNameForMatch(value: unknown) {
  const withoutTitles = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\s*(?:(?:mr|mrs|miss|ms|dr|prof|professor)\.?\s+)+/i, "");

  return withoutTitles
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !["null", "nil", "none", "na", "undefined"].includes(token))
    .sort()
    .join(" ");
}

export interface BeneficiaryIdentityCandidate {
  id?: string | null;
  beneficiary_number?: unknown;
  full_name?: unknown;
  name?: unknown;
  first_name?: unknown;
  surname?: unknown;
}

export type BeneficiaryIdentityMatchStatus = "exact" | "none" | "ambiguous" | "conflict";

/**
 * Resolve a name only within a caller-supplied, already policy-scoped candidate
 * set. Names are order-insensitive, but the complete token set must agree.
 * A reliable beneficiary number can narrow to one member; it cannot override
 * conflicting name evidence or duplicate identifiers.
 */
export function resolveBeneficiaryIdentityMatch<T extends BeneficiaryIdentityCandidate>(
  candidates: T[],
  submittedName: unknown,
  submittedBeneficiaryNumber?: unknown,
): { status: BeneficiaryIdentityMatchStatus; member: T | null } {
  const name = normalizePatientNameForMatch(submittedName);
  const beneficiaryNumber = normalizeBeneficiaryNumber(submittedBeneficiaryNumber);
  const getCandidateName = (candidate: T) => {
    const fullName = String(candidate.full_name || candidate.name || "").trim();
    return fullName || [candidate.surname, candidate.first_name]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" ");
  };
  const matchesName = (candidate: T) => {
    const candidateName = normalizePatientNameForMatch(getCandidateName(candidate));
    return Boolean(name && candidateName && candidateName === name);
  };

  if (beneficiaryNumber) {
    const byNumber = candidates.filter(
      (candidate) => normalizeBeneficiaryNumber(candidate.beneficiary_number) === beneficiaryNumber,
    );
    if (byNumber.length > 1) return { status: "ambiguous", member: null };
    if (byNumber.length === 0) {
      return { status: candidates.some(matchesName) ? "conflict" : "none", member: null };
    }
    if (name && !matchesName(byNumber[0])) return { status: "conflict", member: null };
    return { status: "exact", member: byNumber[0] };
  }

  const byName = candidates.filter(matchesName);
  if (byName.length > 1) return { status: "ambiguous", member: null };
  if (byName.length === 1) return { status: "exact", member: byName[0] };
  return { status: "none", member: null };
}

export interface ClinicalHistoryIdentityRecord {
  policy_number?: unknown;
  beneficiary_number?: unknown;
  patient_name?: unknown;
  name?: unknown;
}

export function matchesBeneficiaryHistoryRecord(
  record: ClinicalHistoryIdentityRecord,
  identity: { patientName: unknown; policyNumber: unknown; beneficiaryNumber?: unknown },
  familyMembers: BeneficiaryIdentityCandidate[],
  includeDependents: boolean,
): boolean {
  const policyNumber = String(identity.policyNumber ?? "");
  if (includeDependents) return Boolean(normalizePolicyRoot(policyNumber) && recordMatchesPolicy(record, policyNumber));

  const policyScoped = Boolean(normalizePolicyRoot(policyNumber) && recordMatchesPolicy(record, policyNumber));
  if (!policyScoped) return false;

  const currentBeneficiary = normalizeBeneficiaryNumber(identity.beneficiaryNumber);
  const recordPolicy = normalizePolicyNumber(record.policy_number).toUpperCase();
  const inferredFromPolicy = recordPolicy.match(/^(\d{4,12}-\d+)$/)?.[1] || "";
  const recordBeneficiary = normalizeBeneficiaryNumber(record.beneficiary_number || inferredFromPolicy);
  if (currentBeneficiary && recordBeneficiary) return currentBeneficiary === recordBeneficiary;

  const currentName = normalizePatientNameForMatch(identity.patientName);
  const recordName = normalizePatientNameForMatch(record.patient_name || record.name);
  if (!currentName || !recordName || currentName !== recordName) return false;

  const familyNameMatches = familyMembers.filter((member) => {
    const name = String(member.full_name || member.name || [member.surname, member.first_name].filter(Boolean).join(" "));
    return normalizePatientNameForMatch(name) === currentName;
  });
  if (familyNameMatches.length !== 1) return false;

  const familyMemberNumber = normalizeBeneficiaryNumber(familyNameMatches[0].beneficiary_number);
  if (currentBeneficiary && familyMemberNumber !== currentBeneficiary) return false;
  if (recordBeneficiary && familyMemberNumber !== recordBeneficiary) return false;
  return true;
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
