-- ==========================================
-- Step 6: Profile Repair + No-Approval Sync
-- ==========================================
-- Run this in Supabase SQL Editor when you want field staff to sync without
-- waiting for admin approval.
--
-- This script:
-- 1) Ensures signup trigger exists and creates public_profiles rows.
-- 2) Backfills any missing public_profiles rows from auth.users.
-- 3) Sets legacy pending field_staff users to approved.
-- 4) Makes field_staff access role-based (not status-based) for RLS helper.
-- 5) Allows authenticated users to insert only their own approved field_staff profile
--    so client-side self-repair can work when trigger setup is incomplete.

BEGIN;

-- Ensure trigger function exists (idempotent).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.public_profiles (id, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, CONCAT('user-', LEFT(NEW.id::text, 8), '@unknown.local')),
    'field_staff',
    'approved'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Ensure auth.users -> public_profiles trigger exists.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- Backfill missing profile rows for already-existing auth users.
INSERT INTO public.public_profiles (id, email, role, status)
SELECT
  u.id,
  COALESCE(u.email, CONCAT('user-', LEFT(u.id::text, 8), '@unknown.local')),
  'field_staff'::public.user_role,
  'approved'::public.user_status
FROM auth.users u
LEFT JOIN public.public_profiles p
  ON p.id = u.id
WHERE p.id IS NULL;

-- Promote legacy pending field_staff records.
UPDATE public.public_profiles
SET status = 'approved',
    updated_at = NOW()
WHERE role = 'field_staff'
  AND status = 'pending';

-- Optional: make default profile status approved for future manual inserts.
ALTER TABLE public.public_profiles
ALTER COLUMN status SET DEFAULT 'approved';

-- Remove status dependency for staff access checks used by RLS policies.
CREATE OR REPLACE FUNCTION public.is_approved_staff()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.public_profiles
    WHERE id = auth.uid()
      AND role = 'field_staff'
  );
$$;

-- Allow safe self-insert fallback from client:
-- user can insert only their own row, only as field_staff + approved.
DROP POLICY IF EXISTS "Users can insert own pending profile" ON public.public_profiles;
DROP POLICY IF EXISTS "Users can insert own approved profile" ON public.public_profiles;
CREATE POLICY "Users can insert own approved profile"
ON public.public_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  AND role = 'field_staff'
  AND status = 'approved'
);

COMMIT;

-- Optional validation query:
-- SELECT u.id, u.email, p.id AS profile_id, p.role, p.status
-- FROM auth.users u
-- LEFT JOIN public.public_profiles p ON p.id = u.id
-- ORDER BY u.created_at DESC
-- LIMIT 50;
