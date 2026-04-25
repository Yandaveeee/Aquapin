-- ==========================================
-- Step 4: Admin Settings + Audit Tables
-- ==========================================
-- Run this after step1/step2/step3.

CREATE TABLE IF NOT EXISTS public.admin_settings (
  section TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.public_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.public_profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_settings_audit_section ON public.admin_settings_audit (section);
CREATE INDEX IF NOT EXISTS idx_admin_settings_audit_changed_at ON public.admin_settings_audit (changed_at DESC);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can upsert settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can read settings audit" ON public.admin_settings_audit;
DROP POLICY IF EXISTS "Admins can insert settings audit" ON public.admin_settings_audit;

CREATE POLICY "Admins can read settings"
ON public.admin_settings
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can upsert settings"
ON public.admin_settings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can read settings audit"
ON public.admin_settings_audit
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert settings audit"
ON public.admin_settings_audit
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() AND changed_by = auth.uid());

