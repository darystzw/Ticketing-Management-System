// Utility to check if Supabase is properly configured
export function checkSupabaseConfig(): { isValid: boolean; error?: string } {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl) {
    return {
      isValid: false,
      error: 'VITE_SUPABASE_URL is not configured',
    };
  }

  if (!supabaseKey) {
    return {
      isValid: false,
      error: 'VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY is not configured',
    };
  }

  return { isValid: true };
}
