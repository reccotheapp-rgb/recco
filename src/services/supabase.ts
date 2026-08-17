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

export type AccountState = { email: string | null; isAnonymous: boolean };

export async function getAccountState(): Promise<AccountState> {
  const user = await ensureGuestSession();
  return { email: user?.email ?? null, isAnonymous: Boolean(user?.is_anonymous) };
}

export async function requestAccountUpgrade(email: string) {
  const user = await ensureGuestSession();
  if (!supabase || !user) throw new Error("Recco could not start a secure session.");
  const { error } = await supabase.auth.updateUser(
    { email: email.trim().toLowerCase() },
    { emailRedirectTo: "recco://auth/callback" },
  );
  if (error) throw error;
}

export async function completeAccountRedirect(url: string) {
  if (!supabase || !url.startsWith("recco://auth/callback")) return false;
  const { error } = await supabase.auth.exchangeCodeForSession(url);
  if (error) throw error;
  return true;
}

export type MediaStatus = "SAVED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" | "DROPPED";

type MediaSyncOptions = {
  rating?: number;
  progress?: Record<string, boolean>;
  tracking?: Record<string, unknown>;
};

export type StoredMediaState = {
  media_id: string;
  media_kind: MediaItem["kind"];
  title: string;
  image_url: string | null;
  status: MediaStatus;
  rating: number | null;
  progress: Record<string, boolean>;
  metadata: Partial<MediaItem> & { tracking?: Record<string, unknown> };
};

export type MediaReview = {
  media_id: string;
  body: string;
  rating: number | null;
};

export type EpisodeReview = {
  media_id: string;
  season_number: number;
  episode_number: number;
  body: string;
  rating: number | null;
};

export type TasteAction = "LOVE" | "SAVE" | "PASS" | "NOT_FOR_ME";

const actionWeights: Record<TasteAction, number> = {
  LOVE: 4,
  SAVE: 2,
  PASS: -1,
  NOT_FOR_ME: -4,
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
      metadata: {
        kind: item.kind,
        title: item.title,
        by: item.by,
        year: item.year,
        image: item.image,
        note: item.note,
        score: item.score ?? null,
        genres: item.genres ?? [],
        tracking: options.tracking ?? {},
      },
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

export async function loadMediaStates(): Promise<StoredMediaState[]> {
  const user = await ensureGuestSession();
  if (!supabase || !user) return [];
  const { data, error } = await supabase
    .from("media_states")
    .select("media_id, media_kind, title, image_url, status, rating, progress, metadata")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoredMediaState[];
}

export async function syncSwipeAction(item: MediaItem, action: TasteAction, vibes: string[] = []) {
  const user = await ensureGuestSession();
  if (!supabase || !user) return;
  const metadata = {
    genres: item.genres ?? [],
    year: item.year,
    score: item.score ?? null,
    vibes,
  };
  const { error } = await supabase.from("swipe_actions").upsert({
    user_id: user.id,
    media_id: item.id,
    action,
    media_kind: item.kind,
    metadata,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;

  const { data: profile, error: profileError } = await supabase
    .from("taste_profiles")
    .select("feature_weights")
    .maybeSingle();
  if (profileError) throw profileError;
  const weights: Record<string, number> = { ...(profile?.feature_weights ?? {}) };
  const weight = actionWeights[action];
  const features = [`kind:${item.kind}`, ...(item.genres ?? []), ...vibes.map((vibe) => `vibe:${vibe}`)];
  for (const feature of features) {
    weights[feature] = Math.max(-20, Math.min(20, (weights[feature] ?? 0) + weight));
  }
  const { error: upsertError } = await supabase.from("taste_profiles").upsert({
    user_id: user.id,
    feature_weights: weights,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) throw upsertError;
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

export async function loadTasteProfile(): Promise<Record<string, number>> {
  const user = await ensureGuestSession();
  if (!supabase || !user) return {};
  const { data, error } = await supabase
    .from("taste_profiles")
    .select("feature_weights")
    .maybeSingle();
  if (error) throw error;
  return (data?.feature_weights ?? {}) as Record<string, number>;
}

export async function seedTasteProfile(features: string[]) {
  const user = await ensureGuestSession();
  if (!supabase || !user || !features.length) return;
  const { data: profile, error } = await supabase
    .from("taste_profiles")
    .select("feature_weights")
    .maybeSingle();
  if (error) throw error;
  const weights: Record<string, number> = { ...(profile?.feature_weights ?? {}) };
  for (const feature of features) weights[feature] = Math.min(20, (weights[feature] ?? 0) + 2);
  const { error: upsertError } = await supabase.from("taste_profiles").upsert({
    user_id: user.id,
    feature_weights: weights,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) throw upsertError;
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

export async function loadMediaReview(mediaId: string): Promise<MediaReview | null> {
  const user = await ensureGuestSession();
  if (!supabase || !user) return null;
  const { data, error } = await supabase
    .from("media_reviews")
    .select("media_id, body, rating")
    .eq("media_id", mediaId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as MediaReview | null;
}

export async function saveMediaReview(review: MediaReview) {
  const user = await ensureGuestSession();
  if (!supabase || !user) return;
  const { error } = await supabase.from("media_reviews").upsert({
    ...review,
    user_id: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
