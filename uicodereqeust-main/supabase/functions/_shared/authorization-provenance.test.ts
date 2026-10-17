import { describe, expect, it } from "vitest";
import {
  deriveAuthorizationProvenance,
  isSameParserSubmissionReplay,
} from "./authorization-provenance.ts";

describe("authorization submission provenance", () => {
  it("derives dashboard parser provenance instead of trusting a caller source", () => {
    expect(deriveAuthorizationProvenance(
      { kind: "user", userId: "staff-1", roles: ["nurse"] },
      "manual",
    )).toEqual({ source: "whatsapp_parser", submittedBy: "staff-1" });
  });

  it("does not allow a browser caller to claim webhook provenance", () => {
    expect(deriveAuthorizationProvenance(
      { kind: "user", userId: "staff-2", roles: ["admin"] },
      "whatsapp",
    )).toEqual({ source: "whatsapp_parser", submittedBy: "staff-2" });
  });

  it("derives parser provenance when the caller omits a source", () => {
    expect(deriveAuthorizationProvenance(
      { kind: "user", userId: "staff-3", roles: ["nurse"] },
      undefined,
    )).toEqual({ source: "whatsapp_parser", submittedBy: "staff-3" });
  });

  it("does not allow a browser caller to claim portal or manual provenance", () => {
    expect(deriveAuthorizationProvenance(
      { kind: "user", userId: "staff-4", roles: ["nurse"] },
      "hospital_portal",
    )).toEqual({ source: "whatsapp_parser", submittedBy: "staff-4" });
    expect(deriveAuthorizationProvenance(
      { kind: "user", userId: "staff-4", roles: ["nurse"] },
      "manual",
    )).toEqual({ source: "whatsapp_parser", submittedBy: "staff-4" });
  });

  it("rejects browser callers without an authorized clinical staff role", () => {
    expect(() => deriveAuthorizationProvenance(
      { kind: "user", userId: "hospital-1", roles: ["hospital"] },
      "whatsapp_parser",
    )).toThrow("staff_authorization_required");
  });

  it("allows the utilization roles that can access the dashboard parser", () => {
    expect(deriveAuthorizationProvenance(
      { kind: "user", userId: "utilization-manager-1", roles: ["utilization_manager"] },
      "manual",
    )).toEqual({ source: "whatsapp_parser", submittedBy: "utilization-manager-1" });
    expect(deriveAuthorizationProvenance(
      { kind: "user", userId: "utilization-lead-1", roles: ["utilization_manager_lead"] },
      "hospital_portal",
    )).toEqual({ source: "whatsapp_parser", submittedBy: "utilization-lead-1" });
  });

  it("rejects a missing authenticated user", () => {
    expect(() => deriveAuthorizationProvenance(
      { kind: "user", userId: "", roles: ["nurse"] },
      "whatsapp_parser",
    )).toThrow("staff_authorization_required");
  });

  it("preserves server-authenticated internal source selection", () => {
    expect(deriveAuthorizationProvenance({ kind: "internal" }, "whatsapp"))
      .toEqual({ source: "whatsapp", submittedBy: null });
  });

  it("accepts an exact retry from the same parser user", () => {
    const payload = {
      request_id: "REQ-stable",
      source: "whatsapp_parser",
      submitted_by: "staff-1",
      hospital_id: "hospital-1",
      patient_name: "Test Patient",
      policy_number: "POLICY-1",
      beneficiary_number: null,
      diagnosis: "Confirmed diagnosis",
      treatment: "Confirmed care",
      patient_phone: "2348000000000",
      referred_hospital_id: null,
      whatsapp_raw_message: "Request text",
      urgency: "routine",
      clinical_notes: null,
      approved_items: [{ code: "NHIA-1", name: "Service" }],
    };
    const existing = {
      ...payload,
      approved_items: [{ name: "Service", code: "NHIA-1" }],
    };

    expect(isSameParserSubmissionReplay(existing, payload, "staff-1")).toBe(true);
  });

  it("rejects a reused parser key for a different owner or clinical payload", () => {
    const existing = {
      request_id: "REQ-stable",
      source: "whatsapp_parser",
      submitted_by: "staff-1",
      patient_name: "Test Patient",
      approved_items: [],
    };
    expect(isSameParserSubmissionReplay(existing, {
      ...existing,
      patient_name: "Different Patient",
    }, "staff-1")).toBe(false);
    expect(isSameParserSubmissionReplay({
      ...existing,
      approved_items: [{ code: "NHIA-1" }],
    }, {
      ...existing,
      approved_items: [{ code: "NHIA-2" }],
    }, "staff-1")).toBe(false);
    expect(isSameParserSubmissionReplay(existing, existing, "staff-2")).toBe(false);
  });
});
