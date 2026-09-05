// supabase/functions/whatsapp-worker/providers.ts
//
// AI provider abstraction + failover router for the WhatsApp worker.
//
// Contract: every provider (Gemini, Groq, optional Modal) returns the same
// internal AnalysisResult schema (defined in brain.ts). Deterministic
// DB/RPC/trigger security remains authoritative — this module is an
// interpretation layer only and never writes to any database table.
//
// Failover order: Gemini → Groq → Modal (only when MODAL_ENDPOINT is set) →
// deterministicFallbackAnalysis().
//
// Rule: a provider-level failure (HTTP 429/quota, 5xx, network, timeout,
// unparseable or invalid response) moves immediately to the next provider.
// A 429 is NEVER retried against the same exhausted provider.

import {
  deterministicFallbackAnalysis,
  type AnalysisResult,
} from "./brain.ts";

// Re-export the shared contract so callers can import it from one place.
export type { AnalysisResult };
export type { AnalysisResult as GeminiAnalysisResult };

// ── Supported intents (shared validation list) ───────────────────────────────
export const SUPPORTED_INTENTS = [
  "GREETING",
  "GENERAL_CONVERSATION",
  "HELP",
  "NEW_AUTHORIZATION",
  "INCOMPLETE_AUTHORIZATION",
  "CONTINUE_AUTHORIZATION",
  "AUTHORIZATION_STATUS",
  "APPROVAL_QUERY",
  "REJECTION_QUERY",
  "AUTHORIZATION_DETAILS",
  "CANCELLATION",
  "PROVIDER_QUERY",
  "NO_AUTHORIZATION",
  "UNKNOWN",
  "NON_TEXT_MESSAGE",
] as const;

export type SupportedIntent = (typeof SUPPORTED_INTENTS)[number];

// ── Shared system prompt (identical to the previous Gemini prompt) ───────────
export const SYSTEM_PROMPT = `You are the conversation intelligence layer for Ronsberger HMO Nigeria. Understand the CURRENT WhatsApp message in context, but the current message always has priority over older messages.
Return JSON only. Classify exactly one intent: GREETING, GENERAL_CONVERSATION, HELP, NEW_AUTHORIZATION, INCOMPLETE_AUTHORIZATION, CONTINUE_AUTHORIZATION, AUTHORIZATION_STATUS, APPROVAL_QUERY, REJECTION_QUERY, AUTHORIZATION_DETAILS, CANCELLATION, PROVIDER_QUERY, NO_AUTHORIZATION, UNKNOWN.
Rules: structured authorization information is authorization; status/update/approval/rejection questions are enquiries; a subject change switches task; never invent data; provider queries include hospital, clinic, doctor, specialist, facility or healthcare provider; CONTINUE_AUTHORIZATION means information for an unfinished request; conversationalReply is only for GENERAL_CONVERSATION. For enquiry intents set queryPatientName / queryPolicyNumber to the exact patient name or NHIA/NHIS/policy number the user asks about when the message contains one; if the user only says "my request" or "my previous request" without a name, leave them empty.`;

// Gemini JSON schema (preserved from the previous implementation).
export const GEMINI_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string" },
    patientName: { type: "string" },
    policyNumber: { type: "string" },
    diagnosis: { type: "string" },
    treatment: { type: "string" },
    procedure: { type: "string" },
    investigation: { type: "string" },
    requestedService: { type: "string" },
    patientPhone: { type: "string" },
    originatingHospital: { type: "string" },
    referralHospital: { type: "string" },
    urgencyLevel: { type: "integer" },
    missingInfo: { type: "array", items: { type: "string" } },
    isCancellationIntent: { type: "boolean" },
    queryPatientName: { type: "string" },
    queryPolicyNumber: { type: "string" },
    conversationalReply: { type: "string" },
  },
  required: ["intent", "urgencyLevel", "missingInfo", "isCancellationIntent"],
} as const;

// ── Provider configuration (no secrets are ever logged) ──────────────────────
export interface ProviderEnv {
  geminiApiKey?: string;
  geminiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  modalEndpoint?: string;
  modalWebhookSecret?: string;
  geminiTimeoutMs?: number;
  groqTimeoutMs?: number;
  modalTimeoutMs?: number;
}

export type ProviderLogStatus = "ok" | "error" | "skipped";

export type ProviderLogger = (
  stage: string,
  messageId: string,
  status: ProviderLogStatus,
  detail?: Record<string, unknown>,
) => void;

export interface ProviderOptions {
  env: ProviderEnv;
  log?: ProviderLogger;
  fetch?: typeof fetch;
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 10_000;
const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODAL_SECRET_HEADER = "x-modal-webhook-secret";

const OPTIONAL_STRING_KEYS = [
  "patientName",
  "policyNumber",
  "diagnosis",
  "treatment",
  "procedure",
  "investigation",
  "requestedService",
  "patientPhone",
  "originatingHospital",
  "referralHospital",
  "queryPatientName",
  "queryPolicyNumber",
  "conversationalReply",
] as const;

// ── Shared prompt/context construction ───────────────────────────────────────
export function buildUserMessage(text: string, context: string): string {
  return context ? `${context}\n\nCURRENT MESSAGE:\n${text}` : text;
}

// ── Shared normalization/validation layer ────────────────────────────────────
// Every provider output passes through this. Invalid or incomplete output
// throws, which makes the router fail over to the next provider.
function optionalString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

export function normalizeAnalysis(
  input: unknown,
  text?: string,
): AnalysisResult {
  if (!input || typeof input !== "object") {
    throw new Error("provider returned a non-object response");
  }
  const raw = input as Record<string, unknown>;
  const intent =
    typeof raw.intent === "string" ? raw.intent.trim().toUpperCase() : "";
  if (!intent || !(SUPPORTED_INTENTS as readonly string[]).includes(intent)) {
    throw new Error(
      `invalid or missing intent: ${JSON.stringify(raw.intent ?? null)}`,
    );
  }
  const urgencyLevel =
    typeof raw.urgencyLevel === "number" && Number.isFinite(raw.urgencyLevel)
      ? Math.max(1, Math.min(5, Math.round(raw.urgencyLevel)))
      : 3;
  const missingInfo = Array.isArray(raw.missingInfo)
    ? raw.missingInfo
        .map((m: unknown) => String(m).trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const result: AnalysisResult = {
    intent,
    urgencyLevel,
    missingInfo,
    isCancellationIntent:
      typeof raw.isCancellationIntent === "boolean"
        ? raw.isCancellationIntent
        : false,
  };
  for (const key of OPTIONAL_STRING_KEYS) {
    (result as unknown as Record<string, unknown>)[key] = optionalString(raw[key]);
  }

  // Deterministic canonicalization (preserved from the previous Gemini path):
  // the originating hospital is derived from the message text, never trusted
  // solely from the model.
  const lowerText = String(text || "").toLowerCase();
  if (
    lowerText.includes("university health service") ||
    lowerText.includes("jaja")
  ) {
    result.originatingHospital =
      "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
  }
  return result;
}
// ── Failure classification (no secrets included) ─────────────────────────────
export class ProviderError extends Error {
  readonly httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "ProviderError";
    this.httpStatus = httpStatus;
  }
}

export interface ProviderFailure {
  httpStatus: number | null;
  quotaExhausted: boolean;
  retryable: boolean;
}

export function classifyProviderFailure(error: unknown): ProviderFailure {
  const message = String((error as Error)?.message || "");
  const regexp = /HTTP (\d{3})/.exec(message);
  let httpStatus: number | null = regexp ? Number(regexp[1]) : null;
  if (error instanceof ProviderError && typeof error.httpStatus === "number") {
    httpStatus = error.httpStatus;
  }
  const quotaExhausted =
    httpStatus === 429 ||
    /quota|resource[_ -]?exhausted|rate\s*limit|too\s*many\s*requests/i.test(
      message,
    );
  const retryable =
    httpStatus === null ||
    httpStatus === 429 ||
    httpStatus === 500 ||
    httpStatus === 502 ||
    httpStatus === 503 ||
    httpStatus === 504;
  return { httpStatus, quotaExhausted, retryable };
}

// ── HTTP plumbing with a hard timeout ────────────────────────────────────────
function getFetch(opts: ProviderOptions): typeof fetch {
  if (opts.fetch) return opts.fetch;
  const g = globalThis as unknown as { fetch?: typeof fetch };
  if (typeof g.fetch === "function") return g.fetch.bind(g);
  throw new Error("provider: fetch is not available in this runtime");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  opts: ProviderOptions,
): Promise<Response> {
  const fetchImpl = getFetch(opts);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // noop — already aborted
    }
  }, Math.max(1, timeoutMs));
  try {
    // Race the real request against an abort-driven rejection so a fetch that
    // ignores the AbortSignal still cannot hang the worker indefinitely.
    return await Promise.race([
      fetchImpl(url, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        const onAbort = () =>
          reject(new Error(`request timed out after ${timeoutMs}ms`));
        if (controller.signal.aborted) return onAbort();
        controller.signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } catch (e) {
    throw new Error(
      `provider request error: ${(e as Error)?.message || String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

interface UnknownRecord {
  [k: string]: unknown;
}

async function parseJsonContent(
  content: unknown,
  provider: string,
): Promise<UnknownRecord> {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`${provider}: empty response`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`${provider}: unparseable JSON response`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${provider}: non-object JSON response`);
  }
  return parsed as UnknownRecord;
}
// ── Provider adapters ────────────────────────────────────────────────────────
export async function extractWithGemini(
  text: string,
  context: string,
  opts: ProviderOptions,
): Promise<AnalysisResult> {
  const env = opts.env ?? {};
  const model = env.geminiModel || DEFAULT_GEMINI_MODEL;
  const apiKey = env.geminiApiKey || "";
  if (!apiKey) throw new ProviderError("GEMINI_API_KEY missing");
  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [{ text: buildUserMessage(text, context) }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: GEMINI_JSON_SCHEMA,
        },
      }),
    },
    env.geminiTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    opts,
  );
  if (!res.ok) {
    const body = await readResponseBody(res);
    throw new ProviderError(
      `Gemini HTTP ${res.status}: ${body.slice(0, 400)}`,
      res.status,
    );
  }
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = await parseJsonContent(part, "Gemini");
  const normalized = normalizeAnalysis(parsed, text);
  normalized.raw = data;
  return normalized;
}

export async function extractWithGroq(
  text: string,
  context: string,
  opts: ProviderOptions,
): Promise<AnalysisResult> {
  const env = opts.env ?? {};
  const apiKey = env.groqApiKey || "";
  const model = env.groqModel || "";
  if (!apiKey) throw new ProviderError("GROQ_API_KEY missing");
  if (!model) throw new ProviderError("GROQ_MODEL missing");
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(text, context) },
    ],
    temperature: 0,
  };
  // JSON response mode where supported (OpenAI-compatible).
  body.response_format = { type: "json_object" };
  const res = await fetchWithTimeout(
    GROQ_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    env.groqTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    opts,
  );
  if (!res.ok) {
    const errorBody = await readResponseBody(res);
    throw new ProviderError(
      `Groq HTTP ${res.status}: ${errorBody.slice(0, 400)}`,
      res.status,
    );
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = await parseJsonContent(content, "Groq");
  const normalized = normalizeAnalysis(parsed, text);
  normalized.raw = data;
  return normalized;
}

export async function extractWithModal(
  text: string,
  context: string,
  opts: ProviderOptions,
): Promise<AnalysisResult> {
  const env = opts.env ?? {};
  const endpoint = String(env.modalEndpoint || "").trim();
  if (!endpoint) throw new ProviderError("MODAL_ENDPOINT not configured");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.modalWebhookSecret) {
    headers[MODAL_SECRET_HEADER] = env.modalWebhookSecret;
  }
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ text, context }),
    },
    env.modalTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    opts,
  );
  if (!res.ok) {
    const errorBody = await readResponseBody(res);
    throw new ProviderError(
      `Modal HTTP ${res.status}: ${errorBody.slice(0, 400)}`,
      res.status,
    );
  }
  const data = await res.json();
  // Accept either a flat AnalysisResult or a nested `{ analysis: {...} }`
  // envelope so the endpoint contract stays flexible.
  const payload =
    data && typeof data === "object" && data.analysis
      ? data.analysis
      : data;
  const normalized = normalizeAnalysis(payload, text);
  normalized.raw = data;
  return normalized;
}
// ── Router: Gemini → Groq → Modal → deterministic fallback ───────────────────
export async function analyzeMessage(
  text: string,
  context: string,
  messageId: string,
  conversation: unknown,
  opts: ProviderOptions,
): Promise<AnalysisResult> {
  const env = opts.env ?? {};
  const logFn = opts.log;

  const step = async (
    provider: string,
    call: () => Promise<AnalysisResult>,
    modelLabel: string,
  ): Promise<AnalysisResult | null> => {
    const startedAt = Date.now();
    try {
      const result = await call();
      logFn?.("provider_" + provider, messageId, "ok", {
        provider,
        model: modelLabel,
        status: "ok",
        latency_ms: Date.now() - startedAt,
        intent: result.intent,
      });
      return result;
    } catch (e) {
      const failure = classifyProviderFailure(e);
      logFn?.("provider_" + provider, messageId, "error", {
        provider,
        model: modelLabel,
        status: "error",
        error_classification: failure.retryable ? "retryable" : "fatal",
        http_status: failure.httpStatus ?? undefined,
        quota_exhausted: failure.quotaExhausted,
        latency_ms: Date.now() - startedAt,
      });
      return null;
    }
  };

  const geminiResult = await step(
    "gemini",
    () => extractWithGemini(text, context, opts),
    env.geminiModel || DEFAULT_GEMINI_MODEL,
  );
  if (geminiResult) return geminiResult;

  const groqResult = await step(
    "groq",
    () => extractWithGroq(text, context, opts),
    env.groqModel || "",
  );
  if (groqResult) return groqResult;

  const modalEndpoint = String(env.modalEndpoint || "").trim();
  if (modalEndpoint) {
    const modalResult = await step(
      "modal",
      () => extractWithModal(text, context, opts),
      modalEndpoint,
    );
    if (modalResult) return modalResult;
  } else {
    logFn?.("provider_modal", messageId, "skipped", {
      provider: "modal",
      reason: "not_configured",
    });
  }

  // All providers failed — deterministic safety net.
  const fallback = deterministicFallbackAnalysis(text, conversation);
  logFn?.("provider_fallback", messageId, "ok", {
    provider: "deterministic",
    intent: fallback.intent,
    reason: "all_providers_failed",
  });
  return fallback;
}