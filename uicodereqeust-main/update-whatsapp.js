import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const VITE_SUPABASE_URL = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const VITE_SUPABASE_ANON_KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
  console.error("Missing supabase url or key");
  process.exit(1);
}

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Starting DB update for WhatsApp Submissions...");
  const { data, error } = await supabase
    .from('hospital_claims')
    .update({ hospital_name: 'Unknown Hospital' })
    .eq('hospital_name', 'WhatsApp Submission');

  if (error) {
    console.error("Error updating records:", error);
  } else {
    console.log("Successfully updated records.");
  }
}

run();
