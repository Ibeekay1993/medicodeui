import csv
from pathlib import Path


CSV_PATH = Path("outputs/nhis/extracted_beneficiaries.csv")
OUTPUT = Path("supabase/migrations/20260517234500_import_may_2026_nhis_beneficiaries.sql")
SOURCE_FILE = "HMO_10_RONSBERGER NIGERIA LTD._235.pdf"
TOTAL_RECORDS = 79436
UNIQUE_POLICIES = 27728


def sql_quote(value: str) -> str:
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def main():
    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    columns = [
        "policy_number",
        "member_type",
        "first_name",
        "surname",
        "full_name",
        "gender",
        "dob",
        "hcp_code",
    ]

    lines = [
        f"-- One-time May 2026 NHIS monthly beneficiary replacement generated from {SOURCE_FILE}.",
        "BEGIN;",
        "CREATE TEMP TABLE _nhis_import_run(id uuid) ON COMMIT DROP;",
        "INSERT INTO _nhis_import_run VALUES (gen_random_uuid());",
        (
            "INSERT INTO public.nhis_update_runs("
            "id, administrator_name, original_filename, status, total_records, unique_policy_numbers, "
            "duplicate_records, missing_fields, invalid_dates, validation_results, logs, confirmed_at, completed_at"
            ") SELECT id, 'Codex monthly import', "
            f"{sql_quote(SOURCE_FILE)}, 'completed', {TOTAL_RECORDS}, {UNIQUE_POLICIES}, 0, 0, 0, "
            "'{\"source\":\"monthly_pdf_import\",\"month\":\"May 2026\"}'::jsonb, "
            "ARRAY['Live beneficiary table replaced from monthly PDF import'], now(), now() "
            "FROM _nhis_import_run;"
        ),
        "DELETE FROM public.nhis_beneficiaries;",
    ]

    for start in range(0, len(rows), 1000):
        chunk = rows[start : start + 1000]
        values = [
            "(" + ", ".join(sql_quote(row[column]) for column in columns) + ")"
            for row in chunk
        ]
        lines.append(
            "INSERT INTO public.nhis_beneficiaries("
            + ", ".join(columns)
            + ") VALUES\n"
            + ",\n".join(values)
            + ";"
        )

    lines.extend(
        [
            (
                "WITH imported AS (SELECT id FROM _nhis_import_run) "
                "UPDATE public.nhis_update_runs u SET "
                "previous_record_count = NULL, "
                "new_record_count = (SELECT count(*) FROM public.nhis_beneficiaries), "
                "records_added = (SELECT count(*) FROM public.nhis_beneficiaries), "
                "records_removed = NULL, "
                "updated_at = now() "
                "WHERE u.id = (SELECT id FROM imported);"
            ),
            (
                "INSERT INTO public.audit_logs(action, user_id, details, severity) "
                "SELECT 'NHIS_BENEFICIARY_REPLACED', NULL, "
                "jsonb_build_object('run_id', id, 'source', 'Codex monthly import', 'new_record_count', "
                f"{TOTAL_RECORDS}), 'critical' FROM _nhis_import_run;"
            ),
            "COMMIT;",
        ]
    )

    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"{OUTPUT} ({len(rows)} rows, {OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
