import { describe, expect, it } from "vitest";
import {
  hasValidItemQuantity,
  hasValidItemUnitPrice,
  getApprovalAmountIssue,
  itemTotal,
  normalizeBeneficiaryNumber,
  matchesBeneficiaryHistoryRecord,
  normalizePatientNameForMatch,
  recordMatchesPolicy,
  resolveBeneficiaryIdentityMatch,
} from "./clinicalUtils";

describe("approval amount calculations", () => {
  it("calculates a line total from unit price and a confirmed quantity", () => {
    expect(itemTotal({ code: "D1", name: "Drug", category: "drug", price: 70, unitPrice: 70, quantity: 30 })).toBe(2100);
  });

  it("does not silently accept missing, zero, or invalid quantities", () => {
    expect(hasValidItemQuantity({ code: "D1", name: "Drug", category: "drug", price: 70 })).toBe(false);
    expect(hasValidItemQuantity({ code: "D1", name: "Drug", category: "drug", price: 70, quantity: 0 })).toBe(false);
    expect(itemTotal({ code: "D1", name: "Drug", category: "drug", price: 70, unitPrice: 70, quantity: 0 })).toBe(0);
  });

  it("distinguishes a present zero tariff from a missing tariff", () => {
    expect(hasValidItemUnitPrice({ code: "S1", name: "Service", category: "procedure", price: 0, unitPrice: 0, quantity: 1 })).toBe(true);
    expect(hasValidItemUnitPrice({ code: "S1", name: "Service", category: "procedure", price: Number.NaN, quantity: 1 })).toBe(false);
  });

  it("uses the displayed quantity, requires an item, and reconciles the tariff total", () => {
    const confirmed = [{ code: "D1", name: "Drug", category: "drug", price: 2100, unitPrice: 70, quantity: 30 }];
    expect(getApprovalAmountIssue(confirmed, 2100)).toBeNull();
    expect(getApprovalAmountIssue([{ ...confirmed[0], quantityNeedsReview: true }], 2100)).toBeNull();
    expect(getApprovalAmountIssue([], 0)).toContain("at least one treatment item");
    expect(getApprovalAmountIssue(confirmed, 70)).toContain("does not match");
  });
});

describe("beneficiary identity matching", () => {
  it("normalizes order, titles, punctuation, spacing, and diacritics without dropping name components", () => {
    expect(normalizePatientNameForMatch("Sample Person")).toBe(
      normalizePatientNameForMatch("Person Sample"),
    );
    expect(normalizePatientNameForMatch("Mr. Sample Person")).toBe(
      normalizePatientNameForMatch("Sample Person"),
    );
    expect(normalizePatientNameForMatch("Prof.   Person, Sample")).toBe(
      normalizePatientNameForMatch("Sample Person"),
    );
    expect(normalizePatientNameForMatch("Sample Marie Person")).toBe(
      normalizePatientNameForMatch("Person Marie Sample"),
    );
    expect(normalizePatientNameForMatch("Sámple Person")).toBe(
      normalizePatientNameForMatch("Person Sample"),
    );
    expect(normalizePatientNameForMatch("Sample Person")).not.toBe(
      normalizePatientNameForMatch("Sample Marie Person"),
    );
    expect(normalizePatientNameForMatch("Sample Person")).not.toBe(
      normalizePatientNameForMatch("Sample Persons"),
    );
  });

  it("uses an exact beneficiary number with compatible normalized name evidence", () => {
    const rows = [
      { id: "principal", full_name: "Sample Person", beneficiary_number: "1001001-1" },
      { id: "dependent", full_name: "Sample Marie Person", beneficiary_number: "1001001-2" },
    ];

    expect(resolveBeneficiaryIdentityMatch(rows, "Mr. Person Sample", "1001001-01")).toEqual({
      status: "exact",
      member: rows[0],
    });
    expect(resolveBeneficiaryIdentityMatch(rows, "Sample Person", "1001001-2")).toEqual({
      status: "conflict",
      member: null,
    });
    expect(resolveBeneficiaryIdentityMatch(rows, "Sample Person", "1001001-9")).toEqual({
      status: "conflict",
      member: null,
    });
  });

  it("requires a unique complete name match when no member number is available", () => {
    const rows = [
      { id: "one", full_name: "Sample Person", beneficiary_number: "1001001-1" },
      { id: "two", full_name: "Sample Marie Person", beneficiary_number: "1001001-2" },
    ];
    expect(resolveBeneficiaryIdentityMatch(rows, "Person Sample").status).toBe("exact");
    expect(resolveBeneficiaryIdentityMatch(rows, "Sample Persons").status).toBe("none");
    expect(resolveBeneficiaryIdentityMatch([
      { id: "one", full_name: "Sample Person" },
      { id: "two", full_name: "Person Sample" },
    ], "Sample Person").status).toBe("ambiguous");
  });

  it("normalizes padded dependant suffixes and compares policy families without substring collisions", () => {
    expect(normalizeBeneficiaryNumber("1001001-02")).toBe("1001001-2");
    expect(recordMatchesPolicy({ policy_number: "1001001-2" }, "1001001")).toBe(true);
    expect(recordMatchesPolicy({ policy_number: "91001001-2" }, "1001001")).toBe(false);
    expect(recordMatchesPolicy({ policy_number: "1001001" }, "1001001-2")).toBe(true);
  });

  it("shows reversed-name legacy history only when the verified policy roster identifies one member", () => {
    const family = [
      { id: "one", full_name: "Sample Person", beneficiary_number: "1001001-1" },
      { id: "two", full_name: "Sample Marie Person", beneficiary_number: "1001001-2" },
    ];
    const identity = {
      patientName: "Mr. Person Sample",
      policyNumber: "1001001",
      beneficiaryNumber: "1001001-1",
    };

    expect(matchesBeneficiaryHistoryRecord({
      policy_number: "1001001",
      patient_name: "Sample, Person",
    }, identity, family, false)).toBe(true);
    expect(matchesBeneficiaryHistoryRecord({
      policy_number: "1001001",
      beneficiary_number: "1001001-2",
      patient_name: "Sample Person",
    }, identity, family, false)).toBe(false);
    expect(matchesBeneficiaryHistoryRecord({
      policy_number: "91001001-1",
      patient_name: "Sample Person",
    }, identity, family, true)).toBe(false);
    expect(matchesBeneficiaryHistoryRecord({
      policy_number: "1001001",
      patient_name: "Person Sample",
    }, identity, [family[0], { ...family[0], id: "duplicate" }], false)).toBe(false);
  });
});
