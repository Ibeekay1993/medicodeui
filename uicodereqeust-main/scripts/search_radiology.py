import re

with open('supabase/migrations/20260620090000_fresh_nhia_2025_tariffs.sql', 'r', encoding='utf-8') as f:
    for line in f:
        m = re.search(r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([0-9.]+)\s*\)", line)
        if m:
            code, name, cat, price = m.group(1), m.group(2), m.group(3), float(m.group(4))
            if any(c in code for c in ['NHIA-170', 'NHIA-171', 'NHIA-172', 'NHIA-173', 'NHIA-174', 'NHIA-175', 'NHIA-176', 'NHIA-177', 'NHIA-178', 'NHIA-179']):
                print(f"{code} | {name} | {price}")
