import xlsx from "xlsx";

function normalize(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeLower(value) {
  return normalize(value).toLowerCase();
}

function isMeaningfulCode(value) {
  const text = normalizeLower(value);
  return Boolean(text) && !["-", "pending", "none", "null", "declined", "rejected"].includes(text);
}

function readWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath);
  const records = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const record = {
        sheet: sheetName,
        row: i + 1,
        date: normalize(row[0]),
        hospital: normalize(row[1]),
        patient: normalize(row[2]),
        policy: normalize(row[3]),
        code: normalize(row[4]),
        diagnosis: normalize(row[5]),
        officer: normalize(row[6]),
        note: normalize(row[7]),
        status: normalize(row[8]),
      };
      if (Object.values(record).some(Boolean)) {
        records.push(record);
      }
    }
  }

  return records;
}

function matchesQuery(record, query) {
  const q = normalizeLower(query);
  if (!q) return true;
  const haystack = [
    record.date,
    record.hospital,
    record.patient,
    record.policy,
    record.code,
    record.diagnosis,
    record.officer,
    record.note,
    record.status,
  ].map(normalizeLower).join(" | ");
  return haystack.includes(q);
}

const args = process.argv.slice(2);
const workbookIndex = args.indexOf("--workbook");
const workbookPath = workbookIndex >= 0 ? args[workbookIndex + 1] : "Ibadan code.xlsx";
const codeIndex = args.indexOf("--code");
const codeQuery = codeIndex >= 0 ? args[codeIndex + 1] : "";
const patientIndex = args.indexOf("--patient");
const patientQuery = patientIndex >= 0 ? args[patientIndex + 1] : "";
const policyIndex = args.indexOf("--policy");
const policyQuery = policyIndex >= 0 ? args[policyIndex + 1] : "";

const records = readWorkbook(workbookPath);
const blankApproved = records.filter((record) => {
  const status = normalizeLower(record.status);
  const approved = status.includes("approv") || status.includes("code received");
  return approved && !isMeaningfulCode(record.code);
});

const query = [codeQuery, patientQuery, policyQuery].filter(Boolean).join(" ").trim();
const matched = query ? records.filter((record) => matchesQuery(record, query)) : [];

const report = {
  workbookPath,
  totalRows: records.length,
  approvedRowsMissingCodes: blankApproved.length,
  sampleMissingCodes: blankApproved.slice(0, 25),
  query: query || null,
  matchedCount: matched.length,
  matchedRows: matched.slice(0, 25),
};

console.log(JSON.stringify(report, null, 2));
