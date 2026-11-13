import { describe, expect, it } from "vitest";
import { canUnlockClaim, claimStatusAmount, claimStatusBucket } from "./claimStatus";

describe("claimStatusBucket", () => {
  it("keeps paid claims separate from contested claims", () => {
    expect(claimStatusBucket("paid")).toBe("paid");
    expect(claimStatusBucket("under_contest")).toBe("contested");
  });

  it("groups declined aliases as rejected and partial approvals as approved", () => {
    expect(claimStatusBucket("declined")).toBe("rejected");
    expect(claimStatusBucket("partially_approved")).toBe("approved");
  });

  it("uses the decision-specific amount instead of the original claim amount", () => {
    const row = { total_amount: 500, approved_amount: 320, declined_amount: 180 };
    expect(claimStatusAmount(claimStatusBucket("partially_approved"), row)).toBe(320);
    expect(claimStatusAmount(claimStatusBucket("declined"), row)).toBe(180);
  });
});

describe("canUnlockClaim", () => {
  it("blocks paid and batched claims even when the workflow status is still approved", () => {
    expect(canUnlockClaim({ status: "paid" })).toBe(false);
    expect(canUnlockClaim({ status: "approved", payment_status: "paid" })).toBe(false);
    expect(canUnlockClaim({ status: "approved", payment_batch_id: "batch-1" })).toBe(false);
  });

  it("allows an unpaid, unbatched approved claim to be reviewed", () => {
    expect(canUnlockClaim({ status: "approved", payment_status: "pending" })).toBe(true);
  });
});
