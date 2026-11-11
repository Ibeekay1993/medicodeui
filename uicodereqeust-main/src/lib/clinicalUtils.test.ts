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

  it("blocks provisional quantities, missing treatment lines, and totals that do not reconcile", () => {
    const confirmed = [{ code: "D1", name: "Drug", category: "drug", price: 2100, unitPrice: 70, quantity: 30 }];
    expect(getApprovalAmountIssue(confirmed, 2100)).toBeNull();
    expect(getApprovalAmountIssue([{ ...confirmed[0], quantityNeedsReview: true }], 70)).toContain("confirm the quantity");
    expect(getApprovalAmountIssue([], 0)).toContain("at least one treatment item");
    expect(getApprovalAmountIssue(confirmed, 70)).toContain("does not match");
  });
});

describe("beneficiary identity matching", () => {
  it("normalizes order, titles, punctuation, spacing, and diacritics without dropping name components", () => {
    expect(normalizePatientNameForMatch("Afolayan Kayode")).toBe(
      normalizePatientNameForMatch("Kayode Afolayan"),
    );
    expect(normalizePatientNameForMatch("Mr. Afolayan Kayode")).toBe(
      normalizePatientNameForMatch("Afolayan Kayode"),
    );
    expect(normalizePatientNameForMatch("Prof.   Kayode, Afolayan")).toBe(
      normalizePatientNameForMatch("Afolayan Kayode"),
    );
    expect(normalizePatientNameForMatch("Afolayan Marie Kayode")).toBe(
      normalizePatientNameForMatch("Kayode Marie Afolayan"),
    );
    expect(normalizePatientNameForMatch("Afoláyan Kayode")).toBe(
      normalizePatientNameForMatch("Kayode Afolayan"),
    );
    expect(normalizePatientNameForMatch("Afolayan Kayode")).not.toBe(
      normalizePatientNameForMatch("Afolayan Marie Kayode"),
    );
    expect(normalizePatientNameForMatch("Afolayan Kayode")).not.toBe(
      normalizePatientNameForMatch("Afolayan Kayodeh"),
    );
  });

  it("uses an exact beneficiary number with compatible normalized name evidence", () => {
    const rows = [
      { id: "principal", full_name: "Afolayan Kayode", beneficiary_number: "1639554-1" },
      { id: "dependent", full_name: "Afolayan Marie Kayode", beneficiary_number: "1639554-2" },
    ];

    expect(resolveBeneficiaryIdentityMatch(rows, "Mr. Kayode Afolayan", "1639554-01")).toEqual({
      status: "exact",
      member: rows[0],
    });
    expect(resolveBeneficiaryIdentityMatch(rows, "Afolayan Kayode", "1639554-2")).toEqual({
      status: "conflict",
      member: null,
    });
    expect(resolveBeneficiaryIdentityMatch(rows, "Afolayan Kayode", "1639554-9")).toEqual({
      status: "conflict",
      member: null,
    });
  });

  it("requires a unique complete name match when no member number is available", () => {
    const rows = [
      { id: "one", full_name: "Afolayan Kayode", beneficiary_number: "1639554-1" },
      { id: "two", full_name: "Afolayan Marie Kayode", beneficiary_number: "1639554-2" },
    ];
    expect(resolveBeneficiaryIdentityMatch(rows, "Kayode Afolayan").status).toBe("exact");
    expect(resolveBeneficiaryIdentityMatch(rows, "Afolayan Kayodeh").status).toBe("none");
    expect(resolveBeneficiaryIdentityMatch([
      { id: "one", full_name: "Afolayan Kayode" },
      { id: "two", full_name: "Kayode Afolayan" },
    ], "Afolayan Kayode").status).toBe("ambiguous");
  });

  it("normalizes padded dependant suffixes and compares policy families without substring collisions", () => {
    expect(normalizeBeneficiaryNumber("1639554-02")).toBe("1639554-2");
    expect(recordMatchesPolicy({ policy_number: "1639554-2" }, "1639554")).toBe(true);
    expect(recordMatchesPolicy({ policy_number: "11639554-2" }, "1639554")).toBe(false);
    expect(recordMatchesPolicy({ policy_number: "1639554" }, "1639554-2")).toBe(true);
  });

  it("shows reversed-name legacy history only when the verified policy roster identifies one member", () => {
    const family = [
      { id: "one", full_name: "Afolayan Kayode", beneficiary_number: "1639554-1" },
      { id: "two", full_name: "Afolayan Marie Kayode", beneficiary_number: "1639554-2" },
    ];
    const identity = {
      patientName: "Mr. Kayode Afolayan",
      policyNumber: "1639554",
      beneficiaryNumber: "1639554-1",
    };

    expect(matchesBeneficiaryHistoryRecord({
      policy_number: "1639554",
      patient_name: "Afolayan, Kayode",
    }, identity, family, false)).toBe(true);
    expect(matchesBeneficiaryHistoryRecord({
      policy_number: "1639554",
      beneficiary_number: "1639554-2",
      patient_name: "Afolayan Kayode",
    }, identity, family, false)).toBe(false);
    expect(matchesBeneficiaryHistoryRecord({
      policy_number: "11639554-1",
      patient_name: "Afolayan Kayode",
    }, identity, family, true)).toBe(false);
    expect(matchesBeneficiaryHistoryRecord({
      policy_number: "1639554",
      patient_name: "Kayode Afolayan",
    }, identity, [family[0], { ...family[0], id: "duplicate" }], false)).toBe(false);
  });
});
