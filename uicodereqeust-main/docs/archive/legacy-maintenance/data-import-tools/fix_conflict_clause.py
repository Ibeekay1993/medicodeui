with open('scripts/reconcile_and_seed_july_2026.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_conflict = 'ON CONFLICT (authorization_code) WHERE authorization_code IS NOT NULL DO UPDATE SET'
new_conflict = 'ON CONFLICT (request_id) DO UPDATE SET'

if old_conflict in content:
    content = content.replace(old_conflict, new_conflict)
    print("Conflict clause replaced successfully")
else:
    print("old_conflict not found")

with open('scripts/reconcile_and_seed_july_2026.ts', 'w', encoding='utf-8') as f:
    f.write(content)
