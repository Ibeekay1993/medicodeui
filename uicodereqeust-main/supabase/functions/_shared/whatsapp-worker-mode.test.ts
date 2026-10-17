import { describe, expect, it } from "vitest";
import {
  AI_CAPABLE_WORKER_MODE,
  DETERMINISTIC_ONLY_WORKER_MODE,
  canReusePendingData,
  getClinicalReviewNote,
  resolveWorkerProcessingMode,
  shouldAutoMatchTariffItems,
} from "./whatsapp-worker-mode.ts";

describe("WhatsApp worker migration mode", () => {
  it("defaults to the existing AI-capable behavior unless the exact mode is selected", () => {
    expect(resolveWorkerProcessingMode(undefined)).toBe(AI_CAPABLE_WORKER_MODE);
    expect(resolveWorkerProcessingMode("unknown")).toBe(AI_CAPABLE_WORKER_MODE);
    expect(resolveWorkerProcessingMode(DETERMINISTIC_ONLY_WORKER_MODE)).toBe(
      DETERMINISTIC_ONLY_WORKER_MODE,
    );
  });

  it("does not reuse old AI-derived drafts in deterministic-only mode", () => {
    expect(canReusePendingData(DETERMINISTIC_ONLY_WORKER_MODE, undefined)).toBe(false);
    expect(canReusePendingData(DETERMINISTIC_ONLY_WORKER_MODE, AI_CAPABLE_WORKER_MODE)).toBe(false);
    expect(canReusePendingData(DETERMINISTIC_ONLY_WORKER_MODE, DETERMINISTIC_ONLY_WORKER_MODE)).toBe(true);
    expect(canReusePendingData(AI_CAPABLE_WORKER_MODE, undefined)).toBe(true);
  });

  it("skips tariff auto-matching only for deterministic WhatsApp submissions", () => {
    expect(shouldAutoMatchTariffItems("whatsapp", DETERMINISTIC_ONLY_WORKER_MODE)).toBe(false);
    expect(shouldAutoMatchTariffItems("whatsapp", AI_CAPABLE_WORKER_MODE)).toBe(true);
    expect(shouldAutoMatchTariffItems("dashboard", DETERMINISTIC_ONLY_WORKER_MODE)).toBe(true);
  });

  it("adds a human-readable clinical review note only in deterministic-only mode", () => {
    expect(getClinicalReviewNote(DETERMINISTIC_ONLY_WORKER_MODE)).toContain(
      "manual confirmation",
    );
    expect(getClinicalReviewNote(AI_CAPABLE_WORKER_MODE)).toBeNull();
  });
});
