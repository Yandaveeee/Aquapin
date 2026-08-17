-- ==========================================
-- Step 8: Feed Inventory + Stocking Planning
-- ==========================================
-- Run this after step1 through step7.
-- Adds persistent admin tables for feed movement logs, inventory levels,
-- and stocking plans used by the web admin console.

BEGIN;

CREATE TABLE IF NOT EXISTS public.feed_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_brand TEXT NOT NULL UNIQUE,
  remaining_bags NUMERIC NOT NULL DEFAULT 0 CHECK (remaining_bags >= 0),
  threshold_bags NUMERIC NOT NULL DEFAULT 20 CHECK (threshold_bags >= 0),
  updated_by UUID REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.feed_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id UUID REFERENCES public.ponds(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'consumption', 'adjustment')),
  feed_brand TEXT NOT NULL,
  quantity_bags NUMERIC NOT NULL CHECK (quantity_bags <> 0),
  notes TEXT,
  logged_by UUID NOT NULL REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stocking_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id UUID NOT NULL REFERENCES public.ponds(id) ON DELETE CASCADE,
  species TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  average_weight_g NUMERIC NOT NULL DEFAULT 0 CHECK (average_weight_g >= 0),
  planned_date DATE NOT NULL,
  feed_budget_bags NUMERIC NOT NULL DEFAULT 0 CHECK (feed_budget_bags >= 0),
  planned_by UUID NOT NULL REFERENCES public.public_profiles(id),
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_logs_created_at ON public.feed_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_logs_pond_id ON public.feed_logs (pond_id);
CREATE INDEX IF NOT EXISTS idx_feed_logs_feed_brand ON public.feed_logs (feed_brand);
CREATE INDEX IF NOT EXISTS idx_stocking_plans_pond_id ON public.stocking_plans (pond_id);
CREATE INDEX IF NOT EXISTS idx_stocking_plans_planned_date ON public.stocking_plans (planned_date);

ALTER TABLE public.feed_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocking_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage feed inventory" ON public.feed_inventory_items;
DROP POLICY IF EXISTS "Admins can read feed inventory" ON public.feed_inventory_items;
CREATE POLICY "Admins can manage feed inventory"
ON public.feed_inventory_items
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage feed logs" ON public.feed_logs;
DROP POLICY IF EXISTS "Admins can read feed logs" ON public.feed_logs;
CREATE POLICY "Admins can manage feed logs"
ON public.feed_logs
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin() AND logged_by = auth.uid());

DROP POLICY IF EXISTS "Admins can manage stocking plans" ON public.stocking_plans;
DROP POLICY IF EXISTS "Admins can read stocking plans" ON public.stocking_plans;
CREATE POLICY "Admins can manage stocking plans"
ON public.stocking_plans
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin() AND planned_by = auth.uid());

INSERT INTO public.feed_inventory_items (feed_brand, remaining_bags, threshold_bags)
VALUES
  ('Tateh Tilapia Pre-Starter', 42, 15),
  ('Sargasso Shrimp Starter', 72, 80)
ON CONFLICT (feed_brand) DO NOTHING;

COMMIT;
