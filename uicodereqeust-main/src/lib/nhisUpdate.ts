import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NhisBeneficiaryRecord = {
  policy_number: string;
  member_type: string;
  first_name: string;
  surname: string;
  full_name: string;
  gender: string;
  dob: string;
  hcp_code: string;
};

/** A row the extractor saw but could not fully parse. Surfaced so the UI can
 *  show exactly what was skipped — no silent data loss. */
export type SkippedRow = {
  page: number;
  hcp_code: string;
  reason: "NO_REGEX_MATCH" | "SINGLE_TOKEN_NAME" | "EMPTY_NAME";
  raw: string;
};

export type NhisValidationSummary = {
  expectedTotal: number | null;
  totalRecords: number;
  uniquePolicyNumbers: number;
  duplicateRecords: number;
  missingFields: number;
  invalidDates: number;
  hcpSummary: Record<string, number>;
  skippedRows: SkippedRow[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELDS: (keyof NhisBeneficiaryRecord)[] = [
  "policy_number",
  "member_type",
  "first_name",
  "surname",
  "full_name",
  "gender",
  "dob",
  "hcp_code",
];

/**
 * Fields that are allowed to be empty without raising a "missing field" flag.
 *
 * - hcp_code  : absent at the very start of a provider section (header not yet seen)
 * - first_name: some beneficiaries are recorded with one name only in the PDF
 */
const OPTIONAL_FIELDS = new Set<keyof NhisBeneficiaryRecord>([
  "hcp_code",
  "first_name",
]);

/**
 * Maximum number of subsequent lines the extractor will join when a row
 * cannot be matched on its own. 4 lines covers every known edge case:
 *  - 1 extra line: a name that wraps once inside a table cell
 *  - 2 extra lines: a long hyphenated name split across two continuation lines
 *  - 3 extra lines: extremely rare, but handles severe PDF layout issues
 */
const MAX_LOOKAHEAD = 4;

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/**
 * Matches a full beneficiary data row.
 * Groups: (1) S/N, (2) NHIA number, (3) relationship, (4) name tokens,
 *         (5) gender, (6) DOB, (7) optional HCP/employer code at end.
 */
const rowPattern =
  /^\s*(\d+)\s+([0-9]+(?:-[0-9]*)*)\s+(PRINCIPAL|SPOUSE|MEMBER|GIFSHIP|CHILD(?:\s+\d+)?|EXTRA\s+DEPENDENT(?:\s+\d+)?)\s+(.+?)\s+([MF])\s+(\d{2}\/\d{2}\/\d{4})(?:\s+(\S+))?\s*$/i;

/** Matches the HCP provider number header line within each section. */
const providerPattern = /Provider Number:\s*([A-Z]{2,3}\/\d{4}\/P)/i;

/** Matches the grand-total footer line used to validate extraction completeness. */
const grandTotalPattern = /Grand Total\s+([0-9,]+)/i;

/**
 * Lines that start with a serial number and a long numeric string are almost
 * certainly data rows. Used to flag rows that passed the "looks like data"
 * test but could not be parsed — surfaced as skipped rows.
 */
const looksLikeDataRow = /^\s*\d+\s+\d{5,}/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a raw PDF text fragment:
 *  - Replace non-breaking spaces with regular spaces
 *  - Normalise typographic dashes to ASCII hyphen
 *  - Collapse whitespace runs
 */
function normalizeLine(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Join a slice of lines intelligently:
 *  - If a line ends with `-` (hyphenation line-break), the next segment is
 *    concatenated WITHOUT a space so `CHUKWUDOZIE-` + `CHIMBUSOMMA` becomes
 *    `CHUKWUDOZIE-CHIMBUSOMMA` — not `CHUKWUDOZIE- CHIMBUSOMMA`.
 *  - All other lines are joined with a single space.
 */
function joinLines(lines: string[], from: number, count: number): string {
  let result = lines[from];
  for (let i = 1; i < count; i += 1) {
    const next = lines[from + i];
    result = result.endsWith("-") ? result + next : result + " " + next;
  }
  return result;
}

/**
 * Group raw PDF text items by y-coordinate, sort each row left-to-right, and
 * return an ordered array of normalised line strings (top of page first).
 */
function textContentToLines(items: any[]): string[] {
  const grouped = new Map<number, { x: number; text: string }[]>();
  for (const item of items) {
    const text = String(item.str || "").trim();
    if (!text) continue;
    const transform = item.transform || [];
    const y = Math.round(Number(transform[5] || 0));
    const x = Number(transform[4] || 0);
    const bucket = grouped.get(y) || [];
    bucket.push({ x, text });
    grouped.set(y, bucket);
  }

  return [...grouped.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) =>
      normalizeLine(
        parts
          .sort((a, b) => a.x - b.x)
          .map((part) => part.text)
          .join(" ")
      )
    )
    .filter(Boolean);
}

/**
 * Attempt to build a structured record from a regex match.
 * Returns null only when the name field is completely empty (no tokens at all).
 * Single-token names (only a surname, no first name) are preserved with
 * first_name set to an empty string — they will not raise a missing-field flag.
 */
function buildRecord(
  match: RegExpMatchArray,
  hcpCode: string
): NhisBeneficiaryRecord | null {
  const nameTokens = match[4].trim().split(/\s+/).filter(Boolean);

  // An empty name group means we matched something structurally wrong — skip.
  if (nameTokens.length < 1) return null;

  // When only one token exists it becomes the surname; first_name stays empty.
  const firstName =
    nameTokens.length > 1 ? nameTokens.slice(0, -1).join(" ") : "";
  const surname = nameTokens[nameTokens.length - 1];

  return {
    policy_number: match[2].split("-")[0],
    member_type: match[3].toUpperCase().replace(/\s{2,}/g, " "),
    first_name: firstName,
    surname,
    full_name: `${surname} ${firstName}`.trim(),
    gender: match[5].toUpperCase(),
    dob: match[6],
    hcp_code: hcpCode,
  };
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

export async function extractNhisPdf(
  file: File,
  onProgress?: (progress: number) => void
) {
  const started = performance.now();
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

  const records: NhisBeneficiaryRecord[] = [];
  const skippedRows: SkippedRow[] = [];

  let currentHcp = "";
  let expectedTotal: number | null = null;

  /**
   * A single unmatched line carried over from the bottom of the previous page.
   * This handles the rare but real case where a beneficiary row is split
   * exactly at a page boundary.
   */
  let carryOver = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    // Prepend any unmatched line from the previous page.
    const rawLines = textContentToLines(content.items as any[]);
    const lines = carryOver ? [carryOver, ...rawLines] : rawLines;
    carryOver = "";

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      // ── Grand total ─────────────────────────────────────────────────────
      const grandTotalMatch = line.match(grandTotalPattern);
      if (grandTotalMatch) {
        expectedTotal = Number(grandTotalMatch[1].replace(/,/g, ""));
      }

      // ── HCP provider header ──────────────────────────────────────────────
      const providerMatch = line.match(providerPattern);
      if (providerMatch) {
        currentHcp = providerMatch[1].toUpperCase();
        continue;
      }

      // ── Attempt to match a beneficiary data row ──────────────────────────
      let rowMatch = line.match(rowPattern);
      let extraConsumed = 0;

      if (!rowMatch) {
        // Try joining up to MAX_LOOKAHEAD subsequent lines.
        // joinLines handles trailing hyphens (word-break), so long names like
        // CHUKWUDOZIE-CHIMBUSOMMA that wrap across lines are reassembled
        // correctly before the regex is applied.
        for (
          let ahead = 1;
          ahead <= MAX_LOOKAHEAD && index + ahead < lines.length;
          ahead += 1
        ) {
          const combined = joinLines(lines, index, ahead + 1);
          rowMatch = combined.match(rowPattern);
          if (rowMatch) {
            extraConsumed = ahead;
            break;
          }
        }
      }

      // ── Process match ────────────────────────────────────────────────────
      if (rowMatch) {
        const record = buildRecord(rowMatch, currentHcp);
        if (record) {
          records.push(record);
        } else {
          // Regex matched but name was empty — surface it.
          skippedRows.push({
            page: pageNumber,
            hcp_code: currentHcp,
            reason: "EMPTY_NAME",
            raw: line.slice(0, 120),
          });
        }
        index += extraConsumed;
      } else {
        // ── No match after full lookahead ────────────────────────────────
        if (looksLikeDataRow.test(line)) {
          // Looks like a data row but we still couldn't parse it.
          // If this is the last line of the page, carry it to the next page
          // in case the rest of the row appears at the very top of page N+1.
          if (index === lines.length - 1 && pageNumber < pdf.numPages) {
            carryOver = line;
          } else {
            skippedRows.push({
              page: pageNumber,
              hcp_code: currentHcp,
              reason: "NO_REGEX_MATCH",
              raw: line.slice(0, 120),
            });
          }
        }
      }
    }

    onProgress?.(Math.round((pageNumber / pdf.numPages) * 100));
  }

  return {
    records,
    summary: validateNhisRecords(records, expectedTotal, skippedRows),
    processingMs: Math.round(performance.now() - started),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateNhisRecords(
  records: NhisBeneficiaryRecord[],
  expectedTotal: number | null,
  skippedRows: SkippedRow[] = []
): NhisValidationSummary {
  const seen = new Set<string>();
  const policies = new Set<string>();
  const hcpSummary: Record<string, number> = {};
  let duplicateRecords = 0;
  let missingFields = 0;
  let invalidDates = 0;

  for (const record of records) {
    const key = FIELDS.map((field) => record[field] || "").join("|");
    if (seen.has(key)) duplicateRecords += 1;
    seen.add(key);

    policies.add(record.policy_number);
    hcpSummary[record.hcp_code || "Unknown"] =
      (hcpSummary[record.hcp_code || "Unknown"] || 0) + 1;

    // Only required fields (not in OPTIONAL_FIELDS) must be present.
    if (FIELDS.some((field) => !OPTIONAL_FIELDS.has(field) && !record[field])) {
      missingFields += 1;
    }

    // DOB must be DD/MM/YYYY and parse as a valid calendar date.
    const dobParts = record.dob.split("/");
    const isoDate = dobParts.length === 3
      ? `${dobParts[2]}-${dobParts[1]}-${dobParts[0]}`
      : "";
    if (
      !/^\d{2}\/\d{2}\/\d{4}$/.test(record.dob) ||
      Number.isNaN(Date.parse(isoDate))
    ) {
      invalidDates += 1;
    }
  }

  const warnings: string[] = [];

  if (expectedTotal !== null && expectedTotal !== records.length) {
    warnings.push(
      `PDF grand total is ${expectedTotal.toLocaleString()} but ` +
        `${records.length.toLocaleString()} rows were extracted.`
    );
  }

  if (skippedRows.length > 0) {
    warnings.push(
      `${skippedRows.length} row(s) could not be parsed and were skipped. ` +
        `See skippedRows in the summary for details.`
    );
  }

  return {
    expectedTotal,
    totalRecords: records.length,
    uniquePolicyNumbers: policies.size,
    duplicateRecords,
    missingFields,
    invalidDates,
    hcpSummary,
    skippedRows,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

export function recordsToCsv(records: NhisBeneficiaryRecord[]): string {
  const escape = (value: string) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    FIELDS.join(","),
    ...records.map((record) =>
      FIELDS.map((field) => escape(record[field])).join(",")
    ),
  ].join("\n");
}

export function recordsToXlsxBlob(records: NhisBeneficiaryRecord[]): Blob {
  const worksheet = XLSX.utils.json_to_sheet(records, { header: FIELDS });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Beneficiaries");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
