-- ==========================================
-- Step 2: Pond Write Access Fix
-- ==========================================
-- Run this in Supabase SQL Editor for projects where pond inserts are blocked by RLS.

-- 1) Ensure the current user has a profile row and is approved.
-- Replace <YOUR_EMAIL> before running this update.
-- SELECT id, email, role, status FROM public.public_profiles WHERE email = '<YOUR_EMAIL>';
-- UPDATE public.public_profiles
-- SET role = 'field_staff', status = 'approved', updated_at = NOW()
-- WHERE email = '<YOUR_EMAIL>';

-- 2) Make pond INSERT policy explicit and admin-friendly (optional admin write access).
DROP POLICY IF EXISTS "Approved staff can create ponds" ON public.ponds;

CREATE POLICY "Approved staff and admins can create ponds"
ON public.ponds
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_approved_staff() OR public.is_admin())
  AND created_by = auth.uid()
);

-- Optional: allow admins to update/delete pond rows (remove if you want read-only admins).
DROP POLICY IF EXISTS "Admins can update ponds" ON public.ponds;
CREATE POLICY "Admins can update ponds"
ON public.ponds
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete ponds" ON public.ponds;
CREATE POLICY "Admins can delete ponds"
ON public.ponds
FOR DELETE
TO authenticated
USING (public.is_admin());

