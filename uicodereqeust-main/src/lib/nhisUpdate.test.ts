import { describe, expect, it } from "vitest";
import { parseNhisRowWithoutMemberType, reconstructWrappedNhisRows } from "./nhisUpdate";

function textItem(str: string, x: number, y: number) {
  return { str, transform: [1, 0, 0, 1, x, y, 0] };
}

describe("parseNhisRowWithoutMemberType", () => {
  it("captures a single-name beneficiary row when the member type is absent", () => {
    expect(parseNhisRowWithoutMemberType("3 1626681-21 OBEHI F 25/01/2002")).toEqual({
      policyNumber: "1626681",
      beneficiaryNumber: "1626681-21",
      name: "OBEHI",
      gender: "F",
      dob: "25/01/2002",
    });
  });

  it("captures multi-word names and an optional trailing field", () => {
    expect(parseNhisRowWithoutMemberType("3 2844595-21 BILKISU MUHAMMED F 14/01/2001 X1")).toEqual({
      policyNumber: "2844595",
      beneficiaryNumber: "2844595-21",
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

  it("reassembles a wrapped EXTRA DEPENDENT 1 relationship and hyphenated surname", () => {
    const items = [
      textItem("Relationship", 166, 508),
      textItem("FirstName", 291, 508),
      textItem("LastName", 405, 508),
      textItem("Sex", 517, 508),
      textItem("DOB", 538, 508),
      textItem("EXTRA DEPENDENT", 166, 451),
      textItem("AKHARIA-", 405, 451),
      textItem("3", 65, 444),
      textItem("1626681-21", 86, 444),
      textItem("OBEHI", 291, 444),
      textItem("F", 517, 444),
      textItem("25/01/2002", 538, 444),
      textItem("1", 166, 437),
      textItem("AGBONS", 405, 437),
    ];

    expect(reconstructWrappedNhisRows(items).get(2))
      .toBe("3 1626681-21 EXTRA DEPENDENT 1 OBEHI AKHARIA-AGBONS F 25/01/2002");
  });

  it("reassembles the second wrapped dependent row from its PDF columns", () => {
    const items = [
      textItem("Relationship", 163, 525),
      textItem("FirstName", 283, 525),
      textItem("LastName", 398, 525),
      textItem("Sex", 519, 525),
      textItem("DOB", 540, 525),
      textItem("EXTRA DEPENDENT", 163, 454),
      textItem("3", 65, 447),
      textItem("2844595-21", 86, 447),
      textItem("BILKISU", 283, 447),
      textItem("MUHAMMED", 398, 447),
      textItem("F", 519, 447),
      textItem("14/01/2001", 540, 447),
      textItem("1", 163, 440),
    ];

    expect(reconstructWrappedNhisRows(items).get(2))
      .toBe("3 2844595-21 EXTRA DEPENDENT 1 BILKISU MUHAMMED F 14/01/2001");
  });
});
