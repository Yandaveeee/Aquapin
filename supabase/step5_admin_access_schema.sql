-- ==========================================
-- Step 5: Admin Access Audit + Admin RPCs
-- ==========================================
-- Run this after step1/step2/step3/step4.

CREATE TABLE IF NOT EXISTS public.admin_access_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES public.public_profiles(id) ON DELETE CASCADE,
  previous_status public.user_status NOT NULL,
  new_status public.user_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.public_profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  CONSTRAINT admin_access_audit_transition_check CHECK (previous_status <> new_status)
);

CREATE INDEX IF NOT EXISTS idx_admin_access_audit_target_user
  ON public.admin_access_audit (target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_access_audit_changed_at
  ON public.admin_access_audit (changed_at DESC);

ALTER TABLE public.admin_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read access audit" ON public.admin_access_audit;
DROP POLICY IF EXISTS "Admins can insert access audit" ON public.admin_access_audit;

CREATE POLICY "Admins can read access audit"
ON public.admin_access_audit
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert access audit"
ON public.admin_access_audit
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() AND changed_by = auth.uid());

CREATE OR REPLACE FUNCTION public.admin_approve_staff(target_user_id UUID, notes TEXT DEFAULT NULL)
RETURNS public.public_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
  actor_profile public.public_profiles%ROWTYPE;
  target_profile public.public_profiles%ROWTYPE;
  updated_profile public.public_profiles%ROWTYPE;
BEGIN
  actor_id := auth.uid();

  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO actor_profile
  FROM public.public_profiles
  WHERE id = actor_id;

  IF NOT FOUND OR actor_profile.role <> 'admin' OR actor_profile.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved admins can approve staff accounts';
  END IF;

  SELECT * INTO target_profile
  FROM public.public_profiles
  WHERE id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile not found';
  END IF;

  IF target_profile.role <> 'field_staff' THEN
    RAISE EXCEPTION 'Only field staff accounts can be approved';
  END IF;

  IF target_profile.status <> 'pending' THEN
    RAISE EXCEPTION 'Profile status is "%", expected "pending"', target_profile.status;
  END IF;

  UPDATE public.public_profiles
  SET status = 'approved',
      updated_at = NOW()
  WHERE id = target_profile.id
  RETURNING * INTO updated_profile;

  INSERT INTO public.admin_access_audit (
    target_user_id,
    previous_status,
    new_status,
    changed_by,
    changed_at,
    notes
  )
  VALUES (
    updated_profile.id,
    target_profile.status,
    updated_profile.status,
    actor_id,
    NOW(),
    NULLIF(BTRIM(notes), '')
  );

  RETURN updated_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_staff(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_staff(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_setting(p_section TEXT, p_value JSONB)
RETURNS public.admin_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
  actor_profile public.public_profiles%ROWTYPE;
  previous_row public.admin_settings%ROWTYPE;
  updated_row public.admin_settings%ROWTYPE;
  had_previous BOOLEAN := FALSE;
BEGIN
  actor_id := auth.uid();

  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO actor_profile
  FROM public.public_profiles
  WHERE id = actor_id;

  IF NOT FOUND OR actor_profile.role <> 'admin' OR actor_profile.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved admins can update settings';
  END IF;

  IF p_section NOT IN ('general', 'operations', 'notifications', 'integrations', 'security') THEN
    RAISE EXCEPTION 'Invalid settings section: %', p_section;
  END IF;

  IF p_value IS NULL THEN
    RAISE EXCEPTION 'Settings value cannot be null';
  END IF;

  SELECT * INTO previous_row
  FROM public.admin_settings
  WHERE section = p_section
  FOR UPDATE;
  had_previous := FOUND;

  IF had_previous THEN
    UPDATE public.admin_settings
    SET value = p_value,
        updated_by = actor_id,
        updated_at = NOW()
    WHERE section = p_section
    RETURNING * INTO updated_row;
  ELSE
    INSERT INTO public.admin_settings (section, value, updated_by, created_at, updated_at)
    VALUES (p_section, p_value, actor_id, NOW(), NOW())
    RETURNING * INTO updated_row;
  END IF;

  INSERT INTO public.admin_settings_audit (
    section,
    previous_value,
    new_value,
    changed_by,
    changed_at
  )
  VALUES (
    updated_row.section,
    CASE WHEN had_previous THEN previous_row.value ELSE NULL END,
    updated_row.value,
    actor_id,
    NOW()
  );

  RETURN updated_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_setting(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_setting(TEXT, JSONB) TO authenticated;
