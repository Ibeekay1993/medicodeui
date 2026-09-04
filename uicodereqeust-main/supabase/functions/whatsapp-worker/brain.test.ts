// whatsapp-worker/brain.test.ts
// Unit tests for the pure WhatsApp conversation-intelligence functions.
// Covers the conversation regression matrix from WHATSAPP_AI_BRAIN_SPEC.md /
// the builder handoff (greetings, authorizations, status/approval/rejection
// queries, task switching, provider queries, multi-patient, dedup inputs).
import { describe, expect, it } from "vitest";
import {
  brainGuard,
  buildContext,
  classifyGeminiFailure,
  cleanQueryPatientName,
  deriveProviderSearchTerm,
  deterministicFallbackAnalysis,
  extractAuthFieldsFromRaw,
  extractQueryPatientName,
  hasStrongAuthIndicators,
  splitPatientBlocks,
  type GeminiAnalysisResult,
} from "./brain.ts";

function baseAnalysis(
  partial: Partial<GeminiAnalysisResult> = {},
): GeminiAnalysisResult {
  return {
    intent: "UNKNOWN",
    urgencyLevel: 3,
    missingInfo: [],
    isCancellationIntent: false,
    ...partial,
  };
}

describe("splitPatientBlocks", () => {
  it("splits a multi-patient message into separate blocks", () => {
    const text = [
      "Full Name: Akin Tehingbola",
      "NHIS No: 2871250-1",
      "Diagnosis: HTN",
      "Full Name: Hamdallah Oladejo",
      "NHIS No: 2173578-1",
      "Diagnosis: Fibroadenoma",
      "Full Name: Adesola Okafor",
      "NHIS No: 1111111-1",
      "Diagnosis: Malaria",
    ].join("\n");
    const blocks = splitPatientBlocks(text);
    expect(blocks.length).toBe(3);
    expect(blocks[0]).toContain("Akin");
    expect(blocks[1]).toContain("Hamdallah");
    expect(blocks[2]).toContain("Adesola");
  });

  it("keeps a single-patient message as one block", () => {
    expect(splitPatientBlocks("Hello there")).toHaveLength(1);
  });
});

describe("hasStrongAuthIndicators", () => {
  it("detects the real-world hospital format", () => {
    const msg = [
      "Full Name: AKIN TEHINGBOLA",
      "NHIS No: 2871250-1",
      "HMO: Ronsberger Nigeria Ltd.",
      "Sex: Male",
      "Date of birth: 04 Sep 1961",
      "Diagnosis: HTN",
      "Drugs: Amlodipine Tablet (Besylate) 10mg x30",
      "FROM UNIVERSITY HEALTH SERVICE",
    ].join("\n");
    expect(hasStrongAuthIndicators(msg)).toBe(true);
  });

  it("does not misclassify status questions or small talk", () => {
    expect(
      hasStrongAuthIndicators("What is the status for Segun Akinoe?"),
    ).toBe(false);
    expect(hasStrongAuthIndicators("I want to submit a new request")).toBe(
      false,
    );
    expect(hasStrongAuthIndicators("Good morning")).toBe(false);
  });
});

describe("extractAuthFieldsFromRaw", () => {
  it("extracts the hospital format including originating hospital", () => {
    const msg = [
      "Full Name: AKIN TEHINGBOLA",
      "NHIS No: 2871250-1",
      "Diagnosis: HTN",
      "Drugs: Amlodipine Tablet (Besylate) 10mg x30",
      "FROM UNIVERSITY HEALTH SERVICE",
    ].join("\n");
    const f = extractAuthFieldsFromRaw(msg);
    expect(f.patientName).toBe("AKIN TEHINGBOLA");
    expect(f.policyNumber).toBe("2871250-1");
    expect(f.diagnosis).toBe("HTN");
    expect(f.treatment).toContain("Amlodipine");
    expect(f.originatingHospital).toBe(
      "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
    );
  });

  it("supports procedures, investigations and services as requested services", () => {
    const proc = extractAuthFieldsFromRaw(
      "Full Name: Hamdallah Oladejo\nNHIS No: 2173578-1\nDiagnosis: ? Fibroadenoma\nProcedures: Breast Scan x2",
    );
    expect(proc.procedure).toContain("Breast Scan");
    const inv = extractAuthFieldsFromRaw(
      "Name: Test User\nNHIA No: 123\nDiagnosis: Fever\nInvestigations: FBC, Chest X-ray",
    );
    expect(inv.investigation).toContain("FBC");
    const svc = extractAuthFieldsFromRaw(
      "Name: Test User\nNHIA No: 123\nDiagnosis: Fever\nConsultation: Follow up (review)",
    );
    expect(svc.requestedService).toContain("Follow up");
  });
});

describe("extractQueryPatientName / cleanQueryPatientName", () => {
  it("extracts real patient names from natural status questions", () => {
    expect(extractQueryPatientName("What is the status for Segun Akinoe?")).toBe(
      "Segun Akinoe",
    );
    expect(
      extractQueryPatientName(
        "I need to understand the status for segun Akin Gehingbola",
      ),
    ).toBe("segun Akin Gehingbola");
    expect(extractQueryPatientName("Has Segun Akinoe been approved?")).toBe(
      "Segun Akinoe",
    );
    expect(extractQueryPatientName("Any update on Segun?")).toBe("Segun");
    expect(extractQueryPatientName("What happened to Saul?")).toBe("Saul");
  });

  it("returns null for reference phrases so sender-scoped lookup is used", () => {
    expect(extractQueryPatientName("What is the status of my request?")).toBeNull();
    expect(extractQueryPatientName("What is the status of the patient?")).toBeNull();
    expect(extractQueryPatientName("Is the authorization approved?")).toBeNull();
  });

  it("isolates the patient name after reference phrases (task switching)", () => {
    expect(
      extractQueryPatientName(
        "Actually, I want to check the status of my previous request for Segun.",
      ),
    ).toBe("Segun");
  });

  it("cleanQueryPatientName handles edge cases", () => {
    expect(cleanQueryPatientName("my request")).toBeNull();
    expect(cleanQueryPatientName("his case")).toBeNull();
    expect(cleanQueryPatientName("my previous request for Segun")).toBe("Segun");
    expect(cleanQueryPatientName("Segun Akinoe")).toBe("Segun Akinoe");
  });
});

describe("brainGuard — deterministic intent precedence", () => {
  it("routes status questions to AUTHORIZATION_STATUS despite stale state", () => {
    const out = brainGuard(
      "What is the status for Segun Akinoe?",
      baseAnalysis({ intent: "CONTINUE_AUTHORIZATION" }),
      { active_intent: "INCOMPLETE_AUTHORIZATION", last_patient_name: "John" },
    );
    expect(out.intent).toBe("AUTHORIZATION_STATUS");
    expect(out.queryPatientName).toBe("Segun Akinoe");
  });

  it("classifies approval and rejection questions", () => {
    const approved = brainGuard("Has Segun been approved?", baseAnalysis(), {});
    expect(approved.intent).toBe("APPROVAL_QUERY");
    expect(approved.queryPatientName).toBe("Segun");

    const rejected = brainGuard("Why was Segun rejected?", baseAnalysis(), {});
    expect(rejected.intent).toBe("REJECTION_QUERY");
    expect(rejected.queryPatientName).toBe("Segun");
  });

  it("falls back to sender-scope when the user only says 'my request'", () => {
    const out = brainGuard(
      "What is the status of my request?",
      baseAnalysis(),
      { active_intent: "COMPLETED", last_patient_name: null },
    );
    expect(out.intent).toBe("AUTHORIZATION_STATUS");
    expect(out.queryPatientName).toBeNull();
  });

  it("overrides a greeting classification when structured authorization is present", () => {
    const msg = [
      "Good morning. Please see the request.",
      "Full Name: Akin Tehingbola",
      "NHIS No: 2871250-1",
      "Diagnosis: HTN",
      "Drugs: Amlodipine 10mg x30",
    ].join("\n");
    const out = brainGuard(
      msg,
      baseAnalysis({ intent: "GREETING" }),
      { active_intent: "GREETING" },
    );
    expect(out.intent).toBe("NEW_AUTHORIZATION");
    expect(out.patientName).toBe("Akin Tehingbola");
    expect(out.policyNumber).toBe("2871250-1");
  });

  it("routes provider questions to PROVIDER_QUERY", () => {
    expect(
      brainGuard("I want to ask for a health provider", baseAnalysis(), {})
        .intent,
    ).toBe("PROVIDER_QUERY");
    expect(
      brainGuard("I need information about a hospital", baseAnalysis(), {})
        .intent,
    ).toBe("PROVIDER_QUERY");
    expect(
      brainGuard("Which clinics are available?", baseAnalysis(), {}).intent,
    ).toBe("PROVIDER_QUERY");
  });

  it("detects continuation of an unfinished authorization from field mentions", () => {
    const out = brainGuard(
      "his diagnosis is malaria",
      baseAnalysis({ intent: "UNKNOWN" }),
      { active_intent: "INCOMPLETE_AUTHORIZATION" },
    );
    expect(out.intent).toBe("CONTINUE_AUTHORIZATION");
  });

  it("strong authorization beats provider wording (structured data wins)", () => {
    const msg =
      "Full Name: John Doe\nNHIA No: 1234567\nDiagnosis: Malaria\nTreatment: Artemether/Lumefantrine\nAt the nearest hospital";
    const out = brainGuard(
      msg,
      baseAnalysis({ intent: "PROVIDER_QUERY" }),
      {},
    );
    expect(out.intent).toBe("NEW_AUTHORIZATION");
  });
});

describe("buildContext", () => {
  it("includes state and bounded recent history", () => {
    const ctx = buildContext(
      {
        active_intent: "INCOMPLETE_AUTHORIZATION",
        last_patient_name: "Segun",
        last_policy_number: "1234567",
        pending_data: { patientName: "Segun" },
      },
      [{ message_body: "Name: Segun" }, { message_body: "Diagnosis: Malaria" }],
    );
    expect(ctx).toContain("active_intent=INCOMPLETE_AUTHORIZATION");
    expect(ctx).toContain("last_patient_name=Segun");
    expect(ctx).toContain('"patientName":"Segun"');
    expect(ctx).toContain("inbound: Diagnosis: Malaria");
    expect(ctx).toContain("current message overrides stale context");
  });
});

describe("deriveProviderSearchTerm", () => {
  it("reduces provider questions to searchable terms", () => {
    expect(deriveProviderSearchTerm("I want to ask for a health provider")).toBe("");
    expect(deriveProviderSearchTerm("hospitals in Ibadan")).toBe("Ibadan");
    expect(deriveProviderSearchTerm("Do you have providers in Lagos?")).toBe("Lagos");
    expect(deriveProviderSearchTerm("maternity in Ibadan")).toBe(
      "maternity Ibadan",
    );
  });
});

describe("classifyGeminiFailure", () => {
  it("flags a 429 as quota-exhausted with a short retry", () => {
    const f = classifyGeminiFailure(
      "Gemini HTTP 429: {\"error\":{\"status\":\"RESOURCE_EXHAUSTED\"}}",
    );
    expect(f.httpStatus).toBe(429);
    expect(f.quotaExhausted).toBe(true);
    expect(f.retryDelayMs).toBe(1500);
  });

  it("retries transient 5xx but not a definitive 400", () => {
    expect(
      classifyGeminiFailure("Gemini HTTP 503: backend error").quotaExhausted,
    ).toBe(false);
    expect(
      classifyGeminiFailure("Gemini HTTP 503: backend error").retryDelayMs,
    ).toBe(800);
    expect(
      classifyGeminiFailure("Gemini HTTP 400: bad request").retryDelayMs,
    ).toBeNull();
  });

  it("classifies a quota error without a parseable HTTP status", () => {
    const f = classifyGeminiFailure("Gemini API quota exceeded for the minute");
    expect(f.httpStatus).toBeNull();
    expect(f.quotaExhausted).toBe(true);
  });

  it("treats a bare network error as transient (retry, no status)", () => {
    const f = classifyGeminiFailure("fetch failed: connection reset");
    expect(f.httpStatus).toBeNull();
    expect(f.retryDelayMs).toBe(800);
  });
});

describe("deterministicFallbackAnalysis (Gemini unavailable)", () => {
  it("preserves structured authorization intake without Gemini", () => {
    const msg = [
      "Full Name: Segun Akinoe",
      "NHIA No: 1234567",
      "Diagnosis: Malaria",
      "Treatment: Paracetamol Artemether/Lumefantrine",
    ].join("\n");
    const out = deterministicFallbackAnalysis(msg, {});
    expect(out.intent).toBe("NEW_AUTHORIZATION");
    expect(out.geminiFallback).toBe(true);
  });

  it("answers status enquiries deterministically", () => {
    const out = deterministicFallbackAnalysis(
      "What is the status for Segun Akinoe?",
      { last_patient_name: "Segun" },
    );
    expect(out.intent).toBe("AUTHORIZATION_STATUS");
    expect(out.queryPatientName).toBe("Segun Akinoe");
    expect(out.geminiFallback).toBe(true);
  });

  it("routes provider questions to PROVIDER_QUERY", () => {
    expect(
      deterministicFallbackAnalysis("hospitals in Ibadan", {}).intent,
    ).toBe("PROVIDER_QUERY");
  });

  it("recognises cancellation / reset text", () => {
    expect(deterministicFallbackAnalysis("cancel", {}).intent).toBe(
      "CANCELLATION",
    );
    expect(deterministicFallbackAnalysis("start over", {}).intent).toBe(
      "CANCELLATION",
    );
  });

  it("recognises bare greetings even without the fast paths", () => {
    expect(deterministicFallbackAnalysis("Good morning", {}).intent).toBe(
      "GREETING",
    );
    expect(deterministicFallbackAnalysis("Thank you", {}).intent).toBe(
      "GREETING",
    );
  });

  it("recognises a submit-intent opener so the flow keeps working", () => {
    expect(
      deterministicFallbackAnalysis("I want to submit a new request", {})
        .intent,
    ).toBe("INCOMPLETE_AUTHORIZATION");
  });

  it("scopes an unnamed status question to the sender's last patient", () => {
    const out = deterministicFallbackAnalysis(
      "What is the status of my request?",
      { last_patient_name: "Segun" },
    );
    expect(out.intent).toBe("AUTHORIZATION_STATUS");
    // No name in the message → falls back to the sender's last known patient.
    expect(out.queryPatientName).toBe("Segun");
  });

  it("leaves the name null when the sender has no prior patient", () => {
    const out = deterministicFallbackAnalysis(
      "What is the status of my request?",
      { last_patient_name: null },
    );
    expect(out.intent).toBe("AUTHORIZATION_STATUS");
    expect(out.queryPatientName).toBeNull();
  });
});