import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import CompleteProvisionedAccount from "@/pages/CompleteProvisionedAccount";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  refreshProfile: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { access_token: "test-session" },
    user: { email: "staff@example.com", user_metadata: { full_name: "Test User" } },
    role: "utilization_manager",
    fullName: "Test User",
    hospitalId: null,
    loading: false,
    accountSetupRequired: true,
    refreshProfile: mocks.refreshProfile,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

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
  mocks.refreshProfile.mockReset();
  mocks.toast.mockReset();
});

describe("CompleteProvisionedAccount", () => {
  it("shows the safe Edge Function response instead of the generic SDK error", async () => {
    const serverMessage = "Account setup is temporarily unavailable. Please retry.";
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        context: new Response(JSON.stringify({ error: true, message: serverMessage }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      }),
    });

    render(
      <MemoryRouter>
        <CompleteProvisionedAccount />
      </MemoryRouter>,
    );

    const consentBoxes = screen.getAllByRole("checkbox");
    fireEvent.click(consentBoxes[0]);
    fireEvent.click(consentBoxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(serverMessage);
    expect(screen.queryByText("Edge Function returned a non-2xx status code")).not.toBeInTheDocument();
  });
});
