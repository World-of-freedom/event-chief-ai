import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? import.meta.env.VITE_SUPABASE_KEY
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

const hasPlaceholderValue = (value: string | undefined) => !value || value.includes("your-project") || value.includes("your-key") || value.includes("your-anon");

export const isSupabaseConfigured = !hasPlaceholderValue(supabaseUrl) && !hasPlaceholderValue(supabaseKey);

/**
 * Browser-only client. Its publishable/anon key is safe to expose; service-role
 * credentials must never be added to Vite environment variables.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
