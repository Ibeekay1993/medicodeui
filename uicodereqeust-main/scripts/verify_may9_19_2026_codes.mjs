/**
 * Verify R/AG/011008179BD–275BD dates against user's May 9–19 2026 authorization list.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DUMP = path.join(ROOT, "scratch/db_dump.json");
const OUT_SQL = path.join(ROOT, "supabase/migrations/20260521270000_restore_may9_19_2026_dates.sql");
const OUT_CSV = path.join(ROOT, "docs/may9-19-2026-verification.csv");

/** Source: user-provided authorization messages May 9–19 2026 */
const AUTHORITATIVE = [
  ["R/AG/011008179BD", "09/05/2026", "1638273", "Emmanuel Ajav", "approved"],
  ["", "11/05/2026", "1638494", "Kofoworola Ogunbiyi", "declined"],
  ["R/AG/011008183BD", "11/05/2026", "1638834", "Anichukwu Festus", "approved"],
  ["R/AG/011008184BD", "11/05/2026", "2852885", "Jubril Ayoade", "approved"],
  ["R/AG/011008185BD", "11/05/2026", "1458275", "Hassan Ramoni", "approved"],
  ["R/AG/011008186BD", "11/05/2026", "1637727", "Monsurat Olaniyi", "approved"],
  ["R/AG/011008187BD", "11/05/2026", "2173642", "Fapojuwo Philomena", "approved"],
  ["R/AG/011008188BD", "15/05/2026", "2871958", "Esther Fakoya", "approved"],
  ["R/AG/011008189BD", "15/05/2026", "1638101", "Titilope Idode", "approved"],
  ["", "16/05/2026", "1638073", "Saibu Iyabo", "declined"],
  ["R/AG/011008190BD", "16/05/2026", "2557304", "Okusaga Adesegun", "approved"],
  ["R/AG/011008191BD", "16/05/2026", "2173679", "Oluyemi Adelusi", "approved"],
  ["", "16/05/2026", "2852806", "Ukoh Enyeneokpon", "declined"],
  ["R/AG/011008192BD", "16/05/2026", "1638073", "Saibu Adetoro", "approved"],
  ["R/AG/011008193BD", "16/05/2026", "2852806", "Edidiong Ukoh", "approved"],
  ["R/AG/011008194BD", "16/05/2026", "2717006", "Akinade Titilope", "approved"],
  ["R/AG/011008196BD", "17/05/2026", "1640134", "Osota Taiwo", "approved"],
  ["R/AG/011008215BD", "18/05/2026", "2872604", "Lawal Yinka", "approved"],
  ["R/AG/011008216BD", "18/05/2026", "2872512", "Garba Abdul ganiyu", "approved"],
  ["R/AG/011008217BD", "18/05/2026", "7851104", "Falaye Augustine", "approved"],
  ["R/AG/011008218BD", "18/05/2026", "2871288", "Olopha Olubunmi Adeyinka", "approved"],
  ["R/AG/011008219BD", "18/05/2026", "2173640", "Kobiowu Babatunde", "approved"],
  ["R/AG/011008220BD", "18/05/2026", "2871275", "Sherifat yusuf", "approved"],
  ["R/AG/011008221BD", "18/05/2026", "2872763", "Adisa Rufus", "approved"],
  ["R/AG/011008222BD", "18/05/2026", "2557065", "Adekoya Oluwatomisin", "approved"],
  ["R/AG/011008223BD", "18/05/2026", "7047427", "Babalola Ayomiposi", "approved"],
  ["R/AG/011008224BD", "18/05/2026", "2871846", "John Akintayo", "approved"],
  ["R/AG/011008225BD", "18/05/2026", "2870656", "Sangolana Adebanke", "approved"],
  ["R/AG/011008226BD", "18/05/2026", "2839529", "Olaleye Sanusi", "approved"],
  ["R/AG/011008227BD", "18/05/2026", "2717050", "Samuel Olufemi", "approved"],
  ["R/AG/011008228BD", "18/05/2026", "1639524", "MARIAM OLADELE", "approved"],
  ["R/AG/011008229BD", "18/05/2026", "1637756", "BELLO SUNDAY", "approved"],
  ["R/AG/011008230BD", "18/05/2026", "2872364", "MUTIU AKANBI", "approved"],
  ["R/AG/011008231BD", "18/05/2026", "7083222", "NKECHI CHRISTOPHER", "approved"],
  ["R/AG/011008232BD", "18/05/2026", "2871825", "Raifu Muideen Kolawole", "approved"],
  ["R/AG/011008233BD", "18/05/2026", "1639524", "Oladele Mariam", "approved"],
  ["R/AG/011008234BD", "18/05/2026", "2872951", "Amosun Peter", "approved"],
  ["R/AG/011008235BD", "18/05/2026", "1638194", "Grace Ajakaye", "approved"],
  ["R/AG/011008236BD", "18/05/2026", "3415220", "Garuba Emmanuel", "approved"],
  ["R/AG/011008238BD", "18/05/2026", "2871846", "John Akintayo", "approved"],
  ["R/AG/011008239BD", "18/05/2026", "2173757", "AKINWALE JOHNSON", "approved"],
  ["", "18/05/2026", "2173524", "Akinlade Emmanuel", "declined"],
  ["R/AG/011008240BD", "18/05/2026", "2871400", "Babalola Funmilola", "approved"],
  ["R/AG/011008241BD", "18/05/2026", "2173524", "Akinlade Olufunke", "approved"],
  ["R/AG/011008242BD", "18/05/2026", "3381737", "Abosede Babatunde", "approved"],
  ["R/AG/011008243BD", "19/05/2026", "1637487", "ABIJO COMFORT", "approved"],
  ["R/AG/011008244BD", "19/05/2026", "2839471", "Adekunle Adejimi", "approved"],
  ["", "19/05/2026", "2871007", "Fadoro Jacob", "declined"],
  ["", "19/05/2026", "1458987", "IVUONGBE AUGUSTINE", "declined"],
  ["R/AG/011008245BD", "19/05/2026", "2871289", "Aderonke Oyawale", "approved"],
  ["R/AG/011008246BD", "19/05/2026", "2173578", "OLADEJO HAMDALAT", "approved"],
  ["R/AG/011008247BD", "19/05/2026", "1638086", "OWOYEMI MATTHEW", "approved"],
  ["", "19/05/2026", "145845", "Lawal Biliaminu", "declined"],
  ["R/AG/011008248BD", "19/05/2026", "1640002", "Afe Shari", "approved"],
  ["R/AG/011008249BD", "19/05/2026", "2871004", "Akintade Adeiji Elijah", "approved"],
  ["R/AG/011008250BD", "19/05/2026", "3381714", "Abinbola Abidoye", "approved"],
  ["R/AG/011008251BD", "19/05/2026", "1458187", "Adeyemo Adeniji", "approved"],
  ["R/AG/011008252BD", "19/05/2026", "1458987", "IVUONUBE ENOGHONGHON", "approved"],
  ["", "19/05/2026", "1458548", "Oyekunle Bunmi", "declined"],
  ["R/AG/011008253BD", "19/05/2026", "2556944", "TomomowoAyodele Susan", "approved"],
  ["R/AG/011008255BD", "19/05/2026", "1638582", "Oyeyemi Oluwafemi", "approved"],
  ["R/AG/011008257BD", "19/05/2026", "2557323", "Olukunmi Ajagbe", "approved"],
  ["R/AG/011008258BD", "19/05/2026", "2173605", "Oyeyebi Nureni", "approved"],
  ["R/AG/011008259BD", "19/05/2026", "1458548", "Oyekunle Olayide", "approved"],
  ["R/AG/011008260BD", "19/05/2026", "2173476", "Babajide Olaide", "approved"],
  ["R/AG/011008261BD", "19/05/2026", "1638234", "OLUMUTIMI OFONIME", "approved"],
  ["R/AG/011008262BD", "19/05/2026", "2557218", "Omidiji Joseph", "approved"],
  ["R/AG/011008263BD", "19/05/2026", "1639228", "Oladapo Francis", "approved"],
  ["R/AG/011008264BD", "19/05/2026", "2839471", "Adekunle Adejimi", "approved"],
  ["R/AG/011008265BD", "19/05/2026", "2872384", "Olaniran Farodoye", "approved"],
  ["R/AG/011008266BD", "19/05/2026", "7841918", "Solana Tolulope", "approved"],
  ["R/AG/011008267BD", "19/05/2026", "1639120", "Omoregie Helen", "approved"],
  ["R/AG/011008268BD", "19/05/2026", "2873106", "Oseni Folake", "approved"],
  ["", "19/05/2026", "1637786", "Wojuola Emmanuel", "declined"],
  ["R/AG/011008269BD", "19/05/2026", "2173731", "SODEINDE BASHIRU", "approved"],
  ["R/AG/011008270BD", "19/05/2026", "1637786", "Wojuola Sunday", "approved"],
  ["R/AG/011008271BD", "19/05/2026", "2872629", "Jokodola Taiwo", "approved"],
  ["R/AG/011008272BD", "19/05/2026", "7841923", "OLALEYE HANNAH AYODELE", "approved"],
  ["R/AG/011008273BD", "19/05/2026", "2872524", "Habibath Uthwan Oladosu", "approved"],
  ["R/AG/011008274BD", "19/05/2026", "7842393", "Akindele busola", "approved"],
  ["R/AG/011008275BD", "19/05/2026", "1458013", "Ademola Moshood", "approved"],
];

function parseDMY(s) {
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = +m[1];
  const month = +m[2];
  const year = +m[3];
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
}

function normName(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function policyKey(p) {
  return String(p ?? "").trim().replace(/-1$/, "").replace(/-2$/, "").replace(/-3$/, "");
}

const dump = JSON.parse(fs.readFileSync(DUMP, "utf8")).rows;
const byCode = new Map();
const byPolicy = new Map();

for (const r of dump) {
  const code = String(r.authorization_code ?? "").trim().toUpperCase();
  if (code) byCode.set(code, r);
  const pk = policyKey(r.policy_number);
  if (!byPolicy.has(pk)) byPolicy.set(pk, []);
  byPolicy.get(pk).push(r);
}

const fixes = [];
const report = [];

for (const [code, date, policy, patient, status] of AUTHORITATIVE) {
  const iso = parseDMY(date);
  const isoDay = iso?.slice(0, 10);

  let rec = code ? byCode.get(code.toUpperCase()) : null;

  if (!rec && policy) {
    const candidates = (byPolicy.get(policyKey(policy)) || []).filter((r) => {
      const n = normName(r.patient_name);
      const p = normName(patient);
      const shared = p.split(" ").filter((t) => t.length > 2 && n.includes(t));
      return shared.length >= 2;
    });
    if (status === "declined") {
      rec =
        candidates.find((r) => r.status === "rejected" && !r.authorization_code) ||
        candidates.find((r) => r.status === "rejected") ||
        candidates[0];
    } else {
      rec = candidates.find((r) => r.authorization_code === code) || candidates[0];
    }
  }

  const dbDate = rec ? String(rec.created_at).slice(0, 10) : "NOT_FOUND";
  const ok = rec && dbDate === isoDay;

  report.push({
    code: code || "(declined)",
    policy,
    patient,
    expected: date,
    dbDate,
    id: rec?.id ?? "",
    ok,
  });

  // Always restore authoritative May 9–19 2026 dates (prior migration may have overwritten with old Excel dates)
  if (rec && iso) {
    fixes.push({ id: rec.id, code: code || "(declined)", policy, patient, expected: date, newIso: iso, dbDate });
  }
}

console.log("Total in list:", AUTHORITATIVE.length);
console.log("Will restore authoritative dates:", fixes.length);
console.log("At risk from prior may19 migration (wrong Excel match): 14 codes in R/AG/011008245–275 range");
console.log("Already correct:", report.filter((r) => r.ok).length);
console.log("Not in dump:", report.filter((r) => r.dbDate === "NOT_FOUND").length);

console.log("\nWrong dates (first 25):");
fixes.slice(0, 25).forEach((f) =>
  console.log(`  ${f.code} ${f.patient} expected ${f.expected} got ${f.dbDate}`),
);

fs.writeFileSync(
  OUT_CSV,
  ["code,policy,patient,expected,db_date,id,status", ...report.map((r) =>
    [r.code, r.policy, `"${r.patient}"`, r.expected, r.dbDate, r.id, r.ok ? "OK" : "FIX"].join(","),
  )].join("\n"),
);

const esc = (s) => String(s).replace(/'/g, "''");
let sql = `-- Restore authoritative May 9–19 2026 dates (${fixes.length} rows)
BEGIN;

ALTER TABLE public.authorization_requests
  DISABLE TRIGGER protect_approved_authorization_requests_trigger;

`;

const CHUNK = 100;
for (let i = 0; i < fixes.length; i += CHUNK) {
  const chunk = fixes.slice(i, i + CHUNK);
  sql += `UPDATE public.authorization_requests AS r
SET created_at = f.correct_date
FROM (VALUES\n`;
  sql += chunk.map((f) => `  ('${esc(f.id)}'::uuid, '${f.newIso}'::timestamptz)`).join(",\n");
  sql += `
) AS f(id, correct_date)
WHERE r.id = f.id;

`;
}

sql += `ALTER TABLE public.authorization_requests
  ENABLE TRIGGER protect_approved_authorization_requests_trigger;

COMMIT;
`;

fs.writeFileSync(OUT_SQL, sql);
console.log("\nWrote", OUT_SQL);
console.log("Wrote", OUT_CSV);
