/**
 * Only public, non-secret values belong in Expo environment variables.
 * TMDB credentials remain in Supabase Edge Function secrets.
 */
export const appConfig = {
  // Native builds cannot use relative `/api` URLs. An Expo variable can override this hosted API.
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "https://recco-dun.vercel.app/api",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
};
