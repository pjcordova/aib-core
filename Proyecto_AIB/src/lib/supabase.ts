import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase Client — AIB+ SaaS Engine
// ---------------------------------------------------------------------------
// The VITE_ prefix is mandatory so Vite exposes these to the browser bundle.
// The anon key is safe for client-side: Row Level Security (RLS) on the
// database ensures each user can only access their own rows.
// ---------------------------------------------------------------------------

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[AIB+] Missing Supabase environment variables. ' +
    'Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
