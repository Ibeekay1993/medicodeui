import { describe, expect, it } from "vitest";
import { getSupabaseFunctionResponseMessage } from "@/lib/supabaseFunctionErrors";

describe("getSupabaseFunctionResponseMessage", () => {
  it("uses the safe message returned by a failed Edge Function instead of the SDK status message", async () => {
    const error = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response(JSON.stringify({ message: "Invitation verification is temporarily unavailable. Please retry." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    });

    await expect(getSupabaseFunctionResponseMessage(null, error, "Setup failed.")).resolves.toBe(
      "Invitation verification is temporarily unavailable. Please retry.",
    );
  });

  it("uses an application message returned with a successful HTTP response", async () => {
    await expect(
      getSupabaseFunctionResponseMessage({ message: "This invitation is no longer active." }, null, "Setup failed."),
    ).resolves.toBe("This invitation is no longer active.");
  });

  it("uses the fallback when neither response contains an application message", async () => {
    await expect(getSupabaseFunctionResponseMessage(null, new Error("Edge Function returned a non-2xx status code"), "Setup failed.")).resolves.toBe(
      "Setup failed.",
    );
  });
});
