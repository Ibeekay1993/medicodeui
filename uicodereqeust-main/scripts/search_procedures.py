import re

with open('supabase/migrations/20260620090000_fresh_nhia_2025_tariffs.sql', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

def search(term):
    print(f"\n--- Searching: {term} ---")
    for line in lines:
        if term.lower() in line.lower():
            print(line.strip())

search("pelvic")
search("abdomin")
search("chest")
search("mammog")
search("haemoglobin")
search("hemoglobin")
search("lipid")
search("profile")
search("cholesterol")
search("electrolytes")
search("potassium")
search("sodium")
search("creatinine")
search("culture")
