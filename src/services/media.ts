import { appConfig } from "../config/env";
import type { MediaItem } from "../types/media";

type MediaSearchResponse = { results: MediaItem[] };

/**
 * The mobile app talks only to Recco's backend. It must never call TMDB
 * directly or include a TMDB credential in the compiled app.
 */
export async function searchMedia(query: string): Promise<MediaItem[]> {
  if (!query.trim()) return [];

  const endpoint = appConfig.apiUrl
    ? `${appConfig.apiUrl}/tmdb-search`
    : "/api/tmdb-search";
  const response = await fetch(
    `${endpoint}?q=${encodeURIComponent(query.trim())}`,
  );
  if (!response.ok) throw new Error("Media search is temporarily unavailable.");

  const data = (await response.json()) as MediaSearchResponse;
  return data.results;
}

export async function getTrendingMedia(): Promise<MediaItem[]> {
  const endpoint = appConfig.apiUrl
    ? `${appConfig.apiUrl}/tmdb-discover`
    : "/api/tmdb-discover";
  const response = await fetch(endpoint);
  if (!response.ok) return [];
  return ((await response.json()) as MediaSearchResponse).results;
}
