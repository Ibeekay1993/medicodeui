import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import {
  notifyHospitalAuthorizationDecision,
  notifyPendingAuthorizationRequest,
  sendPushTestNotification,
  subscribeToPushNotifications,
} from "./pushNotifications";

describe("paused push notifications", () => {
  beforeEach(() => invoke.mockReset());

  it("does not ask the browser for permission or create a subscription", async () => {
    await expect(subscribeToPushNotifications("staff-1")).resolves.toEqual({
      success: false,
      error: "Push notifications are currently paused.",
    });
  });

  it("does not send request, decision, or test pushes to Supabase", async () => {
    await notifyPendingAuthorizationRequest({ requestId: "request-1", hospitalName: "Test Hospital" });
    await notifyHospitalAuthorizationDecision({
      hospitalId: "hospital-1",
      requestId: "request-1",
      decision: "approved",
    });
    await expect(sendPushTestNotification("staff-1")).resolves.toEqual({
      success: false,
      sentCount: 0,
      error: "Push notifications are currently paused.",
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});
