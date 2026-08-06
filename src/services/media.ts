import { appConfig } from '../config/env';
import type { MediaItem } from '../types/media';

type MediaSearchResponse = { results: MediaItem[] };

/**
 * The mobile app talks only to Recco's backend. It must never call TMDB
 * directly or include a TMDB credential in the compiled app.
 */
export async function searchMedia(query: string): Promise<MediaItem[]> {
  if (!appConfig.apiUrl || !query.trim()) return [];

  const response = await fetch(`${appConfig.apiUrl}/tmdb-search?q=${encodeURIComponent(query.trim())}`);
  if (!response.ok) throw new Error('Media search is temporarily unavailable.');

  const data = await response.json() as MediaSearchResponse;
  return data.results;
}
