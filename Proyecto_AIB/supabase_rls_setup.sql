-- ============================================================================
-- AIB+ SaaS Engine — Supabase Database Setup
-- ============================================================================
-- Run this SQL in the Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- This script creates the `proyectos` table with JSONB payload storage and
-- enables Row Level Security (RLS) to ensure multi-tenant data isolation.
-- ============================================================================

-- 1. Create the `proyectos` table
-- --------------------------------
-- Each row stores a project package submitted through the AIB+ form engine.
-- The `payload` column uses JSONB to store the full PaqueteProyecto structure,
-- giving us schema flexibility as the product evolves.
CREATE TABLE IF NOT EXISTS proyectos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Create an index on user_id for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_proyectos_user_id ON proyectos(user_id);

-- 3. Create an index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_proyectos_created_at ON proyectos(created_at DESC);

-- 4. Enable Row Level Security (RLS) on the table
-- ------------------------------------------------
-- This is the CRITICAL step for multi-tenant isolation.
-- Without RLS, any authenticated user could read/write ALL rows.
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policy: Users can only SELECT their own rows
CREATE POLICY "Users can view own projects"
  ON proyectos
  FOR SELECT
  USING (auth.uid() = user_id);

-- 6. RLS Policy: Users can only INSERT rows for themselves
CREATE POLICY "Users can insert own projects"
  ON proyectos
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 7. RLS Policy: Users can only UPDATE their own rows
CREATE POLICY "Users can update own projects"
  ON proyectos
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. RLS Policy: Users can only DELETE their own rows
CREATE POLICY "Users can delete own projects"
  ON proyectos
  FOR DELETE
  USING (auth.uid() = user_id);

-- 9. Auto-update `updated_at` timestamp on row modification
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON proyectos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VERIFICATION: After running this script, verify in the Supabase Dashboard:
--   1. Table Editor > proyectos table exists with columns: id, user_id, payload, created_at, updated_at
--   2. Authentication > Policies > 4 RLS policies should be listed for `proyectos`
--   3. Try inserting a row without auth — it should be DENIED
-- ============================================================================
