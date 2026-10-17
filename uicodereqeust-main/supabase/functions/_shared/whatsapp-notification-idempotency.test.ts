import { describe, expect, it } from "vitest";
import { getDecisionNotificationIdempotency } from "./whatsapp-notification-idempotency.ts";

describe("WhatsApp decision notification idempotency", () => {
  it("reuses a stable outbound operation identity for each authorization decision recipient", () => {
    const patientKey = getDecisionNotificationIdempotency(
      "authorization-1",
      "2026-10-09T10:00:00.000Z",
      "patient",
    );
    const retryKey = getDecisionNotificationIdempotency(
      "authorization-1",
      "2026-10-09T10:00:00.000Z",
      "patient",
    );
    const hospitalKey = getDecisionNotificationIdempotency(
      "authorization-1",
      "2026-10-09T10:00:00.000Z",
      "hospital",
    );

    expect(retryKey).toEqual(patientKey);
    expect(patientKey).toEqual({
      messageId: "decision-notification:authorization-1:2026-10-09T10:00:00.000Z:patient",
      operationKey: "authorization_decision_patient",
    });
    expect(hospitalKey.messageId).not.toBe(patientKey.messageId);
    expect(hospitalKey.operationKey).not.toBe(patientKey.operationKey);
  });
});
