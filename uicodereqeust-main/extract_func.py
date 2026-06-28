import os
import re

sql_file_path = "supabase/migrations/20260518110000_audit_historical_import_chat_claims.sql"
with open(sql_file_path, "r") as f:
    sql_content = f.read()

# We want to extract the import_historical_codes function
match = re.search(r'CREATE OR REPLACE FUNCTION public\.import_historical_codes\s*\((.*?)\)\s*RETURNS jsonb\s*LANGUAGE plpgsql\s*SECURITY DEFINER\s*SET search_path = public\s*AS \$\$(.*?)\$\$;', sql_content, re.DOTALL | re.IGNORECASE)

if match:
    args = match.group(1)
    body = match.group(2)
    
    # Let's write the original body to a temporary file for analysis
    with open("temp_func.sql", "w") as out:
        out.write(body)
    print("Function extracted successfully.")
else:
    print("Function not found.")
