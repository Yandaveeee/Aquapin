-- ==========================================
-- Step 7: Account-Scoped Pond Data RLS
-- ==========================================
-- Run this in Supabase SQL Editor after step6_profile_repair.sql.
--
-- This script changes field-staff read access from "all staff can see all
-- ponds" to "field staff can only see records owned by their auth user".
-- The same account can still see its records on multiple devices after sync.

BEGIN;

CREATE OR REPLACE FUNCTION public.user_owns_pond(target_pond_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ponds
    WHERE id = target_pond_id
      AND created_by = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.user_owns_pond(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_owns_pond(UUID) TO authenticated;

DROP POLICY IF EXISTS "Approved staff can view ponds" ON public.ponds;
CREATE POLICY "Approved staff can view ponds"
ON public.ponds
FOR SELECT
TO authenticated
USING (
  public.is_approved_staff()
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Approved staff can view mortality logs" ON public.mortality_logs;
DROP POLICY IF EXISTS "Approved staff can create mortality logs" ON public.mortality_logs;
CREATE POLICY "Approved staff can view mortality logs"
ON public.mortality_logs
FOR SELECT
TO authenticated
USING (
  public.is_approved_staff()
  AND logged_by = auth.uid()
  AND public.user_owns_pond(pond_id)
);

CREATE POLICY "Approved staff can create mortality logs"
ON public.mortality_logs
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND logged_by = auth.uid()
  AND (public.is_admin() OR public.user_owns_pond(pond_id))
);

DROP POLICY IF EXISTS "Approved staff can view harvests" ON public.harvests;
DROP POLICY IF EXISTS "Approved staff can create harvests" ON public.harvests;
CREATE POLICY "Approved staff can view harvests"
ON public.harvests
FOR SELECT
TO authenticated
USING (
  public.is_approved_staff()
  AND harvested_by = auth.uid()
  AND public.user_owns_pond(pond_id)
);

CREATE POLICY "Approved staff can create harvests"
ON public.harvests
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND harvested_by = auth.uid()
  AND (public.is_admin() OR public.user_owns_pond(pond_id))
);

DROP POLICY IF EXISTS "Approved staff can view stocking logs" ON public.stocking_logs;
DROP POLICY IF EXISTS "Approved staff can create stocking logs" ON public.stocking_logs;
CREATE POLICY "Approved staff can view stocking logs"
ON public.stocking_logs
FOR SELECT
TO authenticated
USING (
  public.is_approved_staff()
  AND stocked_by = auth.uid()
  AND public.user_owns_pond(pond_id)
);

CREATE POLICY "Approved staff can create stocking logs"
ON public.stocking_logs
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND stocked_by = auth.uid()
  AND (public.is_admin() OR public.user_owns_pond(pond_id))
);

DROP POLICY IF EXISTS "Approved staff can view pond history" ON public.pond_history;
DROP POLICY IF EXISTS "Approved staff can create pond history" ON public.pond_history;
CREATE POLICY "Approved staff can view pond history"
ON public.pond_history
FOR SELECT
TO authenticated
USING (
  public.is_approved_staff()
  AND recorded_by = auth.uid()
  AND public.user_owns_pond(pond_id)
);

CREATE POLICY "Approved staff can create pond history"
ON public.pond_history
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND recorded_by = auth.uid()
  AND (public.is_admin() OR public.user_owns_pond(pond_id))
);

COMMIT;

-- Optional validation after logging in as a field-staff user:
-- SELECT COUNT(*) FROM public.ponds;
-- The count should only include ponds where created_by = auth.uid().
