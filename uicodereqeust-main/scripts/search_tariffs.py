import re

items = [
    'indapamide', 'clopidogrel', 'tamsulosin', 'vitamin b', 'neurovite',
    'benzhexol', 'trihexyphenidyl', 'chlorpromazine', 'glibenclamide',
    'carbamazepine', 'aspirin', 'acetylsalicylic', 'tonometry',
    'lipid', 'hba1c', 'glycated', 'electrolytes', 'urea', 'creatinine',
    'urine', 'microscopy', 'ultrasound', 'scan', 'x-ray', 'radiography',
    'hepatitis', 'retroviral', 'hiv', 'cervical', 'pap', 'mammograph',
    'semen', 'seminal', 'prostate', 'ecg'
]

results = {k: [] for k in items}

with open('supabase/migrations/20260620090000_fresh_nhia_2025_tariffs.sql', 'r', encoding='utf-8') as f:
    for line in f:
        m = re.search(r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([0-9.]+)\s*\)", line)
        if m:
            code, name, cat, price = m.group(1), m.group(2), m.group(3), float(m.group(4))
            for k in items:
                if k in name.lower():
                    results[k].append((code, name, cat, price))

for k in items:
    print(f"=== SEARCH: {k} ({len(results[k])} matches) ===")
    for c, n, cat, p in results[k][:10]:
        print(f"  {c} | {n} | {cat} | {p}")
