import { describe, expect, it } from "vitest";
import { parseNhisRowWithoutMemberType } from "./nhisUpdate";

describe("parseNhisRowWithoutMemberType", () => {
  it("captures a single-name beneficiary row when the member type is absent", () => {
    expect(parseNhisRowWithoutMemberType("3 1626681-21 OBEHI F 25/01/2002")).toEqual({
      policyNumber: "1626681",
      name: "OBEHI",
      gender: "F",
      dob: "25/01/2002",
    });
  });

  it("captures multi-word names and an optional trailing field", () => {
    expect(parseNhisRowWithoutMemberType("3 2844595-21 BILKISU MUHAMMED F 14/01/2001 X1")).toEqual({
      policyNumber: "2844595",
      name: "BILKISU MUHAMMED",
      gender: "F",
      dob: "14/01/2001",
    });
  });

  it("does not mistake known relationship types for a missing type", () => {
    expect(parseNhisRowWithoutMemberType("1 1234567-89 PRINCIPAL ADA OKAFOR F 01/01/1980")).toBeNull();
  });

  it("does not accept rows missing required identifying fields", () => {
    expect(parseNhisRowWithoutMemberType("3 1626681-21 OBEHI F")).toBeNull();
  });
});
