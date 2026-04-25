-- ==========================================
-- Step 3: Schema Upgrade for Advanced Sync
-- ==========================================
-- Run this in Supabase SQL Editor after step1/step2.
-- This adds missing tables used by the app: stocking_logs and pond_history,
-- plus optional enhanced columns used by UI analytics.

-- Optional pond metadata fields used by app
ALTER TABLE public.ponds
  ADD COLUMN IF NOT EXISTS boundary TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS current_species TEXT,
  ADD COLUMN IF NOT EXISTS current_stock_count INTEGER;

-- Optional enhanced harvest fields used by app
ALTER TABLE public.harvests
  ADD COLUMN IF NOT EXISTS species TEXT,
  ADD COLUMN IF NOT EXISTS is_partial BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fish_count INTEGER;

-- Stocking logs table (missing in step1 schema)
CREATE TABLE IF NOT EXISTS public.stocking_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id UUID NOT NULL REFERENCES public.ponds(id) ON DELETE CASCADE,
  species TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  average_weight_g NUMERIC,
  source TEXT,
  stocked_by UUID NOT NULL REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active'
);

-- Pond history table (missing in step1 schema)
CREATE TABLE IF NOT EXISTS public.pond_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id UUID NOT NULL REFERENCES public.ponds(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  recorded_by UUID NOT NULL REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stocking_logs_pond_id ON public.stocking_logs (pond_id);
CREATE INDEX IF NOT EXISTS idx_stocking_logs_created_at ON public.stocking_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pond_history_pond_id ON public.pond_history (pond_id);
CREATE INDEX IF NOT EXISTS idx_pond_history_created_at ON public.pond_history (created_at DESC);

ALTER TABLE public.stocking_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pond_history ENABLE ROW LEVEL SECURITY;

-- Recreate policies idempotently
DROP POLICY IF EXISTS "Admins can view all stocking logs" ON public.stocking_logs;
DROP POLICY IF EXISTS "Approved staff can view stocking logs" ON public.stocking_logs;
DROP POLICY IF EXISTS "Approved staff can create stocking logs" ON public.stocking_logs;

CREATE POLICY "Admins can view all stocking logs"
ON public.stocking_logs
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Approved staff can view stocking logs"
ON public.stocking_logs
FOR SELECT
TO authenticated
USING (public.is_approved_staff());

CREATE POLICY "Approved staff can create stocking logs"
ON public.stocking_logs
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND stocked_by = auth.uid()
);

DROP POLICY IF EXISTS "Admins can view all pond history" ON public.pond_history;
DROP POLICY IF EXISTS "Approved staff can view pond history" ON public.pond_history;
DROP POLICY IF EXISTS "Approved staff can create pond history" ON public.pond_history;

CREATE POLICY "Admins can view all pond history"
ON public.pond_history
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Approved staff can view pond history"
ON public.pond_history
FOR SELECT
TO authenticated
USING (public.is_approved_staff());

CREATE POLICY "Approved staff can create pond history"
ON public.pond_history
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND recorded_by = auth.uid()
);

-- Realtime publication (ignore if already added)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stocking_logs;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pond_history;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END
$$;

