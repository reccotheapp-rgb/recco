import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { appConfig } from "../config/env";
import type { MediaItem } from "../types/media";

export const supabase =
  appConfig.supabaseUrl && appConfig.supabasePublishableKey
    ? createClient(appConfig.supabaseUrl, appConfig.supabasePublishableKey, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export async function ensureGuestSession() {
  if (!supabase) return null;
  const { data: current } = await supabase.auth.getSession();
  if (current.session?.user) return current.session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

export async function syncMediaState(
  item: MediaItem,
  status: "SAVED" | "IN_PROGRESS",
  rating?: number,
) {
  const user = await ensureGuestSession();
  if (!supabase || !user) return;
  await supabase
    .from("media_states")
    .upsert({
      user_id: user.id,
      media_id: item.id,
      media_kind: item.kind,
      title: item.title,
      image_url: item.image,
      status,
      rating,
      updated_at: new Date().toISOString(),
    });
}
