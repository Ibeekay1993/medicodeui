import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseCsvText, parseXlsxBuffer } from "./spreadsheetImport";

describe("spreadsheet import", () => {
  it("parses quoted CSV fields, escaped quotes, and embedded newlines", () => {
    expect(parseCsvText('\uFEFFname,note\r\n"Sample, Person","said ""hello""\nagain"\r\n')).toEqual([
      ["name", "note"],
      ["Sample, Person", 'said "hello"\nagain'],
    ]);
  });

  it("rejects malformed CSV with an unclosed quoted field", () => {
    expect(() => parseCsvText('name,note\nSample,"unfinished')).toThrow("unclosed quoted field");
  });

  it("reads xlsx workbooks through ExcelJS", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Beneficiaries");
    worksheet.addRow(["policy_number", "beneficiary_number"]);
    worksheet.addRow(["001234", "001234-1"]);
    const buffer = await workbook.xlsx.writeBuffer();

    await expect(parseXlsxBuffer(buffer as ArrayBuffer)).resolves.toEqual([
      ["policy_number", "beneficiary_number"],
      ["001234", "001234-1"],
    ]);
  });
});
