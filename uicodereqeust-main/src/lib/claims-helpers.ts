export type ClaimDraft = { 
  id: string; 
  hospital_id: string; 
  hospital_name: string; 
  claim_number: string; 
  auth_code: string; 
  patient_name: string; 
  policy_number: string; 
  status: string; 
  total_amount: number; 
  approved_amount?: number;
  paid_at?: string | null;
  notes: string; 
  line_items: any[]; 
  audit_items?: any[];
  audit_summary?: any;
  under_contest_amount?: number;
  contest_note?: string;
  contest_documents?: any[];
  diagnosis?: string | null;
  approved_for?: string | null;
  created_at: string;
  contest_deadline?: string | null;
  payment_batch_id?: string | null;
  payment_status?: string | null;
  declined_amount?: number;
};

export type AuditDecision = {
  status: "approved" | "declined";
  reason?: string;
  reasonCategory?: string;
  note?: string;
  aiExplanation?: string;
  approvedQuantity?: number;
  approvedUnitPrice?: number;
};

export const DECLINE_REASONS = [
  "Not clinically indicated",
  "Incorrect prescription",
  "Inappropriate service",
  "Duplicate billing / duplicate drug or service",
  "Exceeds authorized quantity",
  "Incorrect coding",
  "Non-covered service",
  "Price discrepancy",
  "Insufficient documentation",
  "Outside treatment protocol",
  "Other"
];

export const buildHospitalExplanation = (category: string, note: string, itemName: string) => {
  const cleanNote = note.trim();
  const templates: Record<string, string> = {
    "Not clinically indicated": `This item was declined because the audit review did not find sufficient clinical indication for ${itemName} within the submitted claim context.`,
    "Incorrect prescription": `This item was declined because the prescription details submitted for ${itemName} did not match the approved or clinically expected prescription record.`,
    "Inappropriate service": `This item was declined because the service billed for ${itemName} was not considered appropriate for the approved treatment pathway.`,
    "Duplicate billing / duplicate drug or service": `This item was declined because it appears to duplicate another drug or service already included in the claim.`,
    "Exceeds authorized quantity": `This item was declined because the quantity billed exceeded the amount authorized under the approved preauthorization.`,
    "Incorrect coding": `This item was declined because the billed code or description did not match the authorized NHIA item record.`,
    "Non-covered service": `This item was declined because it is not covered under the applicable authorization or benefit rule.`,
    "Price discrepancy": `This item was declined because the billed pricing did not match the approved NHIA pricing record.`,
    "Insufficient documentation": `This item was declined because the submitted documentation was not sufficient to support payment for ${itemName}.`,
    "Outside treatment protocol": `This item was declined because it falls outside the approved treatment protocol for this authorization.`
  };
  const base = templates[category] || `This item was declined after audit review based on the reason category: ${category}.`;
  return cleanNote ? `${base} Auditor note: ${cleanNote}` : base;
};

export function money(value: number) { 
  return new Intl.NumberFormat("en-NG", { 
    style: "currency", 
    currency: "NGN", 
    maximumFractionDigits: 0 
  }).format(value || 0); 
}

export const normalizeText = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");

export const hospitalNameCanReceiveReferral = (ownerName?: string | null, currentName?: string | null) => {
  const owner = normalizeText(ownerName);
  const current = normalizeText(currentName);
  if (!owner || !current) return false;
  if (owner === current) return true;
  if (owner.includes(current) || current.includes(owner)) return true;
  if ((owner.includes("uch") && current.includes("universitycollegehospital")) || (current.includes("uch") && owner.includes("universitycollegehospital"))) return true;
  return false;
};

export function splitClaimNotes(notes?: string | null) {
  // Split on blank lines OR newlines to get individual lines
  const raw = String(notes || "");
  
  // Detect if this looks like a system-generated audit note
  const isAuditNote = /\[(?:AI |AUTOMATED )?CLAIMS?\s+AUDIT|\[(?:AI|AUTOMATED) CLINICAL/i.test(raw);
  
  if (isAuditNote) {
    // Entire content is a system-generated audit trail — no clinical note
    return {
      clinical: null,
      audit: raw.trim()
    };
  }
  
  const lines = raw.split(/\n/).map(line => line.trim());
  
  // Mark a line as audit if it matches system-generated patterns
  const isAuditLine = (line: string) =>
    /^\[/.test(line) || // bracket headers like [CLAIMS AUDIT COMPLETED]
    /^-\s*(APPROVED|DECLINED|ADJUSTED):/i.test(line) || // item decisions
    /^•\s*(APPROVED|DECLINED|ADJUSTED)/i.test(line) ||
    /^(Claim Reference|Status:|Original Claim Value|Audited Approved Value|Declined Value|ITEM AUDIT DECISIONS|APPROVED ITEMS|DECLINED ITEMS|SUMMARY OF ADJUSTMENTS|Requested Amount|Approved Payout|Deducted Penalty|Audit completed|Hospital may submit|Under active)/i.test(line) ||
    /^-\s*(Requested Amount|Approved Payout|Deducted Penalty)/i.test(line) ||
    /\b((?:AI|AUTOMATED) CLINICAL AUDIT COMPLETED|CLAIMS AUDIT COMPLETED)\b/i.test(line);
  
  // Find the first audit line — everything from there is audit trail
  const firstAuditIdx = lines.findIndex(isAuditLine);
  
  if (firstAuditIdx === -1) {
    // No audit lines found — all clinical
    return {
      clinical: raw.trim() || null,
      audit: null
    };
  }
  
  const clinicalPart = lines.slice(0, firstAuditIdx).filter(Boolean).join("\n").trim();
  const auditPart = lines.slice(firstAuditIdx).filter(Boolean).join("\n").trim();
  
  return {
    clinical: clinicalPart || null,
    audit: auditPart || null
  };
}

export const statusLabel = (status?: string | null) => String(status || "pending").replace(/_/g, " ");

export const statusClass = (status?: string | null) => {
  const normalized = String(status || "").toLowerCase();
  if (["approved", "partially_approved", "paid"].includes(normalized)) return "border-emerald-100 text-emerald-700 bg-emerald-50";
  if (["rejected", "declined", "denied"].includes(normalized)) return "border-rose-100 text-rose-700 bg-rose-50";
  if (["contested", "under_contest"].includes(normalized)) return "border-blue-100 text-blue-700 bg-blue-50";
  return "border-amber-100 text-amber-700 bg-amber-50";
};

export const claimAuditItems = (claim: ClaimDraft | null) => {
  if (!claim) return [];
  if (Array.isArray(claim.audit_items) && claim.audit_items.length) return claim.audit_items;
  return Array.isArray(claim.line_items) ? claim.line_items : [];
};

export const hasContestableDeductions = (claim: ClaimDraft | null) => {
  if (!claim) return false;
  const status = String(claim.status || "").toLowerCase();
  
  // Fully approved claims cannot be contested under any circumstance
  if (status === "approved") return false;
  
  // Only claims that have been adjusted (partially approved) or totally declined/rejected can be contested
  if (!["partially_approved", "rejected", "declined", "denied", "adjusted"].includes(status)) return false;
  
  // A claim can only be contested once
  if (claim.payment_status === 'awaiting_payment') return false;
  if (claim.under_contest_amount && Number(claim.under_contest_amount) > 0) return false;
  if (claim.contest_note && claim.contest_note.trim()) return false;
  
  // Check 30-day contest deadline lock
  if (claim.contest_deadline && new Date(claim.contest_deadline) < new Date()) return false;
  
  const items = claimAuditItems(claim);
  const itemHasDeduction = items.some((item: any) => {
    const originalQty = Number(item.original_quantity ?? item.claimed_quantity ?? item.quantity ?? 0);
    const approvedQty = Number(item.approved_quantity ?? item.quantity ?? originalQty);
    return item.audit_status === "declined"
      || item.status === "declined"
      || approvedQty < originalQty
      || Number(item.declined_amount || 0) > 0;
  });
  const noteHasDeduction = /\b(DECLINED|ADJUSTED|DEDUCTED|EXCLUDED FROM PAYOUT)\b/i.test(claim.notes || "");
  return itemHasDeduction || Number(claim.declined_amount || 0) > 0 || noteHasDeduction;
};

export const contestedAmount = (claim: ClaimDraft | null) => {
  if (!claim) return 0;
  const itemTotal = claimAuditItems(claim).reduce((sum, item: any) => {
    const originalQty = Number(item.original_quantity ?? item.claimed_quantity ?? item.quantity ?? 0);
    const approvedQty = Number(item.approved_quantity ?? item.quantity ?? originalQty);
    const unit = Number(item.unit_price ?? item.price ?? 0);
    if (item.audit_status === "declined" || item.status === "declined") return sum + Number(item.original_total ?? item.total ?? 0);
    if (approvedQty < originalQty) return sum + ((originalQty - approvedQty) * unit);
    return sum + Number(item.declined_amount || 0);
  }, 0);
  return itemTotal || Number(claim.declined_amount || 0);
};

export const calculateHospitalClaimStats = (claims: ClaimDraft[]) => {
  return {
    pending: claims.filter(c => ["pending", "submitted", "under_review"].includes(String(c.status).toLowerCase())).length,
    approved: claims.filter(c => ["approved", "partially_approved"].includes(String(c.status).toLowerCase())).length,
    paid: claims.filter(c => String(c.status).toLowerCase() === "paid").length,
    totalValue: claims.reduce((sum, c) => sum + Number(c.total_amount || 0), 0)
  };
};

