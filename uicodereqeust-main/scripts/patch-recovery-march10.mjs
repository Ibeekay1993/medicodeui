import fs from "node:fs";

const codes = [
  "R/YG/011043166", "R/YG/011043162", "R/AO/011043158", "R/AO/011043157", "R/AO/011043155",
  "R/AO/011043153", "R/AO/011043150", "R/AO/011043148", "R/AO/011043146", "R/AO/011043142",
  "R/AO/011043141", "R/AO/011043139", "R/AO/011043136", "R/AO/011043133", "R/AO/011043131",
  "R/AO/011043129", "R/AO/011043127", "R/AO/011043124", "R/AO/011043121", "R/AO/011043120",
  "R/AO/011043118", "R/AO/011043114", "R/AO/011043112", "R/AO/011043110", "R/AO/011043109",
  "R/AO/011043107", "R/AO/011043105", "R/AO/011043104", "R/AO/011043102", "R/AO/011043101",
  "R/AO/011043098", "R/AO/011043096", "R/AO/011043095",
];

const path = "public/recovery.json";
const data = JSON.parse(fs.readFileSync(path, "utf8"));
let n = 0;
for (const c of codes) {
  if (data[c] !== undefined) {
    data[c] = "2025-03-10T12:00:00.000Z";
    n++;
  }
}
fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log("Updated", n, "entries in recovery.json");
