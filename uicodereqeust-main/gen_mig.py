import os

with open("temp_func.sql", "r") as f:
    sql = f.read()

# We need to insert a statement into import_historical_codes that also inserts into authorization_requests
# if v_record_type = 'authorization' AND it was just created (or even if it was just updated).
# Let's just insert it at the very end of the loop, right before `END LOOP;`

insertion_code = """
    -- Sync historical authorizations into the main authorization_requests table for Admin/Nurse visibility
    IF v_record_type = 'authorization' THEN
      INSERT INTO public.authorization_requests (
        patient_name,
        policy_number,
        diagnosis,
        treatment,
        hospital_name,
        authorization_code,
        status,
        is_historical,
        created_at,
        updated_at
      ) VALUES (
        COALESCE(NULLIF(row_item->>'patient_name', ''), 'Historical Patient'),
        COALESCE(NULLIF(row_item->>'policy_number', ''), 'HISTORICAL-POLICY'),
        COALESCE(NULLIF(row_item->>'diagnosis', ''), 'Historical Record'),
        COALESCE(NULLIF(row_item->>'treatment', ''), 'Historical Record'),
        NULLIF(row_item->>'hospital_name', ''),
        record_code,
        'approved',
        true,
        COALESCE(public.safe_parse_date(row_item->>'legacy_creation_date'), now()),
        now()
      )
      ON CONFLICT (authorization_code) DO NOTHING; -- Assuming authorization_code is not unique here, wait it's not unique in the table, but we don't want duplicates.
      -- Wait, authorization_requests doesn't have a unique constraint on authorization_code!
      -- Let's just do a simple check before insert
    END IF;
"""

# Let's do the check before insert properly:
better_insertion = """
    -- Sync historical authorizations into the main authorization_requests table for Admin/Nurse visibility
    IF v_record_type = 'authorization' THEN
      -- Only insert if it doesn't already exist in authorization_requests to prevent duplicates on re-import
      IF NOT EXISTS (SELECT 1 FROM public.authorization_requests WHERE authorization_code = record_code AND is_historical = true) THEN
        INSERT INTO public.authorization_requests (
          patient_name,
          policy_number,
          diagnosis,
          treatment,
          hospital_name,
          authorization_code,
          status,
          is_historical,
          created_at,
          updated_at
        ) VALUES (
          COALESCE(NULLIF(row_item->>'patient_name', ''), 'Historical Patient'),
          COALESCE(NULLIF(row_item->>'policy_number', ''), 'HISTORICAL-POLICY'),
          COALESCE(NULLIF(row_item->>'diagnosis', ''), 'Historical Record'),
          COALESCE(NULLIF(row_item->>'treatment', ''), 'Historical Record'),
          NULLIF(row_item->>'hospital_name', ''),
          record_code,
          'approved',
          true,
          COALESCE(public.safe_parse_date(row_item->>'legacy_creation_date'), now()),
          now()
        );
      END IF;
    END IF;
"""

# Replace `END LOOP;` with the new code
sql = sql.replace("  END LOOP;", better_insertion + "\n  END LOOP;")

# Also, wait! Does the `authorization_requests` table have `is_historical` yet? Yes, I added it via `20260628174500_add_is_historical_to_authorizations.sql`.

with open("supabase/migrations/20260628174600_update_import_historical_codes.sql", "w") as f:
    f.write("CREATE OR REPLACE FUNCTION public.import_historical_codes(\n  _file_name text,\n  _rows jsonb\n)\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\n")
    f.write(sql)
    f.write("\n$$;\n")

print("Generated updated migration.")
