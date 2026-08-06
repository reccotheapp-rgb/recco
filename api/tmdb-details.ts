import type { VercelRequest, VercelResponse } from "@vercel/node";

const TMDB_BASE = "https://api.themoviedb.org/3";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== "GET")
    return response.status(405).json({ error: "Method not allowed" });

  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const type = request.query.type === "tv" ? "tv" : "movie";
  const id = typeof request.query.id === "string" ? request.query.id : "";
  const requestedSeason = Number(request.query.season ?? 1);
  if (!token || !/^\d+$/.test(id))
    return response.status(400).json({ error: "A valid title is required." });

  const titleResponse = await fetch(
    `${TMDB_BASE}/${type}/${id}?language=en-US`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  if (!titleResponse.ok)
    return response.status(502).json({ error: "TMDB title details are unavailable." });

  const title = (await titleResponse.json()) as Record<string, unknown>;
  const episodeRuntime = Array.isArray(title.episode_run_time)
    ? Number(title.episode_run_time[0] ?? 0)
    : 0;
  const seasons = Array.isArray(title.seasons)
    ? (title.seasons as Array<Record<string, unknown>>)
        .filter((season) => Number(season.season_number) > 0)
        .map((season) => ({
          number: Number(season.season_number),
          name: String(season.name ?? `Season ${season.season_number}`),
          episodeCount: Number(season.episode_count ?? 0),
        }))
    : [];
  const season = seasons.some((entry) => entry.number === requestedSeason)
    ? requestedSeason
    : seasons[0]?.number;

  let episodes: Array<Record<string, unknown>> = [];
  if (type === "tv" && season) {
    const seasonResponse = await fetch(
      `${TMDB_BASE}/tv/${id}/season/${season}?language=en-US`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );
    if (seasonResponse.ok) {
      const seasonData = (await seasonResponse.json()) as { episodes?: Array<Record<string, unknown>> };
      episodes = seasonData.episodes ?? [];
    }
  }

  response.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
  return response.status(200).json({
    overview: String(title.overview ?? ""),
    runtime: Number(title.runtime ?? episodeRuntime),
    genres: Array.isArray(title.genres)
      ? (title.genres as Array<Record<string, unknown>>).map((genre) => String(genre.name)).slice(0, 3)
      : [],
    seasons,
    selectedSeason: season ?? null,
    episodes: episodes.map((episode) => ({
      id: `tmdb-tv-${id}-s${season}-e${episode.episode_number}`,
      number: Number(episode.episode_number ?? 0),
      title: String(episode.name ?? "Untitled episode"),
      runtime: Number(episode.runtime ?? episodeRuntime),
      airDate: String(episode.air_date ?? ""),
      still: episode.still_path
        ? `https://image.tmdb.org/t/p/w500${episode.still_path}`
        : "",
    })),
  });
}
