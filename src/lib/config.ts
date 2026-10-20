/**
 * Build-time configuration, inlined into the client bundle.
 *
 * The Supabase URL and anon/publishable key are public by design -- they
 * identify the project and nothing more. What anyone is allowed to do is
 * decided by the row-level security policies in `supabase/schema.sql`, which
 * Postgres enforces and the browser cannot talk its way around.
 */

export const config = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  /**
   * Which signed-in account counts as the admin. This drives the UI only --
   * the same address lives in admin_email() in the schema, and that copy is
   * the one that is enforced.
   */
  adminEmail: process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
};

/** Human-readable list of what is missing, for the setup banner. */
export function configProblems(): string[] {
  const problems: string[] = [];
  if (!config.supabaseUrl) problems.push("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!config.supabaseAnonKey) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  if (!config.adminEmail) problems.push("NEXT_PUBLIC_ADMIN_EMAIL is not set");
  return problems;
}
