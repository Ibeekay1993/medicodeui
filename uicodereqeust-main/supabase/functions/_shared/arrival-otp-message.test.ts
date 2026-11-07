import { describe, expect, it } from "vitest";
import { buildArrivalOtpPayload, normalizeEvolutionPhoneNumber } from "./arrival-otp-message.ts";

describe("arrival OTP WhatsApp message", () => {
  it("normalizes Nigerian phone numbers to Evolution's digits-only format", () => {
    expect(normalizeEvolutionPhoneNumber("080 1234 5678")).toBe("2348012345678");
    expect(normalizeEvolutionPhoneNumber("8012345678")).toBe("2348012345678");
    expect(normalizeEvolutionPhoneNumber("+234 801 234 5678")).toBe("2348012345678");
    expect(normalizeEvolutionPhoneNumber("123")).toBeNull();
  });

  it("preserves the patient PIN, diagnosis, approved services and rejection labels", () => {
    expect(buildArrivalOtpPayload({
      phone_number: "08012345678",
      otp_code: "AB234C",
      patient_name: "Ada Patient",
      hospital_name: "Ronsberger Clinic",
      diagnosis: "HTN",
      items: [
        { name: "Consultation", quantity: 1 },
        { name: "Lab test", quantity: 2, declined: true },
      ],
    })).toEqual({
      number: "2348012345678",
      text: "Hello Ada Patient!\n\nA new authorization request has been approved for you at Ronsberger Clinic.\n*Diagnosis:* HTN\n\n*Requested Services:*\n✅ 1x Consultation\n~2x Lab test~ (Rejected)\n\nYour Arrival PIN is: *AB234C*\n\nThank you,\n*Ronsberger HMO*",
    });
  });

  it("rejects missing recipients or PINs and bounds generated message size", () => {
    expect(buildArrivalOtpPayload({ phone_number: "08012345678" })).toBeNull();
    expect(buildArrivalOtpPayload({ phone_number: "123", otp_code: "AB234C" })).toBeNull();
    expect(buildArrivalOtpPayload({
      phone_number: "08012345678",
      otp_code: "AB234C",
      items: Array.from({ length: 50 }, () => ({ name: "x".repeat(120) })),
    })).toBeNull();
  });
});
