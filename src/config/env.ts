/**
 * Only public, non-secret values belong in Expo environment variables.
 * TMDB credentials remain in Supabase Edge Function secrets.
 */
export const appConfig = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
};
