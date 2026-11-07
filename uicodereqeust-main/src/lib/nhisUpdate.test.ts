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

  it("reassembles EXTRA DEPENDENT 2 and single-line names, consuming neighbor fragments", () => {
    const items = [
      textItem("Relationship", 166, 508),
      textItem("FirstName", 291, 508),
      textItem("LastName", 405, 508),
      textItem("Sex", 517, 508),
      textItem("DOB", 538, 508),
      textItem("EXTRA DEPENDENT", 166, 428),
      textItem("4", 65, 421),
      textItem("1626681-22", 86, 421),
      textItem("ANIEBIET", 291, 421),
      textItem("AKPAN", 405, 421),
      textItem("F", 517, 421),
      textItem("06/07/1992", 538, 421),
      textItem("2", 166, 414),
    ];

    const repairs = reconstructWrappedNhisRows(items);
    // Middle row (lineIndex 2 in lines) is reconstructed
    expect(repairs.get(2))
      .toBe("4 1626681-22 EXTRA DEPENDENT 2 ANIEBIET AKPAN F 06/07/1992");
    // Neighbor lines (lineIndex 1 and 3) are consumed to prevent stray unclassified lines
    expect(repairs.get(1)).toBe("");
    expect(repairs.get(3)).toBe("");
  });

  it("reassembles a row far down the page with merged Sex DOB header", () => {
    const items = [
      textItem("Relationship", 166, 750),
      textItem("FirstName", 291, 750),
      textItem("LastName", 405, 750),
      textItem("Sex DOB", 517, 750),
      textItem("EXTRA DEPENDENT", 166, 207),
      textItem("14", 65, 200),
      textItem("1626681-22", 86, 200),
      textItem("ANIEBIET", 291, 200),
      textItem("AKPAN", 405, 200),
      textItem("F", 517, 200),
      textItem("06/07/1992", 538, 200),
      textItem("2", 166, 193),
    ];

    const repairs = reconstructWrappedNhisRows(items);
    expect(repairs.get(2))
      .toBe("14 1626681-22 EXTRA DEPENDENT 2 ANIEBIET AKPAN F 06/07/1992");
    expect(repairs.get(1)).toBe("");
    expect(repairs.get(3)).toBe("");
  });

  it("reassembles multi-line wrapped first names and surnames", () => {
    const items = [
      textItem("Relationship", 166, 508),
      textItem("FirstName", 291, 508),
      textItem("LastName", 405, 508),
      textItem("Sex", 517, 508),
      textItem("DOB", 538, 508),
      textItem("MARY", 291, 451),
      textItem("OGHENE-", 405, 451),
      textItem("1", 65, 444),
      textItem("1626681-1", 86, 444),
      textItem("PRINCIPAL", 166, 444),
      textItem("ANN", 291, 444),
      textItem("F", 517, 444),
      textItem("01/01/1980", 538, 444),
      textItem("ROBOR", 405, 437),
    ];

    const repairs = reconstructWrappedNhisRows(items);
    expect(repairs.get(2))
      .toBe("1 1626681-1 PRINCIPAL MARY ANN OGHENE-ROBOR F 01/01/1980");
    expect(repairs.get(1)).toBe("");
    expect(repairs.get(3)).toBe("");
  });
});
