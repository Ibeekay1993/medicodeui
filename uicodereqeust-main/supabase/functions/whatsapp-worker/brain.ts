// whatsapp-worker/brain.ts
//
// Pure conversation-intelligence functions for the WhatsApp worker.
// NO network, NO database, NO Deno APIs — everything here must be unit-testable
// with plain vitest (see brain.test.ts).
//
// Design contract (WHATSAPP_AI_BRAIN_SPEC.md):
//   AI = interpreter / router  →  deterministic code = executor / source of truth.
// The current message always has priority over stored conversation context.

// ── Multi-patient block splitting ────────────────────────────────────────────
// Splits on patient header lines ("Full Name:", "Patient Name:", "Name:").
// A previous lookahead-based split also matched the "Name:" inside
// "Full Name:", producing junk half-blocks; boundaries are now deduplicated
// so each header starts exactly one block.
export function splitPatientBlocks(text: string): string[] {
  if (!text) return [text];
  const headerRe =
    /\*?\s*(?:Full\s*Name|Patient\s*Name|Name)\s*\*?\s*:/gi;
  const bounds: number[] = [];
  let lastEnd = -1;
  for (const m of text.matchAll(headerRe)) {
    const start = m.index ?? 0;
    // Skip boundaries that begin inside the previous header match
    // (e.g. the "Name:" inside "Full Name:").
    if (start < lastEnd) continue;
    bounds.push(start);
    lastEnd = start + m[0].length;
  }
  if (bounds.length <= 1) return [text];
  const parts: string[] = [];
  for (let i = 0; i < bounds.length; i++) {
    const slice = text
      .slice(bounds[i], i + 1 < bounds.length ? bounds[i + 1] : undefined)
      .trim();
    if (slice) parts.push(slice);
  }
  // Text before the first header (e.g. a greeting preamble) stays its own
  // leading block, matching the original splitter's behaviour.
  const lead = text.slice(0, bounds[0]).trim();
  return lead ? [lead, ...parts] : parts;
}

// ── Deterministic authorization field extraction ─────────────────────────────
export function extractAuthFieldsFromRaw(
  text: string,
): Record<string, string | null> {
  const result: Record<string, string | null> = {
    patientName: null,
    policyNumber: null,
    diagnosis: null,
    treatment: null,
    procedure: null,
    investigation: null,
    requestedService: null,
    originatingHospital: null,
  };
  const patterns: [string, RegExp][] = [
    [
      "patientName",
      /^(?:\*?\s*(?:full\s*name|patient\s*name|name)\s*\*?\s*:\s*)(.+)$/i,
    ],
    [
      "policyNumber",
      /^(?:\*?\s*(?:nhia\s*(?:no|number)?|nhis\s*(?:no|number)?|policy\s*(?:no|number)?)\s*\*?\s*:\s*)(.+)$/i,
    ],
    ["diagnosis", /^(?:\*?\s*diagnosis\s*\*?\s*:\s*)(.+)$/i],
    ["treatment", /^(?:\*?\s*(?:drugs?|treatment)\s*\*?\s*:\s*)(.+)$/i],
    ["procedure", /^(?:\*?\s*procedures?\s*\*?\s*:\s*)(.+)$/i],
    ["investigation", /^(?:\*?\s*investigations?\s*\*?\s*:\s*)(.+)$/i],
    [
      "requestedService",
      /^(?:\*?\s*(?:services?|consultation)\s*\*?\s*:\s*)(.+)$/i,
    ],
  ];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    for (const [key, pattern] of patterns) {
      const m = t.match(pattern);
      if (m && !result[key]) result[key] = m[1].trim();
    }
  }
  const lower = text.toLowerCase();
  if (lower.includes("university health service") || lower.includes("jaja"))
    result.originatingHospital =
      "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
  return result;
}

// ── Strong authorization evidence ────────────────────────────────────────────
export const AUTH_HEADER_PATTERNS = [
  /(?:^|\n)\s*(?:full\s*name|patient\s*name|name)\s*:\s*[^\n\r]+/i,
  /(?:^|\n)\s*(?:nhia\s*(?:no|number)?|nhis\s*(?:no|number)?|policy\s*(?:no|number)?)\s*:\s*[^\n\r]+/i,
  /(?:^|\n)\s*diagnosis\s*:\s*[^\n\r]+/i,
  /(?:^|\n)\s*(?:drugs?|treatment|procedures?|investigations?|services?|consultation)\s*:\s*[^\n\r]+/i,
];

export function hasStrongAuthIndicators(text: string) {
  return AUTH_HEADER_PATTERNS.filter((p) => p.test(text)).length >= 2;
}

// ── Analysis contract (shared by every AI provider and the deterministic
// fallback) ───────────────────────────────────────────────────────────────────
export interface AnalysisResult {
  intent: string;
  patientName?: string | null;
  policyNumber?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  procedure?: string | null;
  investigation?: string | null;
  requestedService?: string | null;
  patientPhone?: string | null;
  originatingHospital?: string | null;
  referralHospital?: string | null;
  urgencyLevel: number;
  missingInfo: string[];
  isCancellationIntent: boolean;
  queryPatientName?: string | null;
  queryPolicyNumber?: string | null;
  conversationalReply?: string | null;
  // True when this analysis was produced by the deterministic fallback
  // (all AI providers unavailable — quota/429, 5xx, network, or unparseable
  // response).
  geminiFallback?: boolean;
  raw?: unknown;
}

// Backwards-compatible alias so existing call sites and tests keep working.
export type GeminiAnalysisResult = AnalysisResult;

// ── Query patient-name extraction ────────────────────────────────────────────
// Captures the patient a status/approval/rejection question refers to.
// Reference phrases ("my request", "the patient") are cleaned so the caller
// falls back to the sender's own recent requests instead of a bogus name.
const PRONOUN_QUERY_RE =
  /^(?:my|his|her|their|our|its|this|that|the|previous|last|prior|earlier|old)\b/i;

export function cleanQueryPatientName(raw: string): string | null {
  let name = String(raw || "")
    .trim()
    .replace(/[.,!?]+$/, "");
  if (!name) return null;
  // Strip leading request-reference phrases, e.g.
  //   "my previous request for Segun"  → "Segun"
  //   "the authorization of Hannah"    → "Hannah"
  //   "his case"                       → ""
  name = name
    .replace(
      /^(?:my|his|her|their|our|its|this|that|the|previous|last|prior|earlier|old)\s+(?:(?:previous|last|prior|earlier|old)\s+)?(?:medical\s+)?(?:auth(?:orization)?\s+|pre[- ]?authorization\s+)?(?:request|requests|case|cases|application|applications|claim|claims|submission|submissions|patient)s?\s+(?:for|of|about|on)?\s*/i,
      "",
    )
    .trim();
  if (!name) return null;
  // Still a reference phrase with no real name in it → unknown.
  if (PRONOUN_QUERY_RE.test(name) && name.split(/\s+/).length <= 3) return null;
  // Implausibly long captures are sentences, not names.
  if (name.split(/\s+/).length > 6) return null;
  return name;
}

export function extractQueryPatientName(text: string): string | null {
  const patterns = [
    // "status for/of/on <name>" — "on" covers "any update on Segun?"
    /\b(?:status|update|approval|approved|rejected|rejection|details?)\s+(?:for|of|on)\s+([A-Za-z][A-Za-z .'-]{1,80}?)(?:\?|$|\.|\s+(?:please|now|yet|today)\b)/i,
    // "has/is/was <name> been approved/rejected/processed?"
    /\b(?:has|is|was)\s+([A-Za-z][A-Za-z .'-]{1,80}?)\s+(?:been\s+)?(?:approved|rejected|processed)\b/i,
    // "what happened to <name>" / "where is <name>"
    /\b(?:what happened to|where is)\s+([A-Za-z][A-Za-z .'-]{1,80}?)(?:\?|$|\.)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const cleaned = cleanQueryPatientName(m[1]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

// ── Deterministic intent guard (brain) ───────────────────────────────────────
// Overrides incorrect/uncertain AI classification when strong deterministic
// signals are present in the CURRENT message. Stale conversation state is
// only ever used as a last-resort hint, never to lock the conversation.
export function brainGuard(
  text: string,
  analysis: GeminiAnalysisResult,
  conversation: any,
): GeminiAnalysisResult {
  const t = text.trim(),
    out = { ...analysis };
  const hasStatusWord =
    /\b(status|update|approval|approved|rejected|rejection|declined|pending|decision|progress)\b/i.test(
      t,
    );
  const explicitStatus =
    /\b(?:status|update|approval|approved|rejected|rejection|pending)\s+(?:for|of|on)\b/i.test(
      t,
    ) ||
    /\b(?:what|where|any|has|is|was|need|want|check|tell|why)\b.*\b(?:status|update|approved|approval|rejected|rejection|pending|decision)\b/i.test(
      t,
    ) ||
    (hasStatusWord &&
      /\b(?:request|authorization|case|patient|him|her|it|this|my)\b/i.test(t));
  const providerKeyword =
    /\b(?:health\s*care\s+providers?|health\s+providers?|providers?|hospitals?|clinics?|doctors?|specialists?|facilit(?:y|ies))\b/i;
  const providerAction =
    /\b(?:need|want|looking|find|ask|recommend|which|where|nearest|available|help)\b/i;
  // "hospitals in Ibadan" / "clinics near me" — a provider keyword followed by a
  // location preposition is a provider query even without an action verb.
  const providerLocation =
    /\b(?:hospitals?|clinics?|doctors?|specialists?|facilit(?:y|ies)|providers?)\b\s+(?:in|at|near|around|within)\b/i;
  const provider =
    (providerKeyword.test(t) && providerAction.test(t)) ||
    providerLocation.test(t);
  const auth =
    hasStrongAuthIndicators(t) ||
    (/\b(?:submit|request|authorization|pre[- ]?authorization)\b/i.test(t) &&
      /\b(?:patient|diagnosis|treatment|drug|procedure|investigation|service|nhia|nhis|policy)\b/i.test(
        t,
      ));
  if (explicitStatus && !auth) {
    out.intent = /\b(?:rejected|rejection|declined|why\s+was)\b/i.test(t)
      ? "REJECTION_QUERY"
      : /\b(?:approved|approval)\b/i.test(t)
        ? "APPROVAL_QUERY"
        : "AUTHORIZATION_STATUS";
    out.queryPatientName =
      extractQueryPatientName(t) ||
      out.queryPatientName ||
      out.patientName ||
      conversation?.last_patient_name ||
      null;
    out.queryPolicyNumber =
      out.queryPolicyNumber ||
      out.policyNumber ||
      conversation?.last_policy_number ||
      null;
    out.missingInfo = [];
    return out;
  }
  if (provider && !auth && !explicitStatus) {
    out.intent = "PROVIDER_QUERY";
    out.missingInfo = [];
    return out;
  }
  if (auth && !explicitStatus) {
    out.intent = hasStrongAuthIndicators(t)
      ? "NEW_AUTHORIZATION"
      : out.intent || "INCOMPLETE_AUTHORIZATION";
    const raw = extractAuthFieldsFromRaw(t);
    out.patientName = out.patientName || raw.patientName;
    out.policyNumber = out.policyNumber || raw.policyNumber;
    out.diagnosis = out.diagnosis || raw.diagnosis;
    out.treatment = out.treatment || raw.treatment;
    out.procedure = out.procedure || raw.procedure;
    out.investigation = out.investigation || raw.investigation;
    out.requestedService = out.requestedService || raw.requestedService;
    out.originatingHospital =
      out.originatingHospital || raw.originatingHospital;
  }
  if (
    ["UNKNOWN", "NO_AUTHORIZATION", "GENERAL_CONVERSATION"].includes(
      out.intent,
    ) &&
    conversation?.active_intent === "INCOMPLETE_AUTHORIZATION" &&
    /\b(?:name|patient|nhia|nhis|policy|diagnosis|treatment|drug|procedure|investigation|service)\b/i.test(
      t,
    )
  )
    out.intent = "CONTINUE_AUTHORIZATION";
  return out;
}

// ── Conversation context builder (bounded, current-message-first) ────────────
export function buildContext(conversation: any, history: any[]) {
  const pending =
    conversation?.pending_data && typeof conversation.pending_data === "object"
      ? JSON.stringify(conversation.pending_data)
      : "{}";
  const recent = (history || [])
    .slice(-8)
    .map((m: any) => `inbound: ${String(m.message_body || "").slice(0, 1000)}`)
    .join("\n");
  return [
    "CONVERSATION STATE (current message overrides stale context):",
    `active_intent=${conversation?.active_intent || "none"}`,
    `last_patient_name=${conversation?.last_patient_name || "none"}`,
    `last_policy_number=${conversation?.last_policy_number || "none"}`,
    `pending_data=${pending}`,
    "RECENT MESSAGES:",
    recent || "none",
  ].join("\n");
}

// ── Provider search-term derivation (deterministic) ──────────────────────────
// Reduces a provider question to the meaningful residual words the user wants
// matched against the provider directory (hospital name / state).
const PROVIDER_STOPWORD_RE =
  /^(?:i|we|please|want|need|ask|asking|looking|look|find|help|me|a|an|the|for|of|to|about|with|get|got|getting|have|has|had|know|list|show|give|give|any|is|are|am|do|does|did|you|your|can|could|would|should|which|where|what|who|how|there|here|provider|providers|health|healthcare|care|medical|hmo|hospital|hospitals|clinic|clinics|doctor|doctors|specialist|specialists|facility|facilities|laboratory|laboratories|lab|labs|in|at|near|around|within|from|use|using|treatment|treat|seek|seeking|search|searching)$/i;

export function deriveProviderSearchTerm(text: string): string {
  const words = String(text || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !PROVIDER_STOPWORD_RE.test(w));
  return words.slice(0, 3).join(" ").trim();
}

// ── Gemini failure classification (pure, for the 429 fallback) ────────────────
// extractWithGemini throws `Gemini HTTP <status>: <body>` on non-OK responses.
// Classify the failure so the worker can decide: retry briefly (429/5xx are
// often transient or per-minute quota) or degrade to the deterministic brain.
export interface GeminiFailureInfo {
  httpStatus: number | null;
  quotaExhausted: boolean;
  // Milliseconds to wait before a single retry, or null = do not retry.
  retryDelayMs: number | null;
}

export function classifyGeminiFailure(
  errorMessage: string,
): GeminiFailureInfo {
  const msg = String(errorMessage || "");
  const m = /Gemini HTTP (\d{3})/.exec(msg);
  const httpStatus = m ? Number(m[1]) : null;
  const quotaExhausted =
    httpStatus === 429 ||
    /quota|resource[_ -]?exhausted|rate\s*limit|too\s*many\s*requests/i.test(
      msg,
    );
  const transient =
    httpStatus === null ||
    httpStatus === 429 ||
    httpStatus === 500 ||
    httpStatus === 502 ||
    httpStatus === 503 ||
    httpStatus === 504;
  // 429 on the free tier is usually a per-minute window — one short retry is
  // cheap; anything longer would push the worker past Evolution's latency
  // budget, so a failure after the retry degrades to the deterministic brain.
  const retryDelayMs = !transient
    ? null
    : httpStatus === 429
      ? 1500
      : 800;
  return { httpStatus, quotaExhausted, retryDelayMs };
}

// ── Deterministic fallback analysis (Gemini unavailable) ─────────────────────
// Produces a useful, honest analysis when the AI layer is down so the WhatsApp
// service degrades gracefully instead of going silent or retrying forever.
// Deterministic code answers what it can; structured authorization intake,
// status/provider enquiries and task switching all survive a Gemini outage.
export function deterministicFallbackAnalysis(
  text: string,
  conversation: any,
): AnalysisResult {
  const t = String(text || "").trim();
  const base: AnalysisResult = {
    intent: "UNKNOWN",
    urgencyLevel: 3,
    missingInfo: [],
    isCancellationIntent: false,
    geminiFallback: true,
  };
  if (!t) return { ...base, intent: "NON_TEXT_MESSAGE" };
  // Cancellation / reset.
  if (
    /^(?:cancel(?:\s+(?:my\s+)?(?:request|authorization|it|this))?|stop|start\s+over|reset|nevermind|never\s+mind)\.?$/i.test(
      t,
    )
  )
    return { ...base, intent: "CANCELLATION", isCancellationIntent: true };
  // Bare greetings / thanks (covers variants the index.ts fast paths miss).
  if (
    !hasStrongAuthIndicators(t) &&
    !/\b(?:status|update|approved|rejected|provider|hospital|clinic)\b/i.test(t) &&
    t.split(/\s+/).length <= 4 &&
    /^(?:hi|hello|hey|howdy|greetings|good\s*(?:morning|afternoon|evening|day)|thank(?:s| you)(?: very much)?|thanks\b)/i.test(
      t,
    )
  )
    return { ...base, intent: "GREETING" };
  // Submit-intent with no fields yet: starting a draft is deterministic.
  // (brainGuard alone would return UNKNOWN, losing the flow while Gemini is down.)
  if (
    !hasStrongAuthIndicators(t) &&
    !/\b(?:status|update|approved|rejection|rejected)\b/i.test(t) &&
    /\b(?:submit|send|start|open|create|new|make)\b/i.test(t) &&
    /\b(?:request|requests|authorization|auth|pre[- ]?authorization|preauth)\b/i.test(
      t,
    )
  )
    return { ...base, intent: "INCOMPLETE_AUTHORIZATION" };
  return brainGuard(t, base, conversation);
}