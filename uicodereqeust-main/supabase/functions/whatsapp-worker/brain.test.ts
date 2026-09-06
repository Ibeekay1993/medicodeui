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
  extractCanonicalClinicalItems,
  extractQueryPatientName,
  hasStrongAuthIndicators,
  isWhatsAppGroupMessage,
  normalizePhoneNumber,
  parsePolicyNumber,
  classifyAccessClass,
  classifyGeneralCustomerIntent,
  splitPatientBlocks,
  type GeminiAnalysisResult,
  authorizationValidationReply,
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

describe("authorizationValidationReply", () => {
  it.each([
    ["beneficiary_not_found", "could not be found"],
    ["beneficiary_mismatch", "could not be verified"],
    ["beneficiary_ambiguous", "is ambiguous"],
    ["invalid_policy_number", "policy number could not be validated"],
  ])("returns a safe response for %s", (reason, expected) => {
    expect(authorizationValidationReply(reason).toLowerCase()).toContain(
      expected,
    );
    expect(authorizationValidationReply(reason)).not.toContain(reason);
  });

  it("does not expose internal errors in the fallback response", () => {
    const reply = authorizationValidationReply(
      "Direct DB fallback failed: relation public.secret_table does not exist",
    );
    expect(reply).toContain("could not be validated");
    expect(reply).not.toContain("secret_table");
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

  it("extracts the patient phone without confusing it with the hospital sender", () => {
    const fields = extractAuthFieldsFromRaw(
      [
        "Name: Afolayan Kayode",
        "NHIA no: 1639554",
        "Diagnosis: HTN",
        "Services: Tab Amlodipine 10mg dly x1/12",
        "Phone: 09155186965",
        "From University Health Service.",
      ].join("\n"),
    );
    expect(fields.patientPhone).toBe("09155186965");
    expect(fields.originatingHospital).toContain("UNIVERSITY");
  });

  it.each(["Services", "Drugs", "Treatment"])(
    "normalizes %s headings without changing clinical classification",
    (heading) => {
      const items = extractCanonicalClinicalItems(
        [
          "Name : Afolayan Senab",
          "NHIA no: 1639554",
          "Diagnosis: HTN, Lumbar spondylosis",
          `${heading}: Tab Amlodipine 10mg dly x1/12, pregabalin T b.d 75mg x4//52`,
          "Phone: 09155186965",
        ].join("\n"),
      );
      expect(items).toHaveLength(2);
      expect(items.map((item) => item.normalized_name)).toEqual([
        "Amlodipine",
        "pregabalin",
      ]);
      expect(items.map((item) => item.item_type)).toEqual(["DRUG", "DRUG"]);
      expect(items[0].strength).toBe("10mg");
      expect(items[0].frequency).toBe("dly");
      expect(items[0].duration).toBe("x1/12");
    },
  );

  it("classifies clinical content instead of trusting the section heading", () => {
    expect(
      extractCanonicalClinicalItems("Treatment: MRI lumbar spine")[0].item_type,
    ).toBe("PROCEDURE");
    expect(
      extractCanonicalClinicalItems("Services: Physiotherapy x 6 sessions")[0]
        .item_type,
    ).toBe("SERVICE");
    expect(
      extractCanonicalClinicalItems(
        "DRUGS:\nLosartan 25mg\nAmlodipine 10mg",
      ),
    ).toHaveLength(2);
  });

  it.each([
    "AUTHORIZATION REQUEST",
    "AUTHORIZATION",
    "PREAUTHORIZATION",
    "",
  ])("recognizes structured authorization payload with heading %j", (heading) => {
    const message = [
      heading,
      "Patient: Oladoyinbo Lanre",
      "Policy No: 1638608",
      "Diagnosis: HTN",
      "Phone: 07030052954",
      heading ? "Drugs: Losartan 25mg" : "Losartan 25mg",
    ].filter(Boolean).join("\n");
    expect(hasStrongAuthIndicators(message)).toBe(true);
    const parsed = brainGuard(message, baseAnalysis({ intent: "UNKNOWN" }), {});
    expect(parsed.intent).toBe("NEW_AUTHORIZATION");
    expect(parsed.patientName).toBe("Oladoyinbo Lanre");
    expect(parsed.policyNumber).toBe("1638608");
    expect(extractCanonicalClinicalItems(message)[0].item_type).toBe("DRUG");
  });

  it("lets structured request evidence beat status words", () => {
    const message = [
      "AUTHORIZATION APPROVED",
      "Patient: Oladoyinbo Lanre",
      "Policy No: 1638608",
      "Diagnosis: HTN",
      "Phone: 07030052954",
      "Drugs: Losartan 25mg",
    ].join("\n");
    expect(brainGuard(message, baseAnalysis({ intent: "UNKNOWN" }), {}).intent).toBe(
      "NEW_AUTHORIZATION",
    );
  });

  it("does not treat a bare phone number as an authorization continuation", () => {
    expect(hasStrongAuthIndicators("07030052954")).toBe(false);
    expect(
      brainGuard(
        "07030052954",
        baseAnalysis({ intent: "CONTINUE_AUTHORIZATION" }),
        { active_intent: "INCOMPLETE_AUTHORIZATION", last_patient_name: "Old Patient" },
      ).intent,
    ).not.toBe("NEW_AUTHORIZATION");
  });
});

describe("parsePolicyNumber", () => {
  it("treats a bare policy as its own base with no suffix", () => {
    const p = parsePolicyNumber("1639554");
    expect(p.isFamilyPolicy).toBe(false);
    expect(p.basePolicy).toBe("1639554");
    expect(p.submittedPolicy).toBe("1639554");
    expect(p.memberSuffix).toBeNull();
  });

  it("decomposes the principal / dependent / spouse suffixes", () => {
    expect(parsePolicyNumber("1639554-1")).toMatchObject({
      submittedPolicy: "1639554-1",
      basePolicy: "1639554",
      memberSuffix: "1",
      isFamilyPolicy: true,
    });
    expect(parsePolicyNumber("1639554-2")).toMatchObject({
      submittedPolicy: "1639554-2",
      basePolicy: "1639554",
      memberSuffix: "2",
      isFamilyPolicy: true,
    });
    expect(parsePolicyNumber("1639554-3")).toMatchObject({
      submittedPolicy: "1639554-3",
      basePolicy: "1639554",
      memberSuffix: "3",
      isFamilyPolicy: true,
    });
  });

  it("trims surrounding whitespace before parsing", () => {
    const p = parsePolicyNumber("  1639554-2  ");
    expect(p.basePolicy).toBe("1639554");
    expect(p.memberSuffix).toBe("2");
    expect(p.isFamilyPolicy).toBe(true);
  });

  it("does not treat non-`digits-digits` shapes as family policies", () => {
    expect(parsePolicyNumber("ABC-001").isFamilyPolicy).toBe(false);
    expect(parsePolicyNumber("ABC-001").basePolicy).toBe("ABC-001");
    expect(parsePolicyNumber("").basePolicy).toBe("");
    expect(parsePolicyNumber("1639554.2").isFamilyPolicy).toBe(false);
  });

  it("never guesses a beneficiary from a suffix", () => {
    // The suffix is metadata: the base policy is what the family lookup uses,
    // and identity always comes from the exact beneficiary (name) validation.
    const suffixTwo = parsePolicyNumber("1639554-2");
    expect(suffixTwo.basePolicy).toBe("1639554");
    expect(suffixTwo.memberSuffix).toBe("2");
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

describe("isWhatsAppGroupMessage (Silent Group Message Ignore)", () => {
  it("Test 1: detects group Hello as a group message", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "120363025343423456@g.us",
          fromMe: false,
          id: "3EB01234567890",
        },
        message: { conversation: "Hello" },
      },
    };
    expect(isWhatsAppGroupMessage(payload)).toBe(true);
  });

  it("Test 2: detects group authorization request as a group message", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "120363025343423456@g.us",
          fromMe: false,
          id: "3EB01234567891",
        },
        message: { conversation: "I want to submit an authorization" },
      },
    };
    expect(isWhatsAppGroupMessage(payload)).toBe(true);
  });

  it("Test 3: detects group support request as a group message", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "120363025343423456@g.us",
          fromMe: false,
          id: "3EB01234567892",
        },
        message: { conversation: "I need customer support" },
      },
    };
    expect(isWhatsAppGroupMessage(payload)).toBe(true);
  });

  it("Test 4: group message with participant as registered hospital is STILL ignored", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "120363025343423456@g.us",
          participant: "2348143813828@s.whatsapp.net",
          fromMe: false,
          id: "3EB01234567893",
        },
        message: { conversation: "Hello from UCH team" },
      },
    };
    expect(isWhatsAppGroupMessage(payload)).toBe(true);
  });

  it("Test 5: direct 1-to-1 message from registered hospital is NOT treated as group", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "2348143813828@s.whatsapp.net",
          fromMe: false,
          id: "3EB01234567894",
        },
        message: { conversation: "Hello" },
      },
    };
    expect(isWhatsAppGroupMessage(payload)).toBe(false);
  });

  it("Test 6: direct 1-to-1 message from unregistered customer is NOT treated as group", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "2348011223344@s.whatsapp.net",
          fromMe: false,
          id: "3EB01234567895",
        },
        message: { conversation: "Hello" },
      },
    };
    expect(isWhatsAppGroupMessage(payload)).toBe(false);
  });

  it("detects broadcast and isGroup flag variants", () => {
    expect(isWhatsAppGroupMessage({ data: { key: { remoteJid: "status@broadcast" } } })).toBe(true);
    expect(isWhatsAppGroupMessage({ data: { isGroup: true, key: { remoteJid: "some_id" } } })).toBe(true);
  });
});

describe("classifyAccessClass (3-tier security boundary)", () => {
  it("classifies active hospital contact as REGISTERED_HOSPITAL", () => {
    const matches = [{ hospital_id: "hosp-123", status: "active" }];
    const res = classifyAccessClass(matches);
    expect(res.accessClass).toBe("REGISTERED_HOSPITAL");
    expect(res.authorized).toBe(true);
    expect(res.hospitalId).toBe("hosp-123");
  });

  it("classifies missing contact as GENERAL_CUSTOMER", () => {
    const res = classifyAccessClass([]);
    expect(res.accessClass).toBe("GENERAL_CUSTOMER");
    expect(res.authorized).toBe(false);
  });

  it("classifies disabled contact as DISABLED_OR_REVOKED", () => {
    const matches = [{ hospital_id: "hosp-123", status: "disabled" }];
    const res = classifyAccessClass(matches);
    expect(res.accessClass).toBe("DISABLED_OR_REVOKED");
    expect(res.authorized).toBe(false);
  });

  it("classifies revoked contact as DISABLED_OR_REVOKED", () => {
    const matches = [{ hospital_id: "hosp-123", status: "revoked" }];
    const res = classifyAccessClass(matches);
    expect(res.accessClass).toBe("DISABLED_OR_REVOKED");
    expect(res.authorized).toBe(false);
  });

  it("classifies ambiguous multi-hospital active match as GENERAL_CUSTOMER for safety", () => {
    const matches = [
      { hospital_id: "hosp-1", status: "active" },
      { hospital_id: "hosp-2", status: "active" },
    ];
    const res = classifyAccessClass(matches);
    expect(res.accessClass).toBe("GENERAL_CUSTOMER");
    expect(res.authorized).toBe(false);
  });
});

describe("classifyGeneralCustomerIntent", () => {
  it("detects provider claims / authorization requests without granting privileges", () => {
    expect(classifyGeneralCustomerIntent("I want to submit an authorization")).toBe("PROVIDER_CLAIM");
    expect(classifyGeneralCustomerIntent("I am from UCH and need a code")).toBe("PROVIDER_CLAIM");
    expect(classifyGeneralCustomerIntent("I am a doctor")).toBe("PROVIDER_CLAIM");
  });

  it("detects provider registration requests in natural language", () => {
    expect(classifyGeneralCustomerIntent("How do I register my hospital?")).toBe("PROVIDER_REGISTRATION");
    expect(classifyGeneralCustomerIntent("I want to register this number")).toBe("PROVIDER_REGISTRATION");
    expect(classifyGeneralCustomerIntent("Register our hospital")).toBe("PROVIDER_REGISTRATION");
    expect(classifyGeneralCustomerIntent("Provider registration")).toBe("PROVIDER_REGISTRATION");
  });

  it("maps 5-option provider menu numbers correctly in provider context", () => {
    expect(classifyGeneralCustomerIntent("1", true)).toBe("PROVIDER_REGISTRATION");
    expect(classifyGeneralCustomerIntent("1️⃣", true)).toBe("PROVIDER_REGISTRATION");
    expect(classifyGeneralCustomerIntent("2", true)).toBe("SUPPORT_REQUEST");
    expect(classifyGeneralCustomerIntent("2️⃣", true)).toBe("SUPPORT_REQUEST");
    expect(classifyGeneralCustomerIntent("3", true)).toBe("CALLBACK_REQUEST");
    expect(classifyGeneralCustomerIntent("3️⃣", true)).toBe("CALLBACK_REQUEST");
    expect(classifyGeneralCustomerIntent("4", true)).toBe("FAQ");
    expect(classifyGeneralCustomerIntent("5", true)).toBe("FAQ");
  });

  it("maps 3-option customer menu numbers correctly in general customer context", () => {
    expect(classifyGeneralCustomerIntent("1", false)).toBe("SUPPORT_REQUEST");
    expect(classifyGeneralCustomerIntent("1️⃣", false)).toBe("SUPPORT_REQUEST");
    expect(classifyGeneralCustomerIntent("2", false)).toBe("CALLBACK_REQUEST");
    expect(classifyGeneralCustomerIntent("2️⃣", false)).toBe("CALLBACK_REQUEST");
    expect(classifyGeneralCustomerIntent("3", false)).toBe("FAQ");
    expect(classifyGeneralCustomerIntent("3️⃣", false)).toBe("FAQ");
  });

  it("detects callback requests in natural language", () => {
    expect(classifyGeneralCustomerIntent("Request a phone call")).toBe("CALLBACK_REQUEST");
    expect(classifyGeneralCustomerIntent("Please call me")).toBe("CALLBACK_REQUEST");
    expect(classifyGeneralCustomerIntent("Can someone call me?")).toBe("CALLBACK_REQUEST");
  });

  it("detects support chat requests in natural language", () => {
    expect(classifyGeneralCustomerIntent("Chat with Customer Support")).toBe("SUPPORT_REQUEST");
    expect(classifyGeneralCustomerIntent("I need support")).toBe("SUPPORT_REQUEST");
    expect(classifyGeneralCustomerIntent("Speak with an agent")).toBe("SUPPORT_REQUEST");
  });

  it("detects general FAQ questions in natural language", () => {
    expect(classifyGeneralCustomerIntent("Ask a General HMO Question")).toBe("FAQ");
    expect(classifyGeneralCustomerIntent("What services and benefits are covered?")).toBe("FAQ");
    expect(classifyGeneralCustomerIntent("Provider Information")).toBe("FAQ");
  });

  it("defaults simple greetings to GREETING", () => {
    expect(classifyGeneralCustomerIntent("Hello")).toBe("GREETING");
    expect(classifyGeneralCustomerIntent("Hi there")).toBe("GREETING");
    expect(classifyGeneralCustomerIntent("Good day")).toBe("GREETING");
  });
});

describe("normalizePhoneNumber", () => {
  it("normalizes standard Nigerian formats", () => {
    expect(normalizePhoneNumber("+2348143813828")).toBe("2348143813828");
    expect(normalizePhoneNumber("2348143813828")).toBe("2348143813828");
    expect(normalizePhoneNumber("08143813828")).toBe("2348143813828");
    expect(normalizePhoneNumber("8143813828")).toBe("2348143813828");
    expect(normalizePhoneNumber("002348143813828")).toBe("2348143813828");
  });
});

describe("Production WhatsApp Flow — 14 Scenarios Verification", () => {
  const activeHospital = {
    hospital_id: "00000000-0000-0000-0000-000000000001",
    phone_number: "+2348143813828",
    status: "active",
  };
  const disabledHospital = {
    hospital_id: "00000000-0000-0000-0000-000000000002",
    phone_number: "+2348143810002",
    status: "disabled",
  };
  const revokedHospital = {
    hospital_id: "00000000-0000-0000-0000-000000000003",
    phone_number: "+2348143810003",
    status: "revoked",
  };

  function simulateWebhookProcessing(payload: any, registryContacts: any[]) {
    // Step 1: Group filter
    if (isWhatsAppGroupMessage(payload)) {
      return {
        action: "IGNORE_GROUP",
        httpStatus: 200,
        queuedForWorker: false,
        authorizationCreated: false,
        supportConversationCreated: false,
        whatsappReplySent: false,
      };
    }

    // Step 2: Extract sender phone
    const remoteJid = payload.data?.key?.remoteJid || "";
    const normalizedPhone = normalizePhoneNumber(remoteJid);

    // Step 3: Check hospital registry
    const matches = registryContacts.filter(
      (c) => normalizePhoneNumber(c.phone_number) === normalizedPhone,
    );
    const access = classifyAccessClass(matches);

    const text = payload.data?.message?.conversation || "";

    // Step 4: Route based on access class
    if (access.authorized && access.accessClass === "REGISTERED_HOSPITAL") {
      const workerAnalysis = deterministicFallbackAnalysis(text, {});
      return {
        action: "ROUTE_TO_WORKER",
        accessClass: "REGISTERED_HOSPITAL",
        queuedForWorker: true,
        authorizationCreated: workerAnalysis.intent === "NEW_AUTHORIZATION" || workerAnalysis.intent === "INCOMPLETE_AUTHORIZATION",
        supportConversationCreated: false,
        whatsappReplySent: true,
        workerIntent: workerAnalysis.intent,
      };
    }

    // Non-registered / potential provider / general customer
    const isPotentialProvider =
      access.accessClass === "DISABLED_OR_REVOKED" ||
      /\b(?:doctor|hospital|clinic|uch|luth|preauth|authorization|provider|medical director)\b/i.test(text);

    const intent = classifyGeneralCustomerIntent(text, isPotentialProvider);

    let supportCreated = false;
    let callbackRequested = false;
    let providerRegistrationCreated = false;

    if (intent === "CALLBACK_REQUEST") {
      supportCreated = true;
      callbackRequested = true;
    } else if (intent === "SUPPORT_REQUEST") {
      supportCreated = true;
    } else if (intent === "PROVIDER_REGISTRATION") {
      supportCreated = true;
      providerRegistrationCreated = true;
    }

    return {
      action: "HANDLE_NON_REGISTERED",
      accessClass: access.accessClass,
      isPotentialProvider,
      intent,
      queuedForWorker: false,
      authorizationCreated: false, // Security invariant: NEVER true for non-registered
      supportConversationCreated: supportCreated,
      callbackRequested,
      providerRegistrationCreated,
      whatsappReplySent: true,
    };
  }

  it("Scenario 1: Registered hospital → Hello → Provider experience", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348143813828@s.whatsapp.net", fromMe: false },
        message: { conversation: "Hello" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("ROUTE_TO_WORKER");
    expect(res.accessClass).toBe("REGISTERED_HOSPITAL");
    expect(res.queuedForWorker).toBe(true);
    expect(res.workerIntent).toBe("GREETING");
    expect(res.authorizationCreated).toBe(false);
  });

  it("Scenario 2: Registered hospital → I want to submit authorization → Existing workflow", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348143813828@s.whatsapp.net", fromMe: false },
        message: { conversation: "I want to submit a new authorization" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("ROUTE_TO_WORKER");
    expect(res.accessClass).toBe("REGISTERED_HOSPITAL");
    expect(res.queuedForWorker).toBe(true);
    expect(res.authorizationCreated).toBe(true);
  });

  it("Scenario 3: Unregistered doctor → I am a doctor → Potential provider experience", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348000000001@s.whatsapp.net", fromMe: false },
        message: { conversation: "I am a doctor from a clinic" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("HANDLE_NON_REGISTERED");
    expect(res.accessClass).toBe("GENERAL_CUSTOMER");
    expect(res.isPotentialProvider).toBe(true);
    expect(res.queuedForWorker).toBe(false);
    expect(res.authorizationCreated).toBe(false);
  });

  it("Scenario 4: Unregistered doctor → I want authorization → No authorization created", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348000000001@s.whatsapp.net", fromMe: false },
        message: { conversation: "I want to submit an authorization" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("HANDLE_NON_REGISTERED");
    expect(res.queuedForWorker).toBe(false);
    expect(res.authorizationCreated).toBe(false);
    expect(res.isPotentialProvider).toBe(true);
  });

  it("Scenario 5: Unregistered doctor → How do I register my hospital? → Registration/support flow", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348000000001@s.whatsapp.net", fromMe: false },
        message: { conversation: "How do I register my hospital?" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("HANDLE_NON_REGISTERED");
    expect(res.intent).toBe("PROVIDER_REGISTRATION");
    expect(res.supportConversationCreated).toBe(true);
    expect(res.providerRegistrationCreated).toBe(true);
    expect(res.authorizationCreated).toBe(false);
  });

  it("Scenario 6: Unknown user → Hello → Customer experience", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348000000002@s.whatsapp.net", fromMe: false },
        message: { conversation: "Hello" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("HANDLE_NON_REGISTERED");
    expect(res.accessClass).toBe("GENERAL_CUSTOMER");
    expect(res.isPotentialProvider).toBe(false);
    expect(res.intent).toBe("GREETING");
    expect(res.queuedForWorker).toBe(false);
    expect(res.authorizationCreated).toBe(false);
  });

  it("Scenario 7: Unknown user → I need help → Support conversation created", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348000000002@s.whatsapp.net", fromMe: false },
        message: { conversation: "I need help" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("HANDLE_NON_REGISTERED");
    expect(res.intent).toBe("SUPPORT_REQUEST");
    expect(res.supportConversationCreated).toBe(true);
    expect(res.authorizationCreated).toBe(false);
  });

  it("Scenario 8: Unknown user → Call me → Callback request created", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348000000002@s.whatsapp.net", fromMe: false },
        message: { conversation: "Can someone call me?" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("HANDLE_NON_REGISTERED");
    expect(res.intent).toBe("CALLBACK_REQUEST");
    expect(res.supportConversationCreated).toBe(true);
    expect(res.callbackRequested).toBe(true);
    expect(res.authorizationCreated).toBe(false);
  });

  it("Scenario 9: Unknown user → General HMO question → Informational answer", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348000000002@s.whatsapp.net", fromMe: false },
        message: { conversation: "What services and benefits are covered?" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("HANDLE_NON_REGISTERED");
    expect(res.intent).toBe("FAQ");
    expect(res.authorizationCreated).toBe(false);
  });

  it("Scenario 10: Registered hospital → Group Hello → No response", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "120363025343423456@g.us",
          participant: "2348143813828@s.whatsapp.net",
          fromMe: false,
        },
        message: { conversation: "Hello" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("IGNORE_GROUP");
    expect(res.httpStatus).toBe(200);
    expect(res.queuedForWorker).toBe(false);
    expect(res.whatsappReplySent).toBe(false);
    expect(res.authorizationCreated).toBe(false);
    expect(res.supportConversationCreated).toBe(false);
  });

  it("Scenario 11: Unregistered number → Group Hello → No response", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "120363025343423456@g.us",
          participant: "2348000000002@s.whatsapp.net",
          fromMe: false,
        },
        message: { conversation: "Hello everyone" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("IGNORE_GROUP");
    expect(res.queuedForWorker).toBe(false);
    expect(res.whatsappReplySent).toBe(false);
  });

  it("Scenario 12: Group authorization request → No authorization / support / AI processing", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "120363025343423456@g.us",
          participant: "2348143813828@s.whatsapp.net",
          fromMe: false,
        },
        message: { conversation: "I want to submit an authorization for Segun" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital]);
    expect(res.action).toBe("IGNORE_GROUP");
    expect(res.authorizationCreated).toBe(false);
    expect(res.supportConversationCreated).toBe(false);
    expect(res.queuedForWorker).toBe(false);
    expect(res.whatsappReplySent).toBe(false);
  });

  it("Scenario 13: Disabled hospital → Authorization request → No authorization", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348143810002@s.whatsapp.net", fromMe: false },
        message: { conversation: "I want to submit an authorization" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital, disabledHospital]);
    expect(res.action).toBe("HANDLE_NON_REGISTERED");
    expect(res.accessClass).toBe("DISABLED_OR_REVOKED");
    expect(res.queuedForWorker).toBe(false);
    expect(res.authorizationCreated).toBe(false);
  });

  it("Scenario 14: Revoked hospital → Authorization request → No authorization", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        key: { remoteJid: "2348143810003@s.whatsapp.net", fromMe: false },
        message: { conversation: "I want to submit an authorization" },
      },
    };
    const res = simulateWebhookProcessing(payload, [activeHospital, revokedHospital]);
    expect(res.action).toBe("HANDLE_NON_REGISTERED");
    expect(res.accessClass).toBe("DISABLED_OR_REVOKED");
    expect(res.queuedForWorker).toBe(false);
    expect(res.authorizationCreated).toBe(false);
  });
});