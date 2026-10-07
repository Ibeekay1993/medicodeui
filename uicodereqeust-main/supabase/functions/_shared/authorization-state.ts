export type AuthorizationDecisionState = {
  status?: string | null;
  authorization_code?: string | null;
  approved_by?: string | null;
  decided_at?: string | null;
  decided_by?: string | null;
  decision_reason?: string | null;
};

const ACTIVE_AUTHORIZATION_STATUSES = new Set([
  "pending",
  "pending_referral",
  "pending_authorization",
  "submitted",
  "under_review",
  "in_review",
]);

const NON_DECISION_CODES = new Set([
  "",
  "pending",
  "n/a",
  "na",
  "none",
  "null",
  "not assigned",
]);

/**
 * Unknown or incomplete decision states fail closed. A WhatsApp replay must
 * never treat an authorization with a decision marker as a new request.
 */
export function isClinicallyDecidedAuthorization(
  request: AuthorizationDecisionState | null | undefined,
): boolean {
  if (!request) return true;

  const status = String(request.status || "").trim().toLowerCase();
  if (!ACTIVE_AUTHORIZATION_STATUSES.has(status)) return true;

  if (request.approved_by || request.decided_at || request.decided_by || request.decision_reason) return true;

  const code = String(request.authorization_code || "").trim().toLowerCase();
  return !NON_DECISION_CODES.has(code);
}

export function parseAutoProcessAgeLimitMinutes(
  value: string | null | undefined,
  fallbackMinutes = 30,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24 * 60) {
    return fallbackMinutes;
  }
  return parsed;
}

export function getMessageAgeMs(
  row: { received_at?: string | null; created_at?: string | null },
  now = new Date(),
): number | null {
  const timestamp = row.received_at || row.created_at;
  if (!timestamp) return null;
  const receivedAtMs = Date.parse(timestamp);
  if (!Number.isFinite(receivedAtMs)) return null;
  return Math.max(0, now.getTime() - receivedAtMs);
}

export function isPastAutoProcessAgeLimit(
  row: { received_at?: string | null; created_at?: string | null },
  maxAgeMinutes: number,
  now = new Date(),
): boolean {
  const ageMs = getMessageAgeMs(row, now);
  // Missing/invalid provider timestamps are held for safety, not interpreted
  // as newly received requests.
  return ageMs === null || ageMs > maxAgeMinutes * 60_000;
}
