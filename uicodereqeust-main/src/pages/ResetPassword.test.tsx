import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import ResetPassword from "@/pages/ResetPassword";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  setSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  rpc: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      getUser: mocks.getUser,
      setSession: mocks.setSession,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      verifyOtp: mocks.verifyOtp,
    },
    rpc: mocks.rpc,
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

let currentUserId = "other-signed-in-user";
const recoveryAccessToken = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;

beforeEach(() => {
  currentUserId = "other-signed-in-user";
  mocks.getSession.mockReset().mockImplementation(async () => ({
    data: { session: { user: { id: currentUserId }, access_token: "current-token", refresh_token: "current-refresh" } },
  }));
  mocks.getUser.mockReset().mockImplementation(async (token?: string) => ({
    data: { user: { id: token ? "reset-link-user" : currentUserId, email: "staff@example.com" } },
    error: null,
  }));
  mocks.setSession.mockReset().mockImplementation(async () => {
    currentUserId = "reset-link-user";
    return { error: null };
  });
  mocks.updateUser.mockReset().mockResolvedValue({ error: null });
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  mocks.resetPasswordForEmail.mockReset();
  mocks.verifyOtp.mockReset();
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.toast.mockReset();
  window.history.replaceState(
    null,
    "",
    `/reset-password#access_token=${encodeURIComponent(recoveryAccessToken)}&refresh_token=reset-link-refresh&type=recovery`,
  );
});

describe("ResetPassword", () => {
  it("switches to the recovery-link account before changing its password", async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ResetPassword />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("New Password"), { target: { value: "SecurePass123!" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "SecurePass123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save New Password" }));

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledOnce());
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: recoveryAccessToken,
      refresh_token: "reset-link-refresh",
    });
  });

  it("rejects an incomplete recovery URL instead of using the current browser session", async () => {
    window.history.replaceState(null, "", `/reset-password#access_token=${encodeURIComponent(recoveryAccessToken)}&type=recovery`);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ResetPassword />
      </MemoryRouter>,
    );

    expect(await screen.findByText("This password reset link is incomplete. Request a new password reset link below.")).toBeInTheDocument();
    expect(screen.queryByLabelText("New Password")).not.toBeInTheDocument();
  });
});
