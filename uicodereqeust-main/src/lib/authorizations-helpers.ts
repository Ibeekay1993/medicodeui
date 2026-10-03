export const normalizeHospitalName = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");

/**
 * Canonicalizes Nigerian hospital names and common acronyms so that
 * aliases like "UNIVERSITY HEALTH SERVICE UI (UHS)" and
 * "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)"
 * resolve to the identical canonical hospital entity.
 */
export const canonicalizeHospitalName = (name?: string | null): string => {
  if (!name) return "";
  const s = String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

  // University of Ibadan Health Services (Jaja Clinic / UI / UHS)
  const hasJaja = s.includes("jaja");
  const hasUI = /\bui\b/.test(s) || s.includes("ibadan");
  const hasUHS = /\buhs\b/.test(s) || (s.includes("university") && s.includes("health"));
  if (hasJaja || (hasUI && (hasUHS || s.includes("health") || s.includes("clinic") || s.includes("service")))) {
    return "university of ibadan health services jaja clinic";
  }

  // University College Hospital (UCH)
  if (/\buch\b/.test(s) || (s.includes("university") && s.includes("college") && s.includes("hospital"))) {
    return "university college hospital";
  }

  // Obafemi Awolowo University Teaching Hospital (OAUTHC)
  if (/\boauthc\b/.test(s) || (s.includes("obafemi") && s.includes("awolowo"))) {
    return "obafemi awolowo university teaching hospitals complex";
  }

  // Lagos University Teaching Hospital (LUTH)
  if (/\bluth\b/.test(s) || (s.includes("lagos") && s.includes("university") && s.includes("teaching"))) {
    return "lagos university teaching hospital";
  }

  return s;
};

export const areHospitalNamesMatching = (name1?: string | null, name2?: string | null): boolean => {
  if (!name1 || !name2) return false;
  const canon1 = canonicalizeHospitalName(name1);
  const canon2 = canonicalizeHospitalName(name2);
  if (canon1 && canon2 && canon1 === canon2) return true;

  const norm1 = normalizeHospitalName(name1);
  const norm2 = normalizeHospitalName(name2);
  if (norm1 === norm2) return true;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  return false;
};

export const hospitalNameCanReceiveReferral = (ownerName?: string | null, currentName?: string | null) => {
  return areHospitalNamesMatching(ownerName, currentName);
};

export const getApprovedItems = (request: any) => {
  if (Array.isArray(request?.approved_items) && request.approved_items.length) {
    return request.approved_items;
  }
  return [];
};

export const claimOwnerIdFor = (request: any) => request?.referred_hospital_id || request?.claiming_hospital_id || request?.hospital_id;

export const claimOwnerNameFor = (request: any) => request?.referred_hospital_name || request?.claiming_hospital_name || request?.hospital_name;

export const isReferralFor = (request: any) => Boolean(request?.referred_hospital_name || request?.referred_hospital_id);

export const getOtpTypeCandidatesForRequest = (request: any) => {
  const status = String(request?.status || "").toLowerCase();
  if (status === "pending_authorization") return ["TREATMENT", "ARRIVAL"];
  if (status === "referral_approved" || status === "referral_accepted") return ["ARRIVAL", "TREATMENT"];
  return ["ARRIVAL", "TREATMENT"];
};

export const formatOtpDisplayValue = (arrivalOtp?: string | null, treatmentOtp?: string | null) => {
  const arrival = String(arrivalOtp || "").trim();
  const treatment = String(treatmentOtp || "").trim();
  return arrival || treatment || "";
};

export const isReferringHospitalFor = (request: any, hospital: any) => {
  if (!isReferralFor(request) || !hospital?.id) return false;
  const referringId = request?.referring_hospital_id || request?.requesting_hospital_id || request?.hospital_id;
  if (referringId) return String(referringId) === String(hospital.id);
  const referringName = request?.referring_hospital_name || request?.requesting_hospital_name || request?.hospital_name;
  return normalizeHospitalName(referringName) === normalizeHospitalName(hospital.name);
};

export const canSubmitClaimFor = (request: any, hospital: any) => {
  if (!hospital?.id) return false;
  if (isReferralFor(request)) {
    const referredId = request?.referred_hospital_id;
    if (referredId && String(referredId) === String(hospital.id)) return true;
    return hospitalNameCanReceiveReferral(claimOwnerNameFor(request), hospital.name);
  }
  const ownerId = claimOwnerIdFor(request);
  if (ownerId) return String(ownerId) === String(hospital.id);
  const ownerName = normalizeHospitalName(claimOwnerNameFor(request));
  const currentName = normalizeHospitalName(hospital.name);
  if (ownerName) return ownerName === currentName;
  return normalizeHospitalName(request?.hospital_name) === currentName;
};

export const isClaimLockedAfterTransfer = (request: any, hospital: any) => {
  if (request?.referral_status === 'transferred') {
    return claimOwnerIdFor(request) !== hospital?.id;
  }
  return false;
};

export const isFrozenAuthorization = (request: any) => {
  const status = String(request?.status || "").toLowerCase();
  return request?.deletion_status === "awaiting_admin_approval" || [
    "awaiting_delete",
    "deleted",
    "withdrawn",
    "rejected",
    "declined",
    "denied",
    "referral_declined",
    "referral_expired",
    "accepted_referral_expired"
  ].includes(status);
};

export const isClaimEligible = (request: any, hospital: any) => {
  const status = String(request?.status || "").toLowerCase();
  const code = String(request?.authorization_code || "");
  const isApproved = ["approved", "authorization_approved"].includes(status);
  const isReferralCode = code.startsWith("REF/");
  return isApproved && 
    !isReferralCode &&
    !isFrozenAuthorization(request) && 
    !isClaimLockedAfterTransfer(request, hospital) &&
    canSubmitClaimFor(request, hospital) &&
    code.trim().length > 0;
};

export const displayStatus = (status?: string | null) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "submitted") return "Claim Submitted";
  if (normalized === "partially_approved") return "Partially Approved";
  if (normalized === "under_review") return "Under Review";
  if (normalized === "under_contest") return "Under Contest";
  if (!normalized) return "Not Submitted";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
};

export const claimStatusClass = (status?: string | null) => {
  const normalized = String(status || "").toLowerCase();
  if (["approved", "partially_approved", "paid"].includes(normalized)) return "border-emerald-200 text-emerald-700 bg-emerald-50";
  if (["rejected", "declined", "denied"].includes(normalized)) return "border-rose-200 text-rose-700 bg-rose-50";
  if (["contested", "under_contest"].includes(normalized)) return "border-blue-200 text-blue-700 bg-blue-50";
  return "border-amber-200 text-amber-700 bg-amber-50";
};

function parseNoteText(value: unknown): string {
  if (!value || typeof value !== "string") return "";
  const t = value.trim();
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      const p = JSON.parse(t);
      const parts: string[] = [];
      if (p.review_decision) parts.push(p.review_decision);
      else if (p.decision_reason) parts.push(p.decision_reason);
      if (p.notes) parts.push(p.notes);
      return parts.join(" • ");
    } catch { return t; }
  }
  return t;
}

export const rejectionReason = (request: any) =>
  parseNoteText(request?.decision_reason) ||
  parseNoteText(request?.rejection_reason) ||
  parseNoteText(request?.clinical_notes) ||
  "";

export const isRejected = (request: any) => ["rejected", "declined", "denied"].includes(String(request?.status || "").toLowerCase());
