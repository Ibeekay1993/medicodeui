export type ClaimStatusBucket = "pending" | "approved" | "rejected" | "contested" | "paid" | "other";

export function normalizeClaimStatus(status?: string | null): string {
  return String(status || "pending").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function canUnlockClaim(claim: {
  status?: string | null;
  payment_status?: string | null;
  payment_batch_id?: string | null;
} | null | undefined): boolean {
  if (!claim) return false;
  return normalizeClaimStatus(claim.status) !== "paid"
    && normalizeClaimStatus(claim.payment_status) !== "paid"
    && !claim.payment_batch_id;
}

export function claimStatusBucket(status?: string | null): ClaimStatusBucket {
  const normalized = normalizeClaimStatus(status);
  if (["submitted", "pending", "under_investigation", "under_review", "pending_audit", "audit"].includes(normalized)) return "pending";
  if (["approved", "partially_approved"].includes(normalized)) return "approved";
  if (["rejected", "declined", "denied"].includes(normalized)) return "rejected";
  if (["contested", "under_contest"].includes(normalized)) return "contested";
  if (normalized === "paid") return "paid";
  return "other";
}

export function claimStatusAmount(
  bucket: ClaimStatusBucket,
  row: { total_amount?: unknown; original_amount?: unknown; approved_amount?: unknown; declined_amount?: unknown; under_contest_amount?: unknown }
): number {
  const amount = (...values: unknown[]) => {
    const value = values.find((candidate) => candidate !== null && candidate !== undefined && candidate !== "");
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  switch (bucket) {
    case "approved":
    case "paid":
      return amount(row.approved_amount, row.total_amount, row.original_amount);
    case "rejected":
      return amount(row.declined_amount, row.total_amount, row.original_amount);
    case "contested":
      return amount(row.under_contest_amount, row.total_amount, row.original_amount);
    case "pending":
    case "other":
      return amount(row.total_amount, row.original_amount);
  }
}
