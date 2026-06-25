export const normalizeHospitalName = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");

export const hospitalNameCanReceiveReferral = (ownerName?: string | null, currentName?: string | null) => {
  const owner = normalizeHospitalName(ownerName);
  const current = normalizeHospitalName(currentName);
  if (!owner || !current) return false;
  if (owner === current) return true;
  if (owner.includes(current) || current.includes(owner)) return true;
  if ((owner.includes("uch") && current.includes("universitycollegehospital")) || (current.includes("uch") && owner.includes("universitycollegehospital"))) return true;
  return false;
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

export const rejectionReason = (request: any) => String(request?.decision_reason || request?.rejection_reason || request?.clinical_notes || "").trim();

export const isRejected = (request: any) => ["rejected", "declined", "denied"].includes(String(request?.status || "").toLowerCase());
