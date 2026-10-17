import re

tariffs = {}
with open('supabase/migrations/20260620090000_fresh_nhia_2025_tariffs.sql', 'r', encoding='utf-8') as f:
    for line in f:
        m = re.search(r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([0-9.]+)\s*\)", line)
        if m:
            code, name, cat, price = m.group(1), m.group(2), m.group(3), float(m.group(4))
            tariffs[code] = {'name': name, 'cat': cat, 'price': price}

print(f"Total tariffs loaded: {len(tariffs)}")

brand_map = {
  'vasoprin': ('NHIA-02-03-01', 30.0),
  'moduretic': ('NHIA-12-03-01', 36.0),
  'aldomet': ('NHIA-12-04-51', 69.0),
  'daonil': ('NHIA-17-06-14', 30.0),
  'tegretol': ('NHIA-05-01-01', 50.0),
  'avsar': ('NHIA-12-04-04', 280.0),
  'neurovite': ('NHIA-27-01-01', 20.0),
  'lantus': ('NHIA-17-06-03', 12474.0),
  'insulin': ('NHIA-17-06-03', 12474.0),
  'insulisn': ('NHIA-17-06-03', 12474.0),
  'hct': ('NHIA-12-03-05', 40.0),
  'htc': ('NHIA-12-03-05', 40.0),
  'amiloride': ('NHIA-12-03-01', 36.0),
  'indapamide': ('NHIA-12-03-08', 80.0),
  'indapimide': ('NHIA-12-03-08', 80.0),
  'tamsulosin': ('NHIA-18-01-01', 150.0),
  'benxehexol': ('NHIA-05-02-01', 45.0),
  'chlorpromazine': ('NHIA-24-01-01', 55.0),
  'clopidogrel': ('NHIA-12-04-20', 110.0),
}

print("=== BRAND_MAP AUDIT ===")
for k, (c, p) in brand_map.items():
    if c not in tariffs:
        print(f"MISMATCH CODE NOT IN DB: {k} -> {c} ({p})")
    else:
        db_item = tariffs[c]
        if db_item['price'] != p:
            print(f"PRICE MISMATCH: {k} -> code: {c}, brand_map price: {p}, db price: {db_item['price']}, db name: {db_item['name']}")
        else:
            print(f"OK: {k} -> {c} ({p}) | {db_item['name']}")

# Also audit LAB_MAP
lab_map = {
  "ecg": ("NHIA-040-008", 10000.0),
  "flp": ("NHIA-181-042", 8000.0),
  "lipid": ("NHIA-181-042", 8000.0),
  "psa": ("NHIA-181-082", 15000.0),
  "hba1c": ("NHIA-181-046", 10000.0),
  "hbalc": ("NHIA-181-046", 10000.0),
  "hbaic": ("NHIA-181-046", 10000.0),
  "e/u/cr": ("NHIA-181-030", 9000.0),
  "e/u": ("NHIA-181-030", 9000.0),
  "eucr": ("NHIA-181-030", 9000.0),
  "serum e/u": ("NHIA-181-030", 9000.0),
  "urine mcs": ("NHIA-181-110", 5000.0),
  "stool microscopy": ("NHIA-181-098", 5000.0),
  "scan": ("NHIA-030-001", 6000.0),
  "uss": ("NHIA-030-001", 6000.0),
  "x-ray": ("NHIA-020-001", 5000.0),
  "xray": ("NHIA-020-001", 5000.0),
  "hbsag": ("NHIA-181-050", 3500.0),
  "anti-hcv": ("NHIA-181-051", 4000.0),
  "rvs": ("NHIA-181-055", 3000.0),
  "pap smear": ("NHIA-181-075", 8000.0),
  "mammogram": ("NHIA-020-015", 15000.0),
  "semen analysis": ("NHIA-181-090", 6000.0),
  "tonometry": ("NHIA-081-008", 3000.0),
  "direct ophthalmoscopy": ("NHIA-081-007", 4000.0),
  "ophthalmoscopy": ("NHIA-081-007", 4000.0),
  "d.o": ("NHIA-081-007", 4000.0),
  "d/o": ("NHIA-081-007", 4000.0),
  "specialist consultation": ("NHIA-010-001", 4000.0),
  "consultation": ("NHIA-010-001", 4000.0),
  "initial consultation": ("NHIA-010-001", 4000.0),
  "specialist initial consultation": ("NHIA-010-001", 4000.0),
  "consult": ("NHIA-010-001", 4000.0),
  "follow up": ("NHIA-010-002", 2600.0),
  "follow-up": ("NHIA-010-002", 2600.0),
  "follw up": ("NHIA-010-002", 2600.0),
  "review": ("NHIA-010-002", 2600.0),
  "specialist review": ("NHIA-010-002", 2600.0),
}

print("\n=== LAB_MAP AUDIT ===")
for k, (c, p) in lab_map.items():
    if c not in tariffs:
        print(f"MISMATCH CODE NOT IN DB: {k} -> {c} ({p})")
    else:
        db_item = tariffs[c]
        if db_item['price'] != p:
            print(f"PRICE MISMATCH: {k} -> code: {c}, map price: {p}, db price: {db_item['price']}, db name: {db_item['name']}")
        else:
            print(f"OK: {k} -> {c} ({p}) | {db_item['name']}")
