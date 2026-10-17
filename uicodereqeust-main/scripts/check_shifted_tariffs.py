import re

with open('supabase/migrations/20260620090000_fresh_nhia_2025_tariffs.sql', 'r', encoding='utf-8') as f:
    for line in f:
        m = re.search(r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([0-9.]+)\s*\)", line)
        if m:
            code, name, cat, price = m.group(1), m.group(2), m.group(3), float(m.group(4))
            end_num = re.search(r'\s+(\d+(?:\.\d+)?)\s*$', name)
            if end_num:
                print(f"{code} | {name} | price in db: {price} | price in name: {end_num.group(1)}")
