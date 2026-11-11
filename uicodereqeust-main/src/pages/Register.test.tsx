import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import Register from "@/pages/Register";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  verifyOtp: vi.fn(),
  checkInviteStatus: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: { getUser: mocks.getUser, getSession: mocks.getSession, verifyOtp: mocks.verifyOtp },
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: mocks.checkInviteStatus }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

function CurrentLocation() {
  const { pathname, search } = useLocation();
  return <output aria-label="Current route">{pathname}{search}</output>;
}

beforeEach(() => {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  mocks.invoke.mockReset();
  mocks.getUser.mockReset();
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  mocks.verifyOtp.mockReset();
  mocks.checkInviteStatus.mockReset();
  mocks.toast.mockReset();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/register?invitation=Abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG");
});

describe("Register invitation routing", () => {
  it("takes a user with an already-completed invitation to sign-in and prefills only email", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: { success: true, already_completed: true, email: "staff+team@example.com" },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/register"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Register />
        <CurrentLocation />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Current route")).toHaveTextContent(
        "/login?email=staff%2Bteam%40example.com",
      );
    });

    expect(sessionStorage.getItem("pending_custom_invitation")).toBeNull();
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it("takes a user with an already-completed legacy invitation to sign-in", async () => {
    const tokenPayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const accessToken = `header.${tokenPayload}.signature`;
    window.history.replaceState(null, "", `/register#access_token=${encodeURIComponent(accessToken)}&refresh_token=legacy-refresh&type=invite`);
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: "completed-user", email: "staff@example.com", user_metadata: {} } },
      error: null,
    });
    mocks.checkInviteStatus.mockResolvedValueOnce({
      data: [{ role: "utilization_manager", invite_status: "completed", onboarding_completed: true }],
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/register"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Register />
        <CurrentLocation />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Current route")).toHaveTextContent("/login?email=staff%40example.com");
    });
    expect(mocks.checkInviteStatus).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledOnce();
  });
});
