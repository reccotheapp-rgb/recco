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

export async function getCatalogAccessToken() {
  const user = await ensureGuestSession();
  if (!supabase || !user) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type MediaStatus = "SAVED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" | "DROPPED";

type MediaSyncOptions = {
  rating?: number;
  progress?: Record<string, boolean>;
};

export type StoredMediaState = {
  media_id: string;
  media_kind: MediaItem["kind"];
  title: string;
  image_url: string | null;
  status: MediaStatus;
  rating: number | null;
  progress: Record<string, boolean>;
};

export type EpisodeReview = {
  media_id: string;
  season_number: number;
  episode_number: number;
  body: string;
  rating: number | null;
};

export async function syncMediaState(
  item: MediaItem,
  status: MediaStatus,
  options: MediaSyncOptions = {},
) {
  const user = await ensureGuestSession();
  if (!supabase || !user) return;
  const { error } = await supabase
    .from("media_states")
    .upsert({
      user_id: user.id,
      media_id: item.id,
      media_kind: item.kind,
      title: item.title,
      image_url: item.image,
      status,
      rating: options.rating,
      progress: options.progress ?? {},
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

export async function loadMediaStates(): Promise<StoredMediaState[]> {
  const user = await ensureGuestSession();
  if (!supabase || !user) return [];
  const { data, error } = await supabase
    .from("media_states")
    .select("media_id, media_kind, title, image_url, status, rating, progress")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoredMediaState[];
}

export async function syncSwipeAction(mediaId: string, action: "KEEP" | "PASS") {
  const user = await ensureGuestSession();
  if (!supabase || !user) return;
  const { error } = await supabase.from("swipe_actions").upsert({
    user_id: user.id,
    media_id: mediaId,
    action,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadSwipeHistory(): Promise<string[]> {
  const user = await ensureGuestSession();
  if (!supabase || !user) return [];
  const { data, error } = await supabase
    .from("swipe_actions")
    .select("media_id")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map((entry) => entry.media_id);
}

export async function loadEpisodeReviews(
  mediaId: string,
  seasonNumber: number,
): Promise<EpisodeReview[]> {
  const user = await ensureGuestSession();
  if (!supabase || !user) return [];
  const { data, error } = await supabase
    .from("episode_reviews")
    .select("media_id, season_number, episode_number, body, rating")
    .eq("media_id", mediaId)
    .eq("season_number", seasonNumber);
  if (error) throw error;
  return (data ?? []) as EpisodeReview[];
}

export async function saveEpisodeReview(review: EpisodeReview) {
  const user = await ensureGuestSession();
  if (!supabase || !user) return;
  const { error } = await supabase.from("episode_reviews").upsert({
    ...review,
    user_id: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
