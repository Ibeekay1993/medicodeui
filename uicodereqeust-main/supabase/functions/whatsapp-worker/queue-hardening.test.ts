import { describe, expect, it } from "vitest";
import {
  classifyRetryFailure,
  getWorkerBatchSize,
  getQueuePlan,
  getStaleQueueCandidates,
  isOutboundAmbiguous,
  isProcessingStale,
  normalizeStatus,
  shouldSendOutbound,
} from "./queue-hardening.ts";
import {
  getMessageAgeMs,
  isClinicallyDecidedAuthorization,
  isPastAutoProcessAgeLimit,
  parseAutoProcessAgeLimitMinutes,
} from "../_shared/authorization-state.ts";

describe("queue hardening helpers", () => {
  it("bounds the scheduled worker batch size", () => {
    expect(getWorkerBatchSize("10")).toBe(2);
    expect(getWorkerBatchSize("1")).toBe(1);
    expect(getWorkerBatchSize("invalid")).toBe(2);
  });

  it("classifies permanent validation failures as failed", () => {
    const result = classifyRetryFailure("beneficiary_mismatch");
    expect(result.kind).toBe("failed");
    expect(result.category).toContain("beneficiary_mismatch");
  });

  it("classifies transient infrastructure failures as retries", () => {
    const result = classifyRetryFailure("db_timeout while saving request");
    expect(result.kind).toBe("retry");
    expect(result.category).toContain("timeout");
    expect(result.delayMs).toBeGreaterThan(0);
    expect(classifyRetryFailure("identity_lookup_failed").kind).toBe("retry");
  });

  it("identifies stale processing rows by durable timestamp", () => {
    const stale = {
      status: "processing",
      status_updated_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      received_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(isProcessingStale(stale, 10)).toBe(true);
    expect(normalizeStatus("Queued")).toBe("queued");
  });

  it("does not reclaim processing rows while a valid lease is active", () => {
    const active = {
      status: "processing",
      status_updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      processing_lease_expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
      processing_heartbeat_at: new Date(Date.now() - 30 * 1000).toISOString(),
    };
    expect(isProcessingStale(active, 10)).toBe(false);
  });

  it("prioritizes fresh queue items before retry backlog", () => {
    const rows = [
      { message_id: "retry-1", status: "retry", received_at: "2024-01-01T00:00:00Z", next_attempt_at: new Date(Date.now() - 1000).toISOString() },
      { message_id: "retry-2", status: "retry", received_at: "2024-01-01T00:00:00Z", next_attempt_at: new Date(Date.now() - 1000).toISOString() },
      { message_id: "fresh-1", status: "queued", received_at: "2024-01-01T00:00:00Z" },
      { message_id: "fresh-2", status: "received", received_at: "2024-01-01T00:00:00Z" },
      { message_id: "fresh-3", status: "queued", received_at: "2024-01-01T00:00:00Z" },
    ];

    const plan = getQueuePlan(rows, 4, new Date());
    expect(plan.map((row) => row.message_id).slice(0, 3)).toEqual([
      "fresh-1",
      "fresh-2",
      "fresh-3",
    ]);
    expect(plan.length).toBe(4);
  });

  it("does not resend confirmed or ambiguous outbound operations", () => {
    expect(shouldSendOutbound("sent")).toBe(false);
    expect(shouldSendOutbound("ambiguous")).toBe(false);
    expect(isOutboundAmbiguous("send_in_progress", new Date(Date.now() - 1000).toISOString())).toBe(true);
  });

  it("allows a failed outbound operation to retry", () => {
    expect(shouldSendOutbound("send_failed")).toBe(true);
    expect(shouldSendOutbound("retry_pending")).toBe(true);
    expect(isOutboundAmbiguous("send_in_progress", new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });

  it("classifies approved and otherwise decided authorizations as immutable", () => {
    for (const status of [
      "approved",
      "partially_approved",
      "referral_approved",
      "rejected",
      "declined",
      "cancelled",
      "expired",
      "superseded",
      "unknown_future_status",
    ]) {
      expect(isClinicallyDecidedAuthorization({ status })).toBe(true);
    }
    expect(isClinicallyDecidedAuthorization({
      status: "pending",
      authorization_code: "R/AG/011010696BD",
    })).toBe(true);
    expect(isClinicallyDecidedAuthorization({ status: "pending", approved_by: "admin-id" })).toBe(true);
    expect(isClinicallyDecidedAuthorization({ status: "pending", authorization_code: "Pending" })).toBe(false);
    expect(isClinicallyDecidedAuthorization({ status: "pending_referral" })).toBe(false);
    expect(isClinicallyDecidedAuthorization(null)).toBe(true);
  });

  it("holds old or invalid-timestamp inbound messages from automatic authorization creation", () => {
    const now = new Date("2026-10-07T12:00:00.000Z");
    expect(isPastAutoProcessAgeLimit({ received_at: "2026-10-07T11:29:59.999Z" }, 30, now)).toBe(true);
    expect(isPastAutoProcessAgeLimit({ received_at: "2026-10-07T11:30:00.000Z" }, 30, now)).toBe(false);
    expect(isPastAutoProcessAgeLimit({ received_at: "not-a-date" }, 30, now)).toBe(true);
    expect(getMessageAgeMs({ received_at: "2026-10-07T12:01:00.000Z" }, now)).toBe(0);
  });

  it("uses a bounded configurable auto-processing age limit", () => {
    expect(parseAutoProcessAgeLimitMinutes("45")).toBe(45);
    expect(parseAutoProcessAgeLimitMinutes("0")).toBe(30);
    expect(parseAutoProcessAgeLimitMinutes("1441")).toBe(30);
    expect(parseAutoProcessAgeLimitMinutes("bad", 20)).toBe(20);
  });

  it("selects oldest stale items only from processable statuses", () => {
    const candidates = getStaleQueueCandidates([
      { message_id: "newer", status: "queued", received_at: "2026-10-07T10:00:00Z" },
      { message_id: "oldest", status: "retry", received_at: "2026-10-07T08:00:00Z" },
      { message_id: "already-held", status: "stale", received_at: "2026-10-07T07:00:00Z" },
    ], 1);
    expect(candidates.map((row) => row.message_id)).toEqual(["oldest"]);
  });
});
