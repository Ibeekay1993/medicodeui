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

// ── Family policy parsing ────────────────────────────────────────────────────
// NHIA family policies are represented as `1639554`, `1639554-1`, `1639554-2`,
// `1639554-3`. They all belong to the same BASE family policy (`1639554`); the
// hyphen suffix identifies the family member's position within the family but
// it must never gate whether a beneficiary can be found. Only the exact form
// `digits-digits` is treated as a family policy.
export function parsePolicyNumber(policy: string): {
  submittedPolicy: string;
  basePolicy: string;
  memberSuffix: string | null;
  isFamilyPolicy: boolean;
} {
  const normalized = String(policy ?? "").trim();
  const familyMatch = normalized.match(/^(\d+)-(\d+)$/);
  if (familyMatch) {
    return {
      submittedPolicy: normalized,
      basePolicy: familyMatch[1],
      memberSuffix: familyMatch[2],
      isFamilyPolicy: true,
    };
  }
  return {
    submittedPolicy: normalized,
    basePolicy: normalized,
    memberSuffix: null,
    isFamilyPolicy: false,
  };
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
    patientPhone: null,
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
    [
      "patientPhone",
      /^(?:\*?\s*(?:patient\s*)?(?:phone|mobile|telephone|tel)\s*\*?\s*:\s*)(.+)$/i,
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
    out.patientPhone = out.patientPhone || raw.patientPhone;
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

// ── WhatsApp Group Message Detection ──────────────────────────────────────────
// Complete isolation for WhatsApp group messages.
// Returns true if the payload represents a group message, group broadcast, or participant-based group event.
export function isWhatsAppGroupMessage(body: any): boolean {
  if (!body || typeof body !== "object") return false;
  const data = body.data || body;
  const key = data?.key || {};
  const remoteJid = String(key.remoteJid || data.remoteJid || data.chatJid || "").toLowerCase();
  const participant = String(key.participant || data.participant || "").trim();

  // 1. Group JID format (Baileys / WhatsApp group addresses end in @g.us or contain @g.us)
  if (remoteJid.endsWith("@g.us") || remoteJid.includes("@g.us")) return true;

  // 2. Status broadcast or system broadcast JIDs
  if (remoteJid.includes("status@broadcast") || remoteJid.endsWith("@broadcast")) return true;

  // 3. Explicit group flags from Evolution API
  if (Boolean(data.isGroup) || Boolean(body.isGroup)) return true;

  // 4. Participant presence distinct from remoteJid in WhatsApp chats indicates a group
  if (participant.length > 0 && participant !== remoteJid && remoteJid.includes("@")) {
    return true;
  }

  return false;
}

// ── Phone number normalizer ──────────────────────────────────────────────────
export function normalizePhoneNumber(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return "234" + digits.slice(1);
  if (digits.startsWith("234")) return digits;
  if (digits.length === 10) return "234" + digits;
  return digits;
}

// ── Access Classification ────────────────────────────────────────────────────
export type AccessClass = "REGISTERED_HOSPITAL" | "GENERAL_CUSTOMER" | "DISABLED_OR_REVOKED";

export function classifyAccessClass(
  matches: Array<{ hospital_id?: string | null; status?: string | null }>,
): {
  accessClass: AccessClass;
  authorized: boolean;
  hospitalId: string | null;
} {
  if (!matches || matches.length === 0) {
    return { accessClass: "GENERAL_CUSTOMER", authorized: false, hospitalId: null };
  }

  const activeMatches = matches.filter(
    (m) => String(m.status || "").toLowerCase() === "active",
  );

  if (activeMatches.length === 0) {
    // Phone exists in contact table but status is revoked/disabled/inactive
    return { accessClass: "DISABLED_OR_REVOKED", authorized: false, hospitalId: null };
  }

  const hospitals = [...new Set(activeMatches.map((m) => String(m.hospital_id || "")).filter(Boolean))];
  if (hospitals.length !== 1) {
    // Ambiguous: multiple active hospitals claim the same phone number
    return { accessClass: "GENERAL_CUSTOMER", authorized: false, hospitalId: null };
  }

  return {
    accessClass: "REGISTERED_HOSPITAL",
    authorized: true,
    hospitalId: hospitals[0],
  };
}

// ── General Customer Intent & Safe Replies ───────────────────────────────────
export type GeneralCustomerIntent =
  | "PROVIDER_CLAIM"
  | "PROVIDER_REGISTRATION"
  | "CALLBACK_REQUEST"
  | "SUPPORT_REQUEST"
  | "FAQ"
  | "GREETING";

export const GENERAL_CUSTOMER_WELCOME =
  "Welcome to Ronsberger HMO 👋\n\n" +
  "We’re here to help with your HMO questions, benefits, services, and general support.\n\n" +
  "💬 You can chat with our Customer Support team directly here on WhatsApp, or request a phone call and we’ll assist you.\n\n" +
  "Our healthcare-provider WhatsApp service also supports medical authorization requests for registered hospitals and clinics.\n\n" +
  "How would you like to continue?\n\n" +
  "1️⃣ Chat with Customer Support\n" +
  "2️⃣ Request a Phone Call\n" +
  "3️⃣ Ask a General HMO Question\n\n" +
  "— Ronsberger HMO";

export const GENERAL_CUSTOMER_CLAIM_RESTRICTION =
  "Medical authorization requests and provider portal services are reserved for verified hospital accounts registered with Ronsberger HMO.\n\n" +
  "If you are a registered healthcare provider, please ensure you are messaging from your facility's registered WhatsApp number or contact Provider Relations to register your number.\n\n" +
  "For HMO plan questions, member services, or general support, we are happy to assist:\n\n" +
  "1️⃣ Chat with Customer Support\n" +
  "2️⃣ Request a Phone Call\n" +
  "3️⃣ Ask a General HMO Question\n\n" +
  "— Ronsberger HMO";

export const GENERAL_CUSTOMER_CALLBACK_REPLY =
  "Thank you. Your request for a phone call has been received. Our Customer Support team will reach out to you by phone as soon as possible.\n\n" +
  "— Ronsberger HMO";

export const GENERAL_CUSTOMER_SUPPORT_CONNECT_REPLY =
  "You are now connected with Ronsberger Customer Support. A representative will respond to you right here on WhatsApp shortly.\n\n" +
  "Please feel free to type your question or message below.\n\n" +
  "— Ronsberger HMO";

export const GENERAL_CUSTOMER_FAQ_REPLY =
  "Ronsberger HMO provides comprehensive healthcare coverage, wellness services, and medical provider network access across Nigeria.\n\n" +
  "Please type your question about our plans, benefits, or services, and we’ll be glad to help! You can also type '1' at any time to chat with a live support representative.\n\n" +
  "— Ronsberger HMO";

export function classifyGeneralCustomerIntent(
  text: string,
  isPotentialProvider: boolean = false,
): GeneralCustomerIntent {
  const t = (text || "").trim().toLowerCase();
  if (!t) return "GREETING";

  // 1. Explicit provider registration phrasing
  const registrationPhrases = [
    "register my hospital", "register this number", "register our hospital",
    "how do i register", "how to register", "i want to register",
    "want to register", "need to register", "get access",
    "get provider access", "need provider access", "hospital access",
    "clinic access", "onboard", "sign up as a provider", "join as provider",
    "provider registration",
  ];
  if (registrationPhrases.some((p) => t.includes(p))) return "PROVIDER_REGISTRATION";

  // 2. Provider claims or authorization keywords -> restrict safely
  const providerKeywords = [
    "authorization",
    "authorisation",
    "auth code",
    "code request",
    "submit auth",
    "patient auth",
    "i am a doctor",
    "i am doctor",
    "i'm a doctor",
    "from uch",
    "from luth",
    "from hospital",
    "general hospital",
    "clinic",
    "register me",
    "register hospital",
    "medical director",
    "medical officer",
  ];
  if (providerKeywords.some((kw) => t.includes(kw))) {
    return "PROVIDER_CLAIM";
  }

  // 3. Provider information phrasing
  const providerInfoPhrases = [
    "provider information", "provider info", "how does authorization work",
    "how does the authorization process work", "authorization process",
    "what is required to register",
  ];
  if (providerInfoPhrases.some((p) => t.includes(p))) return "FAQ";

  // 4. Menu numbering handling based on provider vs customer context
  if (isPotentialProvider) {
    // 1️⃣ Provider Registration
    if (t === "1" || t === "1️⃣" || t.startsWith("1.") || t.startsWith("option 1")) {
      return "PROVIDER_REGISTRATION";
    }
    // 2️⃣ Chat with Customer Support
    if (t === "2" || t === "2️⃣" || t.startsWith("2.") || t.startsWith("option 2")) {
      return "SUPPORT_REQUEST";
    }
    // 3️⃣ Request a Phone Call
    if (t === "3" || t === "3️⃣" || t.startsWith("3.") || t.startsWith("option 3")) {
      return "CALLBACK_REQUEST";
    }
    // 4️⃣ Provider Information
    if (t === "4" || t === "4️⃣" || t.startsWith("4.") || t.startsWith("option 4")) {
      return "FAQ";
    }
    // 5️⃣ General HMO Question
    if (t === "5" || t === "5️⃣" || t.startsWith("5.") || t.startsWith("option 5")) {
      return "FAQ";
    }
  } else {
    // General Customer Menu:
    // 1️⃣ Chat with Customer Support
    if (t === "1" || t === "1️⃣" || t.startsWith("1.") || t.startsWith("option 1")) {
      return "SUPPORT_REQUEST";
    }
    // 2️⃣ Request a Phone Call
    if (t === "2" || t === "2️⃣" || t.startsWith("2.") || t.startsWith("option 2")) {
      return "CALLBACK_REQUEST";
    }
    // 3️⃣ Ask a General HMO Question
    if (t === "3" || t === "3️⃣" || t.startsWith("3.") || t.startsWith("option 3")) {
      return "FAQ";
    }
  }

  // 5. Natural language matching
  if (/\b(?:request\s+(?:a\s+)?(?:phone\s+)?call|call\s*me|call\s*back|callback|phone\s*call|someone\s+call)\b/i.test(t)) {
    return "CALLBACK_REQUEST";
  }

  if (/\b(?:chat\s+with\s+(?:customer\s+)?support|customer\s*support|human\s*agent|support\s*team|help\s*desk|speak\s+with\s+(?:an?\s+)?agent|representative|i\s+need\s+(?:support|help)|need\s+(?:support|help)|get\s+help)\b/i.test(t)) {
    return "SUPPORT_REQUEST";
  }

  if (/\b(?:ask\s+a\s+general|general\s+question|general\s+hmo\s+question|benefits|services|plans|coverage|what\s+does\s+ronsberger|tell\s+me\s+about)\b/i.test(t)) {
    return "FAQ";
  }

  return "GREETING";
}