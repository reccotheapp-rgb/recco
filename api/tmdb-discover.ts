import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (request.method !== "GET")
    return response.status(405).json({ error: "Method not allowed" });
  if (!token) return response.status(503).json({ results: [] });
  const page = Math.min(
    100,
    Math.max(1, Number(typeof request.query.page === "string" ? request.query.page : 1) || 1),
  );
  const upstream = await fetch(
    `https://api.themoviedb.org/3/trending/all/week?language=en-US&page=${page}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!upstream.ok) return response.status(502).json({ results: [] });
  const data = (await upstream.json()) as {
    results?: Array<Record<string, unknown>>;
  };
  const results = (data.results ?? [])
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
        : "",
      note: String(item.overview ?? ""),
      score: Number(item.vote_average ?? 0),
    }));
  response.setHeader("Cache-Control", "s-maxage=3600");
  return response.status(200).json({ results });
}
