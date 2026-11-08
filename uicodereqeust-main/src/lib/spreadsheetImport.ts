const MAX_IMPORT_SIZE_BYTES = 50 * 1024 * 1024;

export function parseCsvText(text: string): string[][] {
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (character === "\n" || character === "\r")) {
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      continue;
    }

    cell += character;
  }

  if (quoted) throw new Error("The CSV file contains an unclosed quoted field.");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }

  return rows;
}

export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<string[][]> {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as Parameters<typeof workbook.xlsx.load>[0]);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The workbook does not contain a readable worksheet.");

  const rows: string[][] = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = Array.from({ length: worksheet.columnCount }, (_, index) =>
      row.getCell(index + 1).text ?? ""
    );
    if (values.some((value) => value.trim() !== "")) rows.push(values);
  }

  return rows;
}

export async function readSpreadsheetRows(file: File): Promise<string[][]> {
  if (file.size > MAX_IMPORT_SIZE_BYTES) {
    throw new Error("The file is larger than the 50 MB import limit.");
  }

  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return parseCsvText(await file.text());
  if (extension === "xlsx") return parseXlsxBuffer(await file.arrayBuffer());
  if (extension === "xls") {
    throw new Error("Legacy .xls files are not supported. Save the workbook as .xlsx or CSV and upload it again.");
  }
  throw new Error("Upload a CSV or .xlsx workbook.");
}
