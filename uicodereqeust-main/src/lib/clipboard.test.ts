import { describe, expect, it, vi } from "vitest";
import { writeClipboardText } from "./clipboard";

describe("writeClipboardText", () => {
  it("waits for a successful clipboard write", async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    await expect(writeClipboardText("AUTH-123", clipboard)).resolves.toBeUndefined();
    expect(clipboard.writeText).toHaveBeenCalledOnce();
    expect(clipboard.writeText).toHaveBeenCalledWith("AUTH-123");
  });

  it("propagates clipboard write failures", async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error("Permission denied")) };
    await expect(writeClipboardText("123456", clipboard)).rejects.toThrow("Permission denied");
  });

  it("reports when clipboard access is unavailable", async () => {
    await expect(writeClipboardText("123456", null)).rejects.toThrow("Clipboard access is unavailable");
  });
});
