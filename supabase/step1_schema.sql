-- ==========================================
-- Step 1: AquaPin Supabase SQL Schema
-- ==========================================

-- Enable PostGIS extension for geospatial data
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;

-- Create custom types for roles and status
CREATE TYPE user_role AS ENUM ('admin', 'field_staff');
CREATE TYPE user_status AS ENUM ('pending', 'approved');

-- 1. Create public_profiles table
CREATE TABLE public.public_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'field_staff',
    status user_status NOT NULL DEFAULT 'approved',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create ponds table for map pins
CREATE TABLE public.ponds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location extensions.geometry(Point, 4326) NOT NULL,
    created_by UUID NOT NULL REFERENCES public.public_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create mortality_logs table
CREATE TABLE public.mortality_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pond_id UUID NOT NULL REFERENCES public.ponds(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    notes TEXT,
    logged_by UUID NOT NULL REFERENCES public.public_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create harvests table
CREATE TABLE public.harvests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pond_id UUID NOT NULL REFERENCES public.ponds(id) ON DELETE CASCADE,
    yield_kg NUMERIC NOT NULL CHECK (yield_kg > 0),
    harvested_by UUID NOT NULL REFERENCES public.public_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- AUTHENTICATION TRIGGERS
-- ==========================================

-- Trigger to create profile on signup with immediate field staff access
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.public_profiles (id, email, role, status)
  VALUES (
    new.id,
    new.email,
    'field_staff', -- Default roles to field staff
    'approved'     -- Allow immediate app access after signup
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ponds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mortality_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvests ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS to prevent recursion and simplify policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.public_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_approved_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.public_profiles
    WHERE id = auth.uid() AND role = 'field_staff'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------
-- 1. Profiles RLS
-- ------------------------------------------
-- Admins can view and update all profiles (for approvals)
CREATE POLICY "Admins can view all profiles" ON public.public_profiles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update profiles" ON public.public_profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON public.public_profiles FOR SELECT TO authenticated USING (id = auth.uid());

-- ------------------------------------------
-- 2. Ponds RLS
-- ------------------------------------------
-- Admins can ONLY read ponds
CREATE POLICY "Admins can view all ponds" ON public.ponds FOR SELECT TO authenticated USING (public.is_admin());

-- Approved staff can read and create ponds
CREATE POLICY "Approved staff can view ponds" ON public.ponds FOR SELECT TO authenticated USING (public.is_approved_staff());
CREATE POLICY "Approved staff can create ponds" ON public.ponds FOR INSERT TO authenticated WITH CHECK (
    public.is_approved_staff() AND created_by = auth.uid()
);

-- ------------------------------------------
-- 3. Mortality Logs RLS
-- ------------------------------------------
-- Admins can ONLY read mortality logs
CREATE POLICY "Admins can view all mortality logs" ON public.mortality_logs FOR SELECT TO authenticated USING (public.is_admin());

-- Approved staff can read and create mortality logs
CREATE POLICY "Approved staff can view mortality logs" ON public.mortality_logs FOR SELECT TO authenticated USING (public.is_approved_staff());
CREATE POLICY "Approved staff can create mortality logs" ON public.mortality_logs FOR INSERT TO authenticated WITH CHECK (
    public.is_approved_staff() AND logged_by = auth.uid()
);

-- ------------------------------------------
-- 4. Harvests RLS
-- ------------------------------------------
-- Admins can ONLY read harvests
CREATE POLICY "Admins can view all harvests" ON public.harvests FOR SELECT TO authenticated USING (public.is_admin());

-- Approved staff can read and create harvests
CREATE POLICY "Approved staff can view harvests" ON public.harvests FOR SELECT TO authenticated USING (public.is_approved_staff());
CREATE POLICY "Approved staff can create harvests" ON public.harvests FOR INSERT TO authenticated WITH CHECK (
    public.is_approved_staff() AND harvested_by = auth.uid()
);
