"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

/**
 * Created lazily rather than at module scope: this app is statically exported,
 * so module bodies also run during the build, where there is no browser and
 * nothing to connect to.
 */
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
