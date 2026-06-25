import re
import json
import sys

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def extract_hospitals(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    results = {}
    
    # Regex to find lines like: UNIVERSITY COLLEGE HOSPITAL- OY/0001
    matches = re.finditer(r'([A-Z\s,`.\-(&)]+?)-\s+([A-Z]{2}/\d{4}(?:/P)?)', content)
    
    for match in matches:
        name = match.group(1).strip()
        code = match.group(2).strip()
        
        # Clean name from page numbers and prefixes
        name = re.sub(r'^\d+\s+', '', name) # Remove leading S/N
        name = name.strip()
        
        if name and code:
            official_name = f"{code} {name}"
            results[name.lower()] = official_name
    
    # Add common aliases manually for 100% accuracy on user's core sites
    results["jaja"] = "OY/0252 UHS Jaja"
    results["uhs"] = "OY/0252 UHS Jaja"
    results["ui jaja"] = "OY/0252 UHS Jaja"
    results["university college hospital"] = "OY/0001 University College Hospital"
    results["uch"] = "OY/0001 University College Hospital"
    results["university college"] = "OY/0001/P University College"

    return results

def run():
    print("--- Building HMO Master HCP Directory ---")
    data = extract_hospitals('c:/Users/WINDOWS/Downloads/Med code updated/uicodereqeust-main/hospitals_master.txt')
    print(f"Mapped {len(data)} unique healthcare facilities.")
    
    with open('c:/Users/WINDOWS/Downloads/Med code updated/uicodereqeust-main/hospitals_master.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    
    print("Success: Hospital Registry JSON ready!")

if __name__ == "__main__":
    run()
