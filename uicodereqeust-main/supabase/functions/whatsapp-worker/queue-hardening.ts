export const WHATSAPP_MESSAGE_STATUSES = [
  "received",
  "queued",
  "claimed",
  "processing",
  "authorization_created",
  "response_pending",
  "response_sent",
  "completed",
  "failed",
  "retry",
] as const;

export function normalizeStatus(value?: string | null): string {
  return String(value || "").trim().toLowerCase() || "received";
}

export function getEffectiveStatusTimestamp(
  row?: {
    status_updated_at?: string | null;
    received_at?: string | null;
    created_at?: string | null;
  },
): string | null {
  if (!row) return null;
  return row.status_updated_at || row.received_at || row.created_at || null;
}

export function isProcessingStale(
  row?: {
    status?: string | null;
    status_updated_at?: string | null;
    received_at?: string | null;
    created_at?: string | null;
    processing_lease_expires_at?: string | null;
    processing_heartbeat_at?: string | null;
  },
  timeoutMinutes = 10,
): boolean {
  if (!row || normalizeStatus(row.status) !== "processing") return false;
  const leaseExpiry = row.processing_lease_expires_at
    ? new Date(row.processing_lease_expires_at).getTime()
    : null;
  const heartbeatTs = row.processing_heartbeat_at
    ? new Date(row.processing_heartbeat_at).getTime()
    : null;
  const ts = getEffectiveStatusTimestamp(row);
  if (!ts) return false;
  const now = Date.now();
  const leaseActive = leaseExpiry !== null && leaseExpiry > now;
  if (leaseActive || (heartbeatTs !== null && heartbeatTs > now - timeoutMinutes * 60 * 1000)) {
    return false;
  }
  const ageMs = now - new Date(ts).getTime();
  return ageMs >= timeoutMinutes * 60 * 1000;
}

export function classifyRetryFailure(
  error: unknown,
): {
  kind: "retry" | "failed";
  category: string;
  message: string;
  delayMs: number;
} {
  const text = String(error || "").toLowerCase();

  const permanentPatterns = [
    "beneficiary_mismatch",
    "beneficiary_ambiguous",
    "unregistered_sender",
    "sender_mismatch",
    "invalid recipient",
    "nonexistent jid",
    "malformed request",
    "incomplete request",
    "phone_family_conflict",
    "missing patient",
    "missing policy",
    "invalid phone",
  ];

  const retryPatterns = [
    "db_timeout",
    "timeout",
    "timed out",
    "evolution api",
    "temporary",
    "upstream",
    "request_id_collision",
    "duplicate request",
    "network",
    "rate limit",
    "service unavailable",
  ];

  if (permanentPatterns.some((pattern) => text.includes(pattern))) {
    return {
      kind: "failed",
      category: permanentPatterns.find((pattern) => text.includes(pattern)) || "validation_failed",
      message: String(error || "validation_failed"),
      delayMs: 0,
    };
  }

  if (retryPatterns.some((pattern) => text.includes(pattern))) {
    return {
      kind: "retry",
      category: retryPatterns.find((pattern) => text.includes(pattern)) || "transient_failure",
      message: String(error || "transient_failure"),
      delayMs: 30_000,
    };
  }

  return {
    kind: "retry",
    category: "unknown_error",
    message: String(error || "unknown_error"),
    delayMs: 30_000,
  };
}

export function getQueuePlan<T extends { status?: string | null; received_at?: string | null; next_attempt_at?: string | null }>(
  rows: T[],
  batchSize: number,
  now = new Date(),
): T[] {
  if (!rows.length || batchSize <= 0) return [];

  const freshLimit = Math.max(1, Math.floor(batchSize * 0.8));
  const retryLimit = Math.max(0, batchSize - freshLimit);

  const fresh = rows
    .filter((row) => ["received", "queued"].includes(normalizeStatus(row.status)))
    .sort((a, b) => {
      const left = new Date(a.received_at || 0).getTime();
      const right = new Date(b.received_at || 0).getTime();
      return left - right;
    })
    .slice(0, freshLimit);

  const retry = rows
    .filter((row) => normalizeStatus(row.status) === "retry")
    .filter((row) => !row.next_attempt_at || new Date(row.next_attempt_at).getTime() <= now.getTime())
    .sort((a, b) => {
      const left = new Date(a.next_attempt_at || a.received_at || 0).getTime();
      const right = new Date(b.next_attempt_at || b.received_at || 0).getTime();
      return left - right;
    })
    .slice(0, retryLimit);

  return [...fresh, ...retry].slice(0, batchSize);
}

export type OutboundState =
  | "not_started"
  | "send_in_progress"
  | "sent"
  | "send_failed"
  | "retry_pending"
  | "ambiguous";

export function shouldSendOutbound(
  state?: string | null,
  leaseExpiresAt?: string | null,
): boolean {
  const normalized = String(state || "not_started");
  if (normalized === "sent" || normalized === "ambiguous") return false;
  if (normalized === "send_in_progress") {
    return Boolean(
      leaseExpiresAt && new Date(leaseExpiresAt).getTime() > Date.now(),
    );
  }
  return true;
}

export function isOutboundAmbiguous(
  state?: string | null,
  leaseExpiresAt?: string | null,
): boolean {
  return String(state || "") === "ambiguous" ||
    (String(state || "") === "send_in_progress" &&
      (!leaseExpiresAt || new Date(leaseExpiresAt).getTime() <= Date.now()));
}
