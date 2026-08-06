import type { VercelRequest, VercelResponse } from "@vercel/node";

const TMDB_BASE = "https://api.themoviedb.org/3";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== "GET")
    return response.status(405).json({ error: "Method not allowed" });

  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const query =
    typeof request.query.q === "string" ? request.query.q.trim() : "";
  if (!token)
    return response.status(503).json({ error: "TMDB is not configured yet." });
  if (!query)
    return response.status(400).json({ error: "A search query is required." });

  const tmdbResponse = await fetch(
    `${TMDB_BASE}/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    },
  );
  if (!tmdbResponse.ok)
    return response
      .status(502)
      .json({ error: "TMDB search is temporarily unavailable." });

  const payload = (await tmdbResponse.json()) as {
    results?: Array<Record<string, unknown>>;
  };
  const results = (payload.results ?? [])
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .slice(0, 20)
    .map((item) => ({
      id: `tmdb-${item.media_type}-${item.id}`,
      kind: item.media_type === "tv" ? "SHOW" : "FILM",
      title: String(item.title ?? item.name ?? "Untitled"),
      by: item.media_type === "tv" ? "TV series" : "Film",
      year:
        String(item.release_date ?? item.first_air_date ?? "").slice(0, 4) ||
        "—",
      image: item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=85",
      note: String(item.overview ?? ""),
    }));

  response.setHeader(
    "Cache-Control",
    "s-maxage=3600, stale-while-revalidate=86400",
  );
  return response.status(200).json({ results });
}
