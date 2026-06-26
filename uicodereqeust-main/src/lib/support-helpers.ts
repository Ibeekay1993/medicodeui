export const normalizeRouteText = (value: unknown) => String(value || "").trim().toLowerCase();

export const normalizeRouteCode = (value: unknown) => String(value || "").trim().toLowerCase();

export const getRouteTags = (item: any): string[] => {
  if (!item) return [];
  const tags = item.tags;
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.filter((t): t is string => typeof t === "string");
  }
  if (typeof tags === "string") {
    const trimmed = tags.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((t): t is string => typeof t === "string");
        }
      } catch {
        // Fall back to splitting
      }
    }
    return trimmed.split(",").map(t => t.trim()).filter(Boolean);
  }
  return [];
};

export const getTagValues = (item: any, prefix: string): string[] => {
  const targetPrefix = `${prefix.toLowerCase()}:`;
  return getRouteTags(item)
    .filter((tag: string) => typeof tag === "string" && tag.toLowerCase().startsWith(targetPrefix))
    .map((tag: string) => tag.split(":").slice(1).join(":").trim())
    .filter(Boolean);
};

export const departmentRoutesToNurse = (department: unknown) => {
  const text = normalizeRouteText(department);
  return /nurs|auth|pre[-\s]?auth|preauthorization|prior|clinical|code/.test(text);
};

export const departmentRoutesToClaims = (department: unknown) => {
  const text = normalizeRouteText(department);
  return /claim|billing|bill|finance|payment|reimburse|tariff/.test(text);
};

export const normalizeRouteTag = (tag: unknown) =>
  normalizeRouteText(tag)
    .replace(/[_:=-]+/g, " ")
    .replace(/[^a-z0-9/\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const isRequestSupportTicket = (item: any) =>
  item?.ticket_type === "request_support" ||
  Boolean(item?.linked_request_id) ||
  Boolean(getTagValues(item, "request").length);

export const getRequestTicketStatus = (item: any) => {
  if (["closed", "resolved"].includes(item?.status)) return item.status;
  if (item?.request_ticket_status) return item.request_ticket_status;
  if (item?.status === "pending_customer_response") return "awaiting_hospital_response";
  if (item?.status === "waiting_internal_action" || item?.status === "pending") return "awaiting_insurer_response";
  return "open";
};

export const getRequestTicketStatusLabel = (value: string) => value.replace(/_/g, " ").toUpperCase();

export const tagsRouteToNurse = (tags: string[]) => {
  return tags.some((tag) => {
    if (typeof tag !== "string") return false;
    const text = normalizeRouteTag(tag);
    return /(^|\s)(nurs|nursing|auth|authorization|pre\s?auth|preauthorization|prior|clinical|code)(\s|$)/.test(text);
  });
};

export const tagsRouteToClaims = (tags: string[]) => {
  return tags.some((tag) => {
    if (typeof tag !== "string") return false;
    const text = normalizeRouteTag(tag);
    return /(^|\s)(claim|claims|billing|bill|finance|payment|reimburse|reimbursement|tariff)(\s|$)/.test(text);
  });
};

export const conversationRoute = (
  item: any,
  userId?: string | null,
  authRequests: any[] = [],
  claims: any[] = []
) => {
  const tags = getRouteTags(item);
  const codeTags = getTagValues(item, "code").map(normalizeRouteCode);
  const hasRequestTag = tags.some((tag: string) => tag.toLowerCase().startsWith("request:"));
  const hasClaimTag = tags.some((tag: string) => tag.toLowerCase().startsWith("claim:"));
  const assignedToMe = Boolean(userId && item.assigned_to === userId);
  const assignedNurse = Boolean(userId && item.nurse_user_id === userId);
  const codeMatchesRequest = codeTags.some((code) =>
    authRequests.some((request) =>
      [request.authorization_code, request.request_id, request.id]
        .map(normalizeRouteCode)
        .filter(Boolean)
        .includes(code)
    )
  );
  const codeMatchesClaim = codeTags.some((code) =>
    claims.some((claim) =>
      [claim.auth_code, claim.claim_number, claim.id, claim.request_id]
        .map(normalizeRouteCode)
        .filter(Boolean)
        .includes(code)
    )
  );

  return {
    isNurse:
      assignedToMe ||
      assignedNurse ||
      hasRequestTag ||
      codeMatchesRequest ||
      departmentRoutesToNurse(item.department) ||
      tagsRouteToNurse(tags),
    isClaims:
      assignedToMe ||
      hasClaimTag ||
      codeMatchesClaim ||
      departmentRoutesToClaims(item.department) ||
      tagsRouteToClaims(tags),
    isRequestCategory:
      isRequestSupportTicket(item) ||
      hasRequestTag ||
      codeMatchesRequest ||
      departmentRoutesToNurse(item.department) ||
      tagsRouteToNurse(tags),
    isClaimCategory:
      hasClaimTag ||
      codeMatchesClaim ||
      departmentRoutesToClaims(item.department) ||
      tagsRouteToClaims(tags),
  };
};

export const formatMoney = (value: unknown) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? `â‚¦${numeric.toLocaleString()}` : "Not recorded";
};

export const readText = (value: unknown) => (typeof value === "string" ? value : "");

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Operation failed";

export type SupportRequestRecord = {
  request_id?: unknown;
  authorization_code?: unknown;
  status?: unknown;
  patient_name?: unknown;
  policy_number?: unknown;
  hospital_name?: unknown;
  diagnosis?: unknown;
  treatment?: unknown;
  estimated_cost?: unknown;
  decision_reason?: unknown;
  clinical_notes?: unknown;
  referred_hospital_name?: unknown;
  claiming_hospital_name?: unknown;
  [key: string]: unknown;
};

export const getDecisionReason = (request: unknown) => {
  const record = request as SupportRequestRecord | null;
  return readText(record?.decision_reason) || readText(record?.clinical_notes);
};

export const buildAiResponse = (question: string, request: unknown) => {
  const record = request as SupportRequestRecord | null;
  const q = question.toLowerCase();
  const status = readText(record?.status).toLowerCase();
  const requestNumber = readText(record?.request_id) || "REQ-LINKED";
  const approvalCode = readText(record?.authorization_code) || "PENDING";
  const decisionReason = getDecisionReason(record);
  const treatment = readText(record?.treatment) || "not recorded";
  const diagnosis = readText(record?.diagnosis) || "not recorded";
  const policy = readText(record?.policy_number) || "not recorded";
  const hospital = readText(record?.hospital_name) || "not recorded";

  const base = [
    `Request: ${requestNumber}`,
    `Status: ${status || "not recorded"}`,
    `Patient: ${readText(record?.patient_name) || "not recorded"}`,
    `Policy: ${policy}`,
    `Hospital: ${hospital}`,
    `Diagnosis: ${diagnosis}`,
    `Proposed treatment: ${treatment}`,
    `Tariff estimate: ${formatMoney(record?.estimated_cost)}`,
  ];

  if (status === "approved") {
    base.push(`Approval / authorization code: ${approvalCode}`);
  } else if (status === "rejected") {
    base.push("Approval / authorization code: none. Rejected requests do not have an active approval code.");
  } else {
    base.push(`Approval / authorization code: ${approvalCode}`);
  }

  if (decisionReason) {
    base.push(`Decision note: ${decisionReason}`);
  }

  if (/code|auth|approval|approved|authorize/.test(q)) {
    base.push(
      status === "approved"
        ? "This request is approved. Confirm the authorization code with Ronsberger HMO before service or claim activity."
        : "This request is not approved, so there is no active authorization code for treatment or claim submission."
    );
  }

  if (/reject|decline|deny|why|reason/.test(q)) {
    base.push(
      decisionReason
        ? "The decision note above explains the current status. If the hospital disagrees, ask for utilization manager review or human support."
        : "No decision note is recorded. Ask a utilization manager to add or clarify the decision reason."
    );
  }

  if (/claim|payment|tariff|money|submit/.test(q)) {
    const owner =
      readText(record?.referred_hospital_name) ||
      readText(record?.claiming_hospital_name) ||
      readText(record?.hospital_name) ||
      "the treating hospital";
    base.push(
      `Claim/payment ownership belongs to ${owner}. The referring hospital can only view coordination details.`
    );
  }

  if (/reception|present|patient|show|bring/.test(q)) {
    base.push(
      "Do not rely on a copied or old code. The approved hospital should confirm the active authorization with Ronsberger HMO before providing services."
    );
  }

  if (/human|support|nurse|staff|agent|escalat/.test(q)) {
    base.push(
      "Type HUMAN SUPPORT or reply with the exact issue and a Ronsberger HMO staff member can take over this thread."
    );
  }

  base.push(
    "Was this issue resolved? Reply RESOLVED, or type HUMAN SUPPORT if you want a real support/human agent."
  );

  return base.join("\n\n");
};

export const isEscalationIntent = (text: string) =>
  /human|support agent|nurse|staff|escalat|speak to/.test(text.toLowerCase());



// ----- Helpers added during the messaging overhaul -----

export type SupportStatusGroup = "open" | "pending" | "closed" | "mine";

export const SUPPORT_STATUS_GROUPS: Record<SupportStatusGroup, string[]> = {
  open: ["new", "open", "reopened"],
  pending: ["pending_customer_response", "waiting_internal_action", "pending"],
  closed: ["closed", "resolved"],
  mine: [],
};

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  open: "Open",
  reopened: "Reopened",
  pending_customer_response: "Awaiting hospital",
  waiting_internal_action: "Awaiting insurer",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
};

export function formatStatusLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const key = String(value).toLowerCase();
  return STATUS_LABELS[key] || String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type AiConfidence = "high" | "medium" | "low";

export function evaluateAiConfidence(question: string, request: unknown): AiConfidence {
  const record = request as SupportRequestRecord | null;
  const q = (question || "").trim();
  if (!record) return "low";
  const status = readText(record?.status).toLowerCase();
  if (!status) return "low";
  if (q.length < 12 && !/code|auth|approval|approved|authorize|reject|claim|payment|tariff/i.test(q)) {
    return "medium";
  }
  if (!readText(record?.authorization_code) && status === "approved") return "low";
  if (status === "pending") return "medium";
  return "high";
}

export function buildAiResponseV2(
  question: string,
  request: unknown,
  options: { confidence?: AiConfidence; isHospital?: boolean } = {}
) {
  const record = request as SupportRequestRecord | null;
  const confidence = options.confidence ?? evaluateAiConfidence(question, record);
  const responseBody = buildAiResponse(question, record);
  const header =
    confidence === "high"
      ? "Confidence: high. The linked authorization request is up to date."
      : confidence === "medium"
      ? "Confidence: medium. The data below is from the linked request but may be older than today's status."
      : "Confidence: low. Confirm with a Ronsberger HMO staff member before relying on these details.";
  const closer = options.isHospital
    ? "Was this helpful? Tap Resolved to confirm, or Speak to Human to escalate."
    : "Confirm the resolution with the hospital or escalate to a human reviewer.";
  return [header, "", responseBody, "", closer].join("\n");
}

export function buildTicketPreview(item: any, isInternal: boolean): string {
  const body = readText(item?.last_message).trim();
  if (!body) return isInternal ? "No messages yet" : "Awaiting first reply";
  if (!isInternal && /^\[internal note\]/i.test(body)) {
    return "Staff are reviewing internally";
  }
  return body.length > 220 ? `${body.slice(0, 220)}…` : body;
}

export function matchesSearch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function safeStoragePath(conversationId: string, fileName: string): string {
  const safe = (fileName || "attachment").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const uuid = (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${conversationId}/${uuid}-${safe}`;
}
