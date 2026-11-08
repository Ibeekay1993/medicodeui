with open('scripts/reconcile_and_seed_july_2026.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add DISABLE TRIGGER USER
old_begin = '    "BEGIN;",\n    "",\n    "-- 1. Identify primary hospital IDs",\n    "DO $$",'
new_begin = '    "BEGIN;",\n    "",\n    "-- Temporarily disable intake-path trigger to allow direct historical seeding",\n    "ALTER TABLE public.authorization_requests DISABLE TRIGGER USER;",\n    "",\n    "-- 1. Identify primary hospital IDs",\n    "DO $$",'

if old_begin in content:
    content = content.replace(old_begin, new_begin)
    print('Replaced begin successfully')
else:
    old_begin_crlf = old_begin.replace('\n', '\r\n')
    new_begin_crlf = new_begin.replace('\n', '\r\n')
    if old_begin_crlf in content:
        content = content.replace(old_begin_crlf, new_begin_crlf)
        print('Replaced begin (CRLF) successfully')
    else:
        print('Could not find old_begin')

# 2. Update audit log and add ENABLE TRIGGER USER
old_end = """  lines.push("  -- Audit log entry");
  lines.push("  INSERT INTO public.audit_logs (");
  lines.push("    action, entity_type, entity_id, actor_id, metadata, created_at");
  lines.push("  ) VALUES (");
  lines.push("    'import_historical_authorisations',");
  lines.push("    'authorization_requests',");
  lines.push("    'july-2026-ao-import',");
  lines.push("    v_admin_id,");
  lines.push(`    jsonb_build_object('source_file', 'july ao.xlsx', 'total_records', ${summary.totalRecords}, 'approved_count', ${summary.approvedCount}, 'total_amount', ${summary.totalCalculatedAmount}),`);
  lines.push("    now()");
  lines.push("  );");
  lines.push("END $$;");
  lines.push("");
  lines.push("COMMIT;");"""

new_end = """  lines.push("  -- Audit log entry");
  lines.push("  INSERT INTO public.audit_logs (");
  lines.push("    action, user_id, details, created_at");
  lines.push("  ) VALUES (");
  lines.push("    'import_historical_authorisations',");
  lines.push("    v_admin_id,");
  lines.push(`    jsonb_build_object('source_file', 'july ao.xlsx', 'total_records', ${summary.totalRecords}, 'approved_count', ${summary.approvedCount}, 'total_amount', ${summary.totalCalculatedAmount}),`);
  lines.push("    now()");
  lines.push("  );");
  lines.push("END $$;");
  lines.push("");
  lines.push("-- Re-enable triggers after historical seeding");
  lines.push("ALTER TABLE public.authorization_requests ENABLE TRIGGER USER;");
  lines.push("");
  lines.push("COMMIT;");"""

if old_end in content:
    content = content.replace(old_end, new_end)
    print('Replaced end successfully')
else:
    old_end_crlf = old_end.replace('\n', '\r\n')
    new_end_crlf = new_end.replace('\n', '\r\n')
    if old_end_crlf in content:
        content = content.replace(old_end_crlf, new_end_crlf)
        print('Replaced end (CRLF) successfully')
    else:
        print('Could not find old_end')

with open('scripts/reconcile_and_seed_july_2026.ts', 'w', encoding='utf-8') as f:
    f.write(content)
