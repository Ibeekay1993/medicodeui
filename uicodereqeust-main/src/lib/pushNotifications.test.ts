import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import {
  notifyHospitalAuthorizationDecision,
  notifyPendingAuthorizationRequest,
} from "./pushNotifications";

describe("push notification dispatch", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: { success: true, sent_count: 1, failed_count: 0 },
      error: null,
    });
  });

  it("dispatches a pending request push to approver roles", async () => {
    await notifyPendingAuthorizationRequest({
      requestId: "request-1",
      hospitalName: "Test Hospital",
      source: "whatsapp",
    });

    expect(invoke).toHaveBeenCalledWith("send-push-notification", {
      body: expect.objectContaining({
        authorization_id: "request-1",
        target_roles: ["admin", "utilization_manager", "utilization_manager_lead"],
        title: "New Pending Authorization Request",
      }),
    });
  });

  it("dispatches a decision push only to the request hospital", async () => {
    await notifyHospitalAuthorizationDecision({
      hospitalId: "hospital-1",
      requestId: "request-1",
      decision: "approved",
    });

    expect(invoke).toHaveBeenCalledWith("send-push-notification", {
      body: expect.objectContaining({
        authorization_id: "request-1",
        target_hospital_id: "hospital-1",
      }),
    });
  });
});
