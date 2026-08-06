import { appConfig } from "../config/env";
import type { MediaItem } from "../types/media";

type MediaSearchResponse = { results: MediaItem[] };

export type TitleDetails = {
  overview: string;
  runtime: number;
  genres: string[];
  seasons: { number: number; name: string; episodeCount: number }[];
  selectedSeason: number | null;
  episodes: {
    id: string;
    number: number;
    title: string;
    runtime: number;
    airDate: string;
    still: string;
  }[];
};

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

export async function getTitleDetails(
  item: MediaItem,
  season?: number,
): Promise<TitleDetails | null> {
  const match = /^tmdb-(movie|tv)-(\d+)$/.exec(item.id);
  if (!match) return null;
  const endpoint = appConfig.apiUrl
    ? `${appConfig.apiUrl}/tmdb-details`
    : "/api/tmdb-details";
  const params = new URLSearchParams({ type: match[1], id: match[2] });
  if (season) params.set("season", String(season));
  const response = await fetch(`${endpoint}?${params.toString()}`);
  if (!response.ok) throw new Error("Title details are unavailable.");
  return (await response.json()) as TitleDetails;
}
