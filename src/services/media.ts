import { appConfig } from "../config/env";
import type { MediaItem } from "../types/media";
import { getCatalogAccessToken } from "./supabase";

type MediaSearchResponse = { results: MediaItem[] };

async function mediaCatalog(
  action: "discover" | "search" | "books" | "details",
  params: Record<string, string> = {},
) {
  const token = await getCatalogAccessToken();
  if (!token) throw new Error("Recco could not start a secure session.");
  const query = new URLSearchParams({ action, ...params });
  const response = await fetch(
    `${appConfig.supabaseUrl}/functions/v1/media-catalog?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: appConfig.supabasePublishableKey,
      },
    },
  );
  if (!response.ok) throw new Error("Recco's media service is temporarily unavailable.");
  return response.json() as Promise<unknown>;
}

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

  const data = (await mediaCatalog("search", { q: query.trim() })) as MediaSearchResponse;
  return data.results;
}

export async function getTrendingMedia(page = 1): Promise<MediaItem[]> {
  return ((await mediaCatalog("discover", { page: String(page) })) as MediaSearchResponse).results;
}

export async function getBookRecommendations(query = "subject:fiction"): Promise<MediaItem[]> {
  return ((await mediaCatalog("books", { q: query })) as MediaSearchResponse).results;
}

export async function getTitleDetails(
  item: MediaItem,
  season?: number,
): Promise<TitleDetails | null> {
  const match = /^tmdb-(movie|tv)-(\d+)$/.exec(item.id);
  if (!match) return null;
  const params: Record<string, string> = { type: match[1], id: match[2] };
  if (season) params.season = String(season);
  return (await mediaCatalog("details", params)) as TitleDetails;
}
