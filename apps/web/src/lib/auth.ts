import type { Database } from "@aquapin/shared";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PublicProfile = Database["public"]["Tables"]["public_profiles"]["Row"];

export async function getCurrentUserAndProfile(): Promise<{
  user: User | null;
  profile: PublicProfile | null;
}> {
  const supabase = (await createSupabaseServerClient()) as any;
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, profile: null as PublicProfile | null };
  }

  const { data: profileData } = await supabase
    .from("public_profiles")
    .select("id, email, role, status, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (profileData ?? null) as PublicProfile | null;

  return {
    user,
    profile,
  };
}

export async function requireApprovedAdmin(): Promise<{
  user: User;
  profile: PublicProfile;
}> {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (!profile || profile.role !== "admin" || profile.status !== "approved") {
    redirect("/forbidden");
  }

  return {
    user: user as User,
    profile: profile as PublicProfile,
  };
}
