import { describe, expect, it, vi } from "vitest";
import {
  analyzeInboundBlock,
  hasUncertainAuthorizationDetails,
  shouldHoldAuthorizationForClarification,
} from "./analysis-mode.ts";
import {
  AI_CAPABLE_WORKER_MODE,
  DETERMINISTIC_ONLY_WORKER_MODE,
} from "../_shared/whatsapp-worker-mode.ts";

describe("WhatsApp worker analysis mode", () => {
  it("uses deterministic labeled fields without invoking an AI provider", async () => {
    const analyzeWithProviders = vi.fn(async () => {
      throw new Error("provider must not be called in deterministic-only mode");
    });
    const text = [
      "Full Name: Jane Doe",
      "NHIA No: 1234567-1",
      "Phone no: +2348012345678",
      "Diagnosis: Malaria",
      "Investigations: FBC",
      "Drugs: Artemether-Lumefantrine 20/120mg x 24 tablets",
    ].join("\n");

    const result = await analyzeInboundBlock(
      DETERMINISTIC_ONLY_WORKER_MODE,
      text,
      null,
      analyzeWithProviders,
    );

    expect(analyzeWithProviders).not.toHaveBeenCalled();
    expect(result.intent).toBe("NEW_AUTHORIZATION");
    expect(result).toMatchObject({
      patientName: "Jane Doe",
      policyNumber: "1234567-1",
      patientPhone: "+2348012345678",
      diagnosis: "Malaria",
      investigation: "FBC",
      treatment: "Artemether-Lumefantrine 20/120mg x 24 tablets",
    });
  });

  it("does not infer clinical entities from ambiguous natural-language text", async () => {
    const analyzeWithProviders = vi.fn(async () => ({
      intent: "NEW_AUTHORIZATION",
      patientName: "Guessed Patient",
      diagnosis: "Guessed diagnosis",
      treatment: "Guessed treatment",
      urgencyLevel: 3,
      missingInfo: [],
      isCancellationIntent: false,
    }));

    const result = await analyzeInboundBlock(
      DETERMINISTIC_ONLY_WORKER_MODE,
      "Please start an authorization for Jane; maybe malaria or typhoid and perhaps a scan.",
      null,
      analyzeWithProviders,
    );

    expect(analyzeWithProviders).not.toHaveBeenCalled();
    expect(result.patientName).toBeUndefined();
    expect(result.policyNumber).toBeUndefined();
    expect(result.diagnosis).toBeUndefined();
    expect(result.treatment).toBeUndefined();
    expect(shouldHoldAuthorizationForClarification(
      DETERMINISTIC_ONLY_WORKER_MODE,
      result,
    )).toBe(true);
    expect(shouldHoldAuthorizationForClarification(
      AI_CAPABLE_WORKER_MODE,
      result,
    )).toBe(false);
    expect(result.procedure).toBeUndefined();
    expect(result.investigation).toBeUndefined();
  });

  it("holds labeled clinical alternatives for clarification without extracting them", async () => {
    const analyzeWithProviders = vi.fn();
    const text = [
      "Full Name: Jane Doe",
      "NHIA No: 1234567-1",
      "Phone: +2348012345678",
      "Diagnosis: Malaria or typhoid?",
      "Drugs: Maybe artemether-lumefantrine",
    ].join("\n");

    const result = await analyzeInboundBlock(
      DETERMINISTIC_ONLY_WORKER_MODE,
      text,
      null,
      analyzeWithProviders,
    );

    expect(analyzeWithProviders).not.toHaveBeenCalled();
    expect(result.requiresClinicalClarification).toBe(true);
    expect(result.patientName).toBeUndefined();
    expect(result.diagnosis).toBeUndefined();
    expect(result.treatment).toBeUndefined();
  });

  it("detects uncertainty and alternatives only in authorization-shaped text", () => {
    expect(hasUncertainAuthorizationDetails("Authorization for Jane: maybe malaria"))
      .toBe(true);
    expect(hasUncertainAuthorizationDetails("Diagnosis: malaria or typhoid"))
      .toBe(true);
    expect(hasUncertainAuthorizationDetails("Diagnosis: malaria/typhoid"))
      .toBe(true);
    expect(hasUncertainAuthorizationDetails("The hospital or clinic is open."))
      .toBe(false);
  });

  it("preserves the existing provider route in AI-capable mode", async () => {
    const providerResult = {
      intent: "NEW_AUTHORIZATION",
      urgencyLevel: 3,
      missingInfo: [],
      isCancellationIntent: false,
      patientName: "Jane Doe",
    };
    const analyzeWithProviders = vi.fn(async () => providerResult);

    const result = await analyzeInboundBlock(
      AI_CAPABLE_WORKER_MODE,
      "Jane Doe requests authorization",
      null,
      analyzeWithProviders,
    );

    expect(analyzeWithProviders).toHaveBeenCalledOnce();
    expect(result).toBe(providerResult);
  });
});
