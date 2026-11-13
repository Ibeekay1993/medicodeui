import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminControlsCard from "./AdminControlsCard";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ role: "admin" }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { value: { enforced: false } }, error: null }),
          maybeSingle: async () => ({
            data: { value: { emails: ["reports@example.com"], enabled: true } },
            error: null,
          }),
        }),
      }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

describe("AdminControlsCard daily report recipients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds a separate editable address box and removes it independently", async () => {
    render(<AdminControlsCard user={{ id: "admin-user" }} />);

    expect(await screen.findByRole("textbox", { name: "Report recipient 1" })).toHaveValue("reports@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Add report recipient" }));
    expect(screen.getByRole("textbox", { name: "Report recipient 2" })).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Remove report recipient 2" }));
    expect(screen.queryByRole("textbox", { name: "Report recipient 2" })).not.toBeInTheDocument();
  });
});
