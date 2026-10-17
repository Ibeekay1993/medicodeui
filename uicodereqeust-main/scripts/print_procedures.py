import re

with open('supabase/migrations/20260620090000_fresh_nhia_2025_tariffs.sql', 'r', encoding='utf-8') as f:
    for line in f:
        m = re.search(r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([0-9.]+)\s*\)", line)
        if m:
            code, name, cat, price = m.group(1), m.group(2), m.group(3), float(m.group(4))
            if cat == 'procedure':
                # filter to radiology / lab
                if any(x in code for x in ['170', '171', '172', '173', '174', '175', '176', '177', '178', '179', '180', '181', '182', '183', '184', '185', '081', '020', '030', '040']):
                    print(f"{code} | {name} | {price}")
