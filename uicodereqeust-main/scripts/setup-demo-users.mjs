// ============================================================
// DEMO USER SETUP SCRIPT — uses Supabase Admin API correctly
// This is the RIGHT way to create auth users (not raw SQL inserts)
// ============================================================
// HOW TO RUN:
// 1. Get your service_role key from:
//    Supabase Dashboard → Settings → API → service_role (secret)
// 2. Paste it into SERVICE_ROLE_KEY below
// 3. Run: node scripts/setup-demo-users.mjs
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://optistuvyeiojlgmkdks.supabase.co';
const SERVICE_ROLE_KEY = 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE'; // ← paste here

if (SERVICE_ROLE_KEY === 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE') {
  console.error('❌ Please add your service_role key to this script first!');
  console.error('   Find it at: Supabase Dashboard → Settings → API → service_role');
  process.exit(1);
}

// Use service_role client — bypasses RLS and can create auth users
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEMO_USERS = [
  {
    id: 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    email: 'demo.admin@medicode.com',
    role: 'admin',
    fullName: 'Demo Admin Officer',
  },
  {
    id: 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
    email: 'demo.nurse@medicode.com',
    role: 'utilization_manager',
    fullName: 'Demo Utilization Manager',
  },
  {
    id: 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
    email: 'demo.hospital@medicode.com',
    role: 'hospital',
    fullName: 'Ronsberger Demo Hospital',
  },
  {
    id: 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
    email: 'demo.claims@medicode.com',
    role: 'claims',
    fullName: 'Demo Claims Reviewer',
  },
];

async function run() {
  console.log('🚀 Setting up demo accounts...\n');

  for (const user of DEMO_USERS) {
    console.log(`📋 Processing: ${user.email}`);

    // Step 1: Delete existing user if present (clean slate)
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr && !delErr.message.includes('not found')) {
      console.warn(`  ⚠️  Delete warning: ${delErr.message}`);
    } else {
      console.log(`  ✅ Cleaned up old user (if existed)`);
    }

    // Step 2: Create user via Admin API (correct way — no raw SQL)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      user_metadata: { full_name: user.fullName },
      email: user.email,
      password: 'demo1234',
      email_confirm: true,  // mark as confirmed immediately
      // Note: Supabase Admin API doesn't support custom UUIDs in all versions
      // We'll handle the ID mismatch below
    });

    if (createErr) {
      console.error(`  ❌ Failed to create auth user: ${createErr.message}`);
      continue;
    }

    const actualId = created.user.id;
    console.log(`  ✅ Auth user created: ${actualId}`);

    // Step 3: Insert role into public.user_roles using service_role (bypasses RLS + trigger)
    const { error: roleErr } = await supabase
      .from('user_roles')
      .upsert({ user_id: actualId, role: user.role, full_name: user.fullName }, 
               { onConflict: 'user_id' });

    if (roleErr) {
      console.error(`  ❌ Failed to assign role: ${roleErr.message}`);
    } else {
      console.log(`  ✅ Role assigned: ${user.role}`);
    }

    // Step 4: If hospital, create hospital row too
    if (user.role === 'hospital') {
      const { error: hospErr } = await supabase
        .from('hospitals')
        .upsert({
          name: user.fullName,
          email: user.email,
          code: 'HOSP-DEMO',
          user_id: actualId,
        }, { onConflict: 'code' });

      if (hospErr) {
        console.error(`  ❌ Failed to create hospital row: ${hospErr.message}`);
      } else {
        console.log(`  ✅ Hospital row created`);
      }
    }

    // Step 5: Store the actual UUID so Demo.tsx can use it
    console.log(`  📌 Actual UUID: ${actualId} (update Demo.tsx if different from fixed ID)`);
    console.log('');
  }

  // Step 6: Print final state
  console.log('\n📊 Final verification:');
  const { data: roles, error: verifyErr } = await supabase
    .from('user_roles')
    .select('user_id, role, full_name')
    .in('full_name', DEMO_USERS.map(u => u.fullName));

  if (verifyErr) {
    console.error('❌ Verification failed:', verifyErr.message);
  } else {
    console.table(roles);
    console.log('\n✅ Done! Demo accounts ready.');
    console.log('   Password for all accounts: demo1234');
  }
}

run().catch(console.error);
