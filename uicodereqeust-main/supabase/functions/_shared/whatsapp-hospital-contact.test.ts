import { describe, expect, it } from "vitest";
import { parseWhatsAppHospitalContactResolution } from "./whatsapp-hospital-contact.ts";

describe("WhatsApp hospital contact RPC response", () => {
  it("accepts one active hospital with a valid UUID", () => {
    expect(
      parseWhatsAppHospitalContactResolution({
        authorized: true,
        hospital_id: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({
      authorized: true,
      hospitalId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("keeps an ambiguous phone denied", () => {
    expect(
      parseWhatsAppHospitalContactResolution({
        authorized: false,
        reason: "ambiguous_sender",
      }),
    ).toEqual({ authorized: false, reason: "ambiguous_sender" });
  });

  it("classifies RPC errors and malformed responses as retryable lookup failures", () => {
    expect(
      parseWhatsAppHospitalContactResolution(null, { code: "57014" }),
    ).toEqual({ authorized: false, reason: "identity_lookup_failed" });
    expect(
      parseWhatsAppHospitalContactResolution({ authorized: true, hospital_id: "bad-id" }),
    ).toEqual({ authorized: false, reason: "identity_lookup_failed" });
  });

  it("does not trust an unknown denial reason supplied by the database response", () => {
    expect(
      parseWhatsAppHospitalContactResolution({
        authorized: false,
        reason: "arbitrary database detail",
      }),
    ).toEqual({ authorized: false, reason: "unregistered_sender" });
  });
});
