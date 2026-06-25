import re
import json
import sys

# Ensure UTF-8 output even on Windows terminals
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def parse_tariff(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Simple regex for NHIA-XX-XX-XX Name Dosage Strength Presentation Price
    # Matches the pattern from the logs: NHIA-01-01-02 ... 2,700
    matches = re.finditer(r'(NHIA-[\d-]+)\s+(.*?)\s+([\d,]+)(?=\n|$)', content)
    
    results = []
    for match in matches:
        code = match.group(1)
        # Extract full name by removing common noise
        full_line = match.group(2).strip()
        price = match.group(3).replace(',', '')
        
        results.append({
            "code": code,
            "name": full_line,
            "price": price
        })
    
    return results

def run():
    print("--- Structuring 2025 Clinical Protocol ---")
    data = parse_tariff('c:/Users/WINDOWS/Downloads/Med code updated/uicodereqeust-main/hmo_tariff_2025_utf8.txt')
    print(f"Parsed {len(data)} unique 2025 clinical items.")
    
    if len(data) == 0:
        print("Warning: No items found. Check regex mapping against file content.")

    with open('c:/Users/WINDOWS/Downloads/Med code updated/uicodereqeust-main/hmo_tariff_2025.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    
    print("Success: NHIA 2025 Processed JSON ready!")

if __name__ == "__main__":
    run()
