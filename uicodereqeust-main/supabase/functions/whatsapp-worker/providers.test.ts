// whatsapp-worker/providers.test.ts
// Unit tests for the AI provider failover router (Gemini → Groq → Modal →
// deterministic fallback) and the shared normalization/validation layer.
import { describe, expect, it, vi } from "vitest";
import {
  analyzeMessage,
  classifyProviderFailure,
  normalizeAnalysis,
  SYSTEM_PROMPT,
  type ProviderLogger,
  type ProviderOptions,
} from "./providers.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function geminiBody(text: unknown) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(text) }] } }],
  };
}

function groqBody(content: unknown) {
  return { choices: [{ message: { content: JSON.stringify(content) } }] };
}

function modalBody(payload: unknown) {
  // Modal may return a flat analysis or an { analysis } envelope.
  return payload;
}

function validAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    intent: "NEW_AUTHORIZATION",
    urgencyLevel: 3,
    missingInfo: [],
    isCancellationIntent: false,
    patientName: "Akin Tehingbola",
    ...overrides,
  };
}

function baseOptions(overrides: Partial<ProviderOptions> = {}): ProviderOptions {
  return {
    env: {
      geminiApiKey: "gemini-secret-key",
      geminiModel: "gemini-2.5-flash",
      groqApiKey: "groq-secret-key",
      groqModel: "llama-3.3-70b-versatile",
      modalEndpoint: "https://modal.example/run",
      modalWebhookSecret: "modal-secret-key",
      geminiTimeoutMs: 5000,
      groqTimeoutMs: 5000,
      modalTimeoutMs: 5000,
    },
    ...overrides,
  };
}

function urlRouter(fetchImpl: (url: string, init?: RequestInit) => unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const ret = fetchImpl(url, init);
    if (ret instanceof Promise) return ret;
    return ret;
  }) as unknown as typeof fetch;
}

function makeLogger(calls: { stage: string; detail?: unknown }[]): ProviderLogger {
  return (stage, _messageId, _status, detail) => {
    calls.push({ stage, detail });
  };
}

const MESSAGE_ID = "test-message-1";
const TEXT =
  "Full Name: Akin Tehingbola\nNHIA No: 2871250-1\nDiagnosis: HTN\nDrugs: Amlodipine 10mg";
const CONTEXT = "CONVERSATION STATE\nactive_intent=none";
// ── Tests ────────────────────────────────────────────────────────────────────
describe("provider router — success paths", () => {
  it("1. Gemini success returns the Gemini result (Groq/Modal not called)", async () => {
    const calls: string[] = [];
    const fetchMock = urlRouter((url) => {
      calls.push(url);
      return jsonResponse(
        geminiBody(
          validAnalysis({ intent: "NEW_AUTHORIZATION", urgencyLevel: 4 }),
        ),
      );
    });
    const result = await analyzeMessage(
      TEXT,
      CONTEXT,
      MESSAGE_ID,
      {},
      baseOptions({ fetch: fetchMock }),
    );
    expect(result.intent).toBe("NEW_AUTHORIZATION");
    expect(result.urgencyLevel).toBe(4);
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("generativelanguage.googleapis.com");
  });

  it("4. Gemini failure + Groq success → Groq result returned", async () => {
    const calls: string[] = [];
    const fetchMock = urlRouter((url) => {
      calls.push(url);
      if (url.includes("generativelanguage.googleapis.com")) {
        return jsonResponse({ error: "quota" }, 429);
      }
      return jsonResponse(
        groqBody(validAnalysis({ intent: "GREETING", patientName: null })),
      );
    });
    const result = await analyzeMessage(
      TEXT,
      CONTEXT,
      MESSAGE_ID,
      {},
      baseOptions({ fetch: fetchMock }),
    );
    expect(result.intent).toBe("GREETING");
    expect(calls.length).toBe(2);
    expect(calls[1]).toContain("api.groq.com");
  });

  it("5. Gemini + Groq fail + Modal success → Modal result returned", async () => {
    const calls: string[] = [];
    const fetchMock = urlRouter((url) => {
      calls.push(url);
      if (url.includes("generativelanguage.googleapis.com")) {
        return jsonResponse({ error: "quota" }, 429);
      }
      if (url.includes("api.groq.com")) {
        return jsonResponse({ error: "backend" }, 500);
      }
      return jsonResponse(
        modalBody(validAnalysis({ intent: "HELP", patientName: null })),
      );
    });
    const result = await analyzeMessage(
      TEXT,
      CONTEXT,
      MESSAGE_ID,
      {},
      baseOptions({ fetch: fetchMock }),
    );
    expect(result.intent).toBe("HELP");
    expect(calls.length).toBe(3);
    expect(calls[2]).toContain("modal.example");
  });

  it("11. Modal is skipped entirely when MODAL_ENDPOINT is absent", async () => {
    const calls: string[] = [];
    const fetchMock = urlRouter((url) => {
      calls.push(url);
      return jsonResponse({ error: "quota" }, 429);
    });
    const opts = baseOptions({ fetch: fetchMock });
    opts.env.modalEndpoint = "";
    opts.env.modalWebhookSecret = "";
    const result = await analyzeMessage(TEXT, CONTEXT, MESSAGE_ID, {}, opts);
    // Gemini 429 → Groq 429 → Modal skipped → deterministic fallback.
    expect(calls.length).toBe(2);
    expect(result.geminiFallback).toBe(true);
    expect(calls.some((c) => c.includes("modal.example"))).toBe(false);
  });
});

describe("provider router — 429 failover (no same-provider retry)", () => {
  it("2. Gemini 429 → Groq is called", async () => {
    const geminiCalls: string[] = [];
    const fetchMock = urlRouter((url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls.push(url);
        return jsonResponse({ error: "quota" }, 429);
      }
      return jsonResponse(
        groqBody(validAnalysis({ intent: "UNKNOWN", patientName: null })),
      );
    });
    const result = await analyzeMessage(
      TEXT,
      CONTEXT,
      MESSAGE_ID,
      {},
      baseOptions({ fetch: fetchMock }),
    );
    expect(geminiCalls.length).toBe(1);
    expect(result.intent).toBe("UNKNOWN");
  });

  it("3. Gemini 429 → Gemini is NOT called twice", async () => {
    const geminiCalls: string[] = [];
    const fetchMock = urlRouter((url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls.push(url);
        return jsonResponse({ error: "quota" }, 429);
      }
      return jsonResponse(
        groqBody(validAnalysis({ intent: "HELP", patientName: null })),
      );
    });
    await analyzeMessage(TEXT, CONTEXT, MESSAGE_ID, {}, baseOptions({ fetch: fetchMock }));
    expect(geminiCalls.length).toBe(1);
  });
});
describe("provider router — malformed / invalid output", () => {
  it("7. Malformed Groq JSON → failover to Modal", async () => {
    let groqCalls = 0;
    const fetchMock = urlRouter((url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return jsonResponse({ error: "quota" }, 429);
      }
      if (url.includes("api.groq.com")) {
        groqCalls++;
        return jsonResponse({ choices: [{ message: { content: "{ not json" } }] });
      }
      return jsonResponse(modalBody(validAnalysis({ intent: "HELP" })));
    });
    const result = await analyzeMessage(
      TEXT,
      CONTEXT,
      MESSAGE_ID,
      {},
      baseOptions({ fetch: fetchMock }),
    );
    expect(groqCalls).toBe(1);
    expect(result.intent).toBe("HELP");
  });

  it("8. Invalid intent → provider treated as failed → deterministic fallback", async () => {
    const fetchMock = urlRouter((url) => {
      return jsonResponse(
        groqBody(validAnalysis({ intent: "NOT_A_REAL_INTENT" })),
      );
    });
    const result = await analyzeMessage(
      TEXT,
      CONTEXT,
      MESSAGE_ID,
      {},
      baseOptions({ fetch: fetchMock }),
    );
    expect(result.geminiFallback).toBe(true);
    // Deterministic analysis of a structured authorization message.
    expect(result.intent).toBe("NEW_AUTHORIZATION");
  });
});

describe("provider router — all providers fail", () => {
  it("6. All providers fail → deterministic fallback returned", async () => {
    const fetchMock = urlRouter(() => jsonResponse({ error: "down" }, 503));
    const result = await analyzeMessage(
      TEXT,
      CONTEXT,
      MESSAGE_ID,
      {},
      baseOptions({ fetch: fetchMock }),
    );
    expect(result.geminiFallback).toBe(true);
    expect(result.intent).toBe("NEW_AUTHORIZATION");
  });
});

describe("provider router — timeout", () => {
  it("13. Provider timeout causes failover rather than hanging", async () => {
    const fetchMock = urlRouter(() => new Promise<Response>(() => {}));
    const opts = baseOptions({ fetch: fetchMock });
    // Force a tiny timeout so the test does not wait long.
    opts.env.geminiTimeoutMs = 50;
    opts.env.groqTimeoutMs = 50;
    opts.env.modalTimeoutMs = 50;
    const startedAt = Date.now();
    const result = await analyzeMessage(TEXT, CONTEXT, MESSAGE_ID, {}, opts);
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeLessThan(5000);
    expect(result.geminiFallback).toBe(true);
  });
});

describe("provider router — secret hygiene", () => {
  it("12. Provider secrets never appear in logs", async () => {
    const calls: { stage: string; detail?: unknown }[] = [];
    let groqCalls = 0;
    const fetchMock = urlRouter((url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return jsonResponse({ error: "quota" }, 429);
      }
      if (url.includes("api.groq.com")) {
        groqCalls++;
        return jsonResponse({ error: "denied" }, 401);
      }
      return jsonResponse(
        modalBody(validAnalysis({ intent: "HELP", patientName: null })),
      );
    });
    const opts = baseOptions({ fetch: fetchMock, log: makeLogger(calls) });
    await analyzeMessage(TEXT, CONTEXT, MESSAGE_ID, {}, opts);

    const serialized = JSON.stringify(calls);
    expect(serialized).not.toContain("gemini-secret-key");
    expect(serialized).not.toContain("groq-secret-key");
    expect(serialized).not.toContain("modal-secret-key");
    // A failure log entry for Gemini 429 must exist.
    expect(calls.some((c) => c.stage === "provider_gemini")).toBe(true);
    expect(groqCalls).toBe(1);
  });
});
describe("shared normalization/validation", () => {
  it("9. urgencyLevel is clamped to 1–5", () => {
    expect(normalizeAnalysis(validAnalysis({ urgencyLevel: 0 })).urgencyLevel).toBe(1);
    expect(
      normalizeAnalysis(validAnalysis({ urgencyLevel: 10 })).urgencyLevel,
    ).toBe(5);
    expect(normalizeAnalysis(validAnalysis({ urgencyLevel: 3.4 })).urgencyLevel).toBe(3);
    expect(
      normalizeAnalysis(validAnalysis({ urgencyLevel: "nope" })).urgencyLevel,
    ).toBe(3);
  });

  it("10. missingInfo is limited to 10 items", () => {
    const missingInfo = Array.from({ length: 25 }, (_, i) => `item-${i}`);
    const out = normalizeAnalysis(validAnalysis({ missingInfo }));
    expect(out.missingInfo).toHaveLength(10);
  });

  it("invalid intent throws (so router can fail over)", () => {
    expect(() => normalizeAnalysis({ intent: "FLYING" })).toThrow();
    expect(() => normalizeAnalysis({})).toThrow();
  });

  it("originatingHospital is canonicalized from text (never trusted from model)", () => {
    const out = normalizeAnalysis(
      validAnalysis({ originatingHospital: "SOME FAKE HOSPITAL" }),
      "From University Health Service.",
    );
    expect(out.originatingHospital).toBe(
      "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
    );
  });
});

describe("shared prompt", () => {
  it("system prompt names the supported intents and JSON-only rule", () => {
    expect(SYSTEM_PROMPT).toContain("NEW_AUTHORIZATION");
    expect(SYSTEM_PROMPT).toContain("AUTHORIZATION_STATUS");
    expect(SYSTEM_PROMPT).toContain("Return JSON only");
  });
});

describe("failure classification", () => {
  it("classifies 429 as quota_exhausted + retryable", () => {
    const f = classifyProviderFailure(new Error("Gemini HTTP 429: quota"));
    expect(f.httpStatus).toBe(429);
    expect(f.quotaExhausted).toBe(true);
    expect(f.retryable).toBe(true);
  });

  it("classifies 400 as non-retryable", () => {
    const f = classifyProviderFailure(new Error("Groq HTTP 400: bad request"));
    expect(f.httpStatus).toBe(400);
    expect(f.retryable).toBe(false);
  });

  it("classifies network error as retryable", () => {
    const f = classifyProviderFailure(
      new Error("fetch failed: connection reset"),
    );
    expect(f.httpStatus).toBeNull();
    expect(f.retryable).toBe(true);
  });
});