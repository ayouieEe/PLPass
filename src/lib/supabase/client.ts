import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDataSource } from "@/lib/config/dataSource";
import type { Database } from "@/lib/supabase/database.types";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseConfig(): SupabaseConfig {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, or use VITE_DATA_SOURCE=mock."
    );
  }

  return { url, anonKey };
}

export function getSupabaseBrowserClient() {
  if (getDataSource() !== "supabase") {
    throw new Error("Supabase client requested while VITE_DATA_SOURCE is not supabase.");
  }

  if (!browserClient) {
    const config = getSupabaseConfig();
    browserClient = createClient<Database>(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  return browserClient;
}

export function resetSupabaseBrowserClientForTests() {
  browserClient = null;
}
