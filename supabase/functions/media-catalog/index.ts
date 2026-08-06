import { createClient } from "npm:@supabase/supabase-js@2";

const TMDB = "https://api.themoviedb.org/3";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

type TmdbItem = Record<string, unknown>;

function mediaItem(item: TmdbItem) {
  const mediaType = item.media_type === "tv" ? "tv" : "movie";
  return {
    id: `tmdb-${mediaType}-${item.id}`,
    kind: mediaType === "tv" ? "SHOW" : "FILM",
    title: String(item.title ?? item.name ?? "Untitled"),
    by: mediaType === "tv" ? "TV series" : "Film",
    year: String(item.release_date ?? item.first_air_date ?? "").slice(0, 4) || "—",
    image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
    note: String(item.overview ?? ""),
    score: Number(item.vote_average ?? 0),
  };
}

async function requireUser(request: Request) {
  const auth = request.headers.get("Authorization");
  const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  if (!auth || !keys.default) return false;
  const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", keys.default, {
    global: { headers: { Authorization: auth } },
  });
  const token = auth.replace("Bearer ", "");
  const { data, error } = await client.auth.getUser(token);
  return Boolean(data.user && !error);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  if (!(await requireUser(request))) return Response.json({ error: "Sign in required" }, { status: 401, headers: corsHeaders });

  const token = Deno.env.get("TMDB_READ_ACCESS_TOKEN");
  if (!token) return Response.json({ error: "TMDB is not configured" }, { status: 503, headers: corsHeaders });
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "discover";
  const page = Math.min(100, Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1));
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  if (action === "discover") {
    const upstream = await fetch(`${TMDB}/trending/all/week?language=en-US&page=${page}`, { headers });
    if (!upstream.ok) return Response.json({ results: [] }, { status: 502, headers: corsHeaders });
    const data = (await upstream.json()) as { results?: TmdbItem[] };
    return Response.json({ results: (data.results ?? []).filter((item) => item.media_type === "movie" || item.media_type === "tv").map(mediaItem) }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" } });
  }

  if (action === "search") {
    const query = url.searchParams.get("q")?.trim();
    if (!query) return Response.json({ error: "A search query is required" }, { status: 400, headers: corsHeaders });
    const upstream = await fetch(`${TMDB}/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US`, { headers });
    if (!upstream.ok) return Response.json({ error: "TMDB search is unavailable" }, { status: 502, headers: corsHeaders });
    const data = (await upstream.json()) as { results?: TmdbItem[] };
    return Response.json({ results: (data.results ?? []).filter((item) => item.media_type === "movie" || item.media_type === "tv").slice(0, 20).map(mediaItem) }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" } });
  }

  const type = url.searchParams.get("type") === "tv" ? "tv" : "movie";
  const id = url.searchParams.get("id") ?? "";
  if (!/^\d+$/.test(id)) return Response.json({ error: "A valid title is required" }, { status: 400, headers: corsHeaders });
  const titleResponse = await fetch(`${TMDB}/${type}/${id}?language=en-US`, { headers });
  if (!titleResponse.ok) return Response.json({ error: "TMDB details are unavailable" }, { status: 502, headers: corsHeaders });
  const title = (await titleResponse.json()) as TmdbItem;
  const seasons = Array.isArray(title.seasons) ? (title.seasons as TmdbItem[]).filter((season) => Number(season.season_number) > 0).map((season) => ({ number: Number(season.season_number), name: String(season.name ?? `Season ${season.season_number}`), episodeCount: Number(season.episode_count ?? 0) })) : [];
  const requestedSeason = Number(url.searchParams.get("season") ?? 1);
  const season = seasons.some((entry) => entry.number === requestedSeason) ? requestedSeason : seasons[0]?.number;
  const episodeRuntime = Array.isArray(title.episode_run_time) ? Number(title.episode_run_time[0] ?? 0) : 0;
  let episodes: TmdbItem[] = [];
  if (type === "tv" && season) {
    const seasonResponse = await fetch(`${TMDB}/tv/${id}/season/${season}?language=en-US`, { headers });
    if (seasonResponse.ok) episodes = ((await seasonResponse.json()) as { episodes?: TmdbItem[] }).episodes ?? [];
  }
  return Response.json({
    overview: String(title.overview ?? ""),
    runtime: Number(title.runtime ?? episodeRuntime),
    genres: Array.isArray(title.genres) ? (title.genres as TmdbItem[]).map((genre) => String(genre.name)).slice(0, 3) : [],
    seasons,
    selectedSeason: season ?? null,
    episodes: episodes.map((episode) => ({ id: `tmdb-tv-${id}-s${season}-e${episode.episode_number}`, number: Number(episode.episode_number ?? 0), title: String(episode.name ?? "Untitled episode"), runtime: Number(episode.runtime ?? episodeRuntime), airDate: String(episode.air_date ?? ""), still: episode.still_path ? `https://image.tmdb.org/t/p/w500${episode.still_path}` : "" })),
  }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=86400" } });
});
