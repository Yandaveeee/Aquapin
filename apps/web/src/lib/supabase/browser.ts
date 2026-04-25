"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@aquapin/shared";
import { getSupabaseEnv } from "@/lib/supabase/env";

type BrowserClientOptions = {
  storage?: Storage;
};

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createSupabaseBrowserClient(options?: BrowserClientOptions) {
  const { url, anonKey } = getSupabaseEnv();

  if (options?.storage) {
    return createBrowserClient<Database>(url, anonKey, {
      auth: {
        storage: options.storage,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(url, anonKey);
  }

  return browserClient;
}
