/**
 * Only public, non-secret values belong in Expo environment variables.
 * TMDB credentials remain in Supabase Edge Function secrets.
 */
export const appConfig = {
  supabaseUrl:
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    "https://oyxlkowptykomtvaybhc.supabase.co",
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "sb_publishable_lLs5FIsjT5fNJN0fXBc23g_A7ocRejy",
};
