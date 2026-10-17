export type AuthorizationSubmitActor =
  | { kind: "internal" }
  | { kind: "user"; userId: string; roles: readonly string[] };

export type AuthorizationProvenance = {
  source: string;
  submittedBy: string | null;
};

type ParserReplayRecord = Record<string, unknown>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A repeated parser key is a replay only for the same owner and payload. */
export function isSameParserSubmissionReplay(
  existing: ParserReplayRecord,
  submitted: ParserReplayRecord,
  userId: string,
): boolean {
  if (
    existing.source !== "whatsapp_parser" ||
    existing.submitted_by !== userId ||
    existing.request_id !== submitted.request_id
  ) return false;

  const fields = [
    "hospital_id",
    "patient_name",
    "policy_number",
    "beneficiary_number",
    "diagnosis",
    "treatment",
    "patient_phone",
    "referred_hospital_id",
    "whatsapp_raw_message",
    "urgency",
    "clinical_notes",
  ];
  if (fields.some((field) => (existing[field] ?? null) !== (submitted[field] ?? null))) {
    return false;
  }

  return canonicalJson(existing.approved_items ?? []) ===
    canonicalJson(submitted.approved_items ?? []);
}

/**
 * Internal callers may select a source because they are authenticated with a
 * server-only key. Browser callers are limited to the dashboard parser intake;
 * their source label is ignored and assigned by this server-side boundary.
 */
export function deriveAuthorizationProvenance(
  actor: AuthorizationSubmitActor,
  requestedSource: unknown,
): AuthorizationProvenance {
  if (actor.kind === "internal") {
    const source = String(requestedSource ?? "whatsapp").trim().toLowerCase();
    return { source: source || "whatsapp", submittedBy: null };
  }

  if (
    !actor.userId ||
    !actor.roles.some((role) => [
      "nurse",
      "admin",
      "utilization_manager",
      "utilization_manager_lead",
    ].includes(role))
  ) {
    throw new Error("staff_authorization_required");
  }

  return { source: "whatsapp_parser", submittedBy: actor.userId };
}
