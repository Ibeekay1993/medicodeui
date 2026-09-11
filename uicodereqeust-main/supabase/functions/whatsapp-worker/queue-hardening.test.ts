import { describe, expect, it } from "vitest";
import {
  classifyRetryFailure,
  getQueuePlan,
  isOutboundAmbiguous,
  isProcessingStale,
  normalizeStatus,
  shouldSendOutbound,
} from "./queue-hardening.ts";

describe("queue hardening helpers", () => {
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
});
