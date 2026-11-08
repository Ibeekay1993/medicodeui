import fs from "node:fs";
import XLSX from "xlsx";

const REPORT = "My personal back till may 9th MedAuth_Report_all_20260509 (1).xlsx";
const wb = XLSX.readFile(REPORT);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
const byCode = new Map(
  rows.filter((r) => r["Auth Code"]).map((r) => [String(r["Auth Code"]).trim(), String(r.Date).trim()]),
);

function parseReportDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^0?3\/0?10\/2025$/i.test(raw)) return "2025-03-10";
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const first = +m[1];
  const second = +m[2];
  let year = +m[3];
  if (year < 100) year += 2000;
  let month, day;
  if (first > 12) {
    day = first;
    month = second;
  } else if (second > 12) {
    month = first;
    day = second;
  } else {
    day = first;
    month = second;
  }
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function toGB(iso) {
  if (!iso) return "?";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const recovery = JSON.parse(fs.readFileSync("public/recovery.json", "utf8"));
const mism = [];
for (const [code, iso] of Object.entries(recovery)) {
  const ex = byCode.get(code);
  if (!ex) continue;
  const exp = parseReportDate(ex);
  if (!exp || iso.slice(0, 10) === exp) continue;
  mism.push({ code, excelDate: ex, shouldShow: toGB(exp + "T"), currentlyShows: toGB(iso) });
}

fs.writeFileSync("docs/date-audit-remaining-63.csv", [
  "auth_code,excel_date,should_show_en_GB,currently_shows_en_GB",
  ...mism.map((m) => `${m.code},${m.excelDate},${m.shouldShow},${m.currentlyShows}`),
].join("\n"));

console.log("Remaining mismatches:", mism.length);
console.log("Wrote docs/date-audit-remaining-63.csv");
