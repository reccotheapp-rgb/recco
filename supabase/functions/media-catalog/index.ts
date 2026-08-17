import { createClient } from "npm:@supabase/supabase-js@2";

const TMDB = "https://api.themoviedb.org/3";
const RAWG = "https://api.rawg.io/api";
const MUSIC_BRAINZ = "https://musicbrainz.org/ws/2";
const AUDIO_DB = "https://www.theaudiodb.com/api/v1/json/123";
const UPSTREAM_TIMEOUT_MS = 10_000;
const MUSIC_BRAINZ_MIN_INTERVAL_MS = 1_050;
let lastMusicBrainzRequestAt = 0;
const movieGenres: Record<number, string> = { 12: "Adventure", 14: "Fantasy", 16: "Animation", 18: "Drama", 27: "Horror", 28: "Action", 35: "Comedy", 36: "History", 37: "Western", 53: "Thriller", 80: "Crime", 99: "Documentary", 878: "Science Fiction", 9648: "Mystery", 10402: "Music", 10749: "Romance", 10751: "Family", 10752: "War" };
const tvGenres: Record<number, string> = { 16: "Animation", 18: "Drama", 35: "Comedy", 37: "Western", 80: "Crime", 99: "Documentary", 9648: "Mystery", 10751: "Family", 10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics" };
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

type TmdbItem = Record<string, unknown>;
type GoogleBooksResponse = { items?: TmdbItem[] };
type RawgResponse = { results?: TmdbItem[] };
type MusicBrainzResponse = { "release-groups"?: TmdbItem[] };

async function upstreamFetch(input: string | URL, init: RequestInit = {}) {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Upstream catalogue request failed", error);
    return null;
  }
}

function mediaItem(item: TmdbItem, forcedType?: "movie" | "tv") {
  const mediaType = forcedType ?? (item.media_type === "tv" ? "tv" : "movie");
  const genreMap = mediaType === "tv" ? tvGenres : movieGenres;
  const genres = Array.isArray(item.genre_ids)
    ? item.genre_ids.map(Number).map((id) => genreMap[id]).filter(Boolean)
    : [];
  return {
    id: `tmdb-${mediaType}-${item.id}`,
    kind: mediaType === "tv" ? "SHOW" : "FILM",
    title: String(item.title ?? item.name ?? "Untitled"),
    by: mediaType === "tv" ? "TV series" : "Film",
    year: String(item.release_date ?? item.first_air_date ?? "").slice(0, 4) || "—",
    image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
    note: String(item.overview ?? ""),
    score: Number(item.vote_average ?? 0),
    genres,
  };
}

function plainText(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bookItem(volume: TmdbItem) {
  const info = (volume.volumeInfo ?? {}) as TmdbItem;
  const images = (info.imageLinks ?? {}) as TmdbItem;
  const authors = Array.isArray(info.authors) ? info.authors.map(String).filter(Boolean) : [];
  const categories = Array.isArray(info.categories) ? info.categories.map(String).filter(Boolean) : [];
  const thumbnail = String(images.thumbnail ?? images.smallThumbnail ?? "").replace(/^http:/, "https:");
  return {
    id: `google-book-${volume.id}`,
    kind: "BOOK",
    title: String(info.title ?? "Untitled book"),
    by: authors.join(", ") || "Unknown author",
    year: String(info.publishedDate ?? "").slice(0, 4) || "—",
    image: thumbnail,
    note: plainText(info.description),
    score: Number(info.averageRating ?? 0),
    genres: categories,
  };
}

// Recco is a leisure-media product. Keep scholarly papers, proceedings and
// reference-heavy titles out of its default catalogue without preventing us
// from adding a deliberate research mode later.
function isConsumerBook(volume: TmdbItem) {
  const info = (volume.volumeInfo ?? {}) as TmdbItem;
  if (String(info.printType ?? "BOOK") !== "BOOK") return false;
  const categories = Array.isArray(info.categories) ? info.categories.map(String).join(" ") : "";
  const searchable = `${info.title ?? ""} ${info.subtitle ?? ""} ${categories}`;
  return !/\b(proceedings|conference|thesis|dissertation|journal|research\s+(paper|report|methods)|academic\s+journal|textbook|study\s+guide|workbook)\b/i.test(searchable);
}

async function searchBooks(query: string, maxResults = 8) {
  const key = Deno.env.get("GOOGLE_BOOKS_API_KEY");
  if (!key) return [];
  const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("printType", "books");
  endpoint.searchParams.set("maxResults", String(Math.min(40, Math.max(1, maxResults))));
  endpoint.searchParams.set("key", key);
  const response = await upstreamFetch(endpoint);
  if (!response?.ok) return [];
  const data = (await response.json()) as GoogleBooksResponse;
  return (data.items ?? []).filter(isConsumerBook).map(bookItem).slice(0, maxResults);
}

function gameItem(game: TmdbItem) {
  const genres = Array.isArray(game.genres)
    ? game.genres.map((genre) => String((genre as TmdbItem).name ?? "")).filter(Boolean)
    : [];
  const platforms = Array.isArray(game.platforms)
    ? game.platforms
        .map((entry) => (entry as TmdbItem).platform as TmdbItem | undefined)
        .map((platform) => String(platform?.name ?? ""))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return {
    id: `rawg-game-${game.id}`,
    kind: "GAME",
    title: String(game.name ?? "Untitled game"),
    by: platforms.join(" · ") || "Game",
    year: String(game.released ?? "").slice(0, 4) || "—",
    image: String(game.background_image ?? ""),
    note: genres.length ? `${genres.slice(0, 3).join(" · ")} game` : "Game",
    score: Number(game.metacritic ?? game.rating ?? 0),
    genres,
  };
}

async function gamesRequest(params: Record<string, string>) {
  const key = Deno.env.get("RAWG_API_KEY");
  if (!key) return [];
  const endpoint = new URL(`${RAWG}/games`);
  endpoint.searchParams.set("key", key);
  Object.entries(params).forEach(([name, value]) => endpoint.searchParams.set(name, value));
  const response = await upstreamFetch(endpoint);
  if (!response?.ok) return [];
  const data = (await response.json()) as RawgResponse;
  return (data.results ?? []).map(gameItem);
}

async function searchGames(query: string, maxResults = 16) {
  return gamesRequest({ search: query, search_precise: "true", page_size: String(maxResults) });
}

async function discoverGames() {
  return gamesRequest({ ordering: "-added", page_size: "20" });
}

async function musicBrainzFetch(endpoint: URL) {
  const wait = Math.max(0, MUSIC_BRAINZ_MIN_INTERVAL_MS - (Date.now() - lastMusicBrainzRequestAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastMusicBrainzRequestAt = Date.now();
  return upstreamFetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Recco/0.3.2 (https://github.com/reccotheapp-rgb/recco)",
    },
  });
}

function albumItem(releaseGroup: TmdbItem) {
  const credit = Array.isArray(releaseGroup["artist-credit"])
    ? releaseGroup["artist-credit"].map((entry) => String((entry as TmdbItem).name ?? "")).filter(Boolean).join(", ")
    : "Unknown artist";
  const tags = Array.isArray(releaseGroup.tags)
    ? releaseGroup.tags.map((entry) => String((entry as TmdbItem).name ?? "")).filter(Boolean).slice(0, 3)
    : [];
  const id = String(releaseGroup.id ?? "");
  return {
    id: `musicbrainz-album-${id}`,
    kind: "ALBUM",
    title: String(releaseGroup.title ?? "Untitled album"),
    by: credit,
    year: String(releaseGroup["first-release-date"] ?? "").slice(0, 4) || "—",
    image: id ? `https://coverartarchive.org/release-group/${id}/front-500` : "",
    note: tags.length ? `${tags.join(" · ")} album` : "Album",
    genres: tags,
  };
}

function audioDbAlbumItem(album: TmdbItem) {
  const genres = String(album.strGenre ?? "").split(/[;,/]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 3);
  return {
    id: `audiodb-album-${album.idAlbum}`,
    kind: "ALBUM",
    title: String(album.strAlbum ?? "Untitled album"),
    by: String(album.strArtist ?? "Unknown artist"),
    year: String(album.intYearReleased ?? "").slice(0, 4) || "—",
    image: String(album.strAlbumThumb ?? ""),
    note: genres.length ? `${genres.join(" · ")} album` : "Album",
    genres,
  };
}

async function searchAlbums(query: string, maxResults = 16) {
  const endpoint = new URL(`${MUSIC_BRAINZ}/release-group`);
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("limit", String(maxResults));
  endpoint.searchParams.set("fmt", "json");
  const response = await musicBrainzFetch(endpoint);
  if (!response?.ok) return [];
  const data = (await response.json()) as MusicBrainzResponse;
  return (data["release-groups"] ?? [])
    .filter((entry) => String(entry["primary-type"] ?? "") === "Album")
    .map(albumItem);
}

async function discoverAlbums() {
  const endpoint = new URL(`${AUDIO_DB}/trending.php`);
  endpoint.searchParams.set("country", "us");
  endpoint.searchParams.set("type", "itunes");
  endpoint.searchParams.set("format", "albums");
  const response = await upstreamFetch(endpoint);
  if (!response?.ok) return [];
  const data = (await response.json()) as TmdbItem;
  const albums = Array.isArray(data.trending) ? data.trending : Array.isArray(data.album) ? data.album : [];
  return albums.map((entry) => audioDbAlbumItem(entry as TmdbItem)).slice(0, 20);
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

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "discover";
  if (action === "games") {
    const games = await discoverGames();
    if (!games.length) return Response.json({ error: "Games are unavailable" }, { status: 502, headers: corsHeaders });
    return Response.json({ results: games }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" } });
  }
  if (action === "albums") {
    const albums = await discoverAlbums();
    if (!albums.length) return Response.json({ error: "Albums are unavailable" }, { status: 502, headers: corsHeaders });
    return Response.json({ results: albums }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" } });
  }

  const token = Deno.env.get("TMDB_READ_ACCESS_TOKEN");
  if (!token) return Response.json({ error: "TMDB is not configured" }, { status: 503, headers: corsHeaders });
  const page = Math.min(100, Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1));
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  if (action === "discover") {
    const upstream = await upstreamFetch(`${TMDB}/trending/all/week?language=en-US&page=${page}`, { headers });
    if (!upstream?.ok) return Response.json({ results: [] }, { status: 502, headers: corsHeaders });
    const data = (await upstream.json()) as { results?: TmdbItem[] };
    return Response.json({ results: (data.results ?? []).filter((item) => item.media_type === "movie" || item.media_type === "tv").map(mediaItem) }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" } });
  }

  if (action === "search") {
    const query = url.searchParams.get("q")?.trim();
    if (!query) return Response.json({ error: "A search query is required" }, { status: 400, headers: corsHeaders });
    const requestedKind = url.searchParams.get("kind") ?? "ALL";
    if (!["ALL", "FILM", "SHOW", "BOOK", "GAME", "ALBUM"].includes(requestedKind)) {
      return Response.json({ error: "An unsupported media type was requested" }, { status: 400, headers: corsHeaders });
    }
    if (requestedKind === "BOOK") {
      const books = await searchBooks(query, 16);
      return Response.json({ results: books }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" } });
    }
    if (requestedKind === "GAME") {
      const games = await searchGames(query);
      return Response.json({ results: games }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" } });
    }
    if (requestedKind === "ALBUM") {
      const albums = await searchAlbums(query);
      return Response.json({ results: albums }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" } });
    }
    const endpoint = requestedKind === "FILM" ? "movie" : requestedKind === "SHOW" ? "tv" : "multi";
    const upstream = await upstreamFetch(`${TMDB}/search/${endpoint}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US`, { headers });
    const data = upstream?.ok ? (await upstream.json()) as { results?: TmdbItem[] } : { results: [] };
    const screenResults = (data.results ?? [])
      .filter((item) => endpoint !== "multi" || item.media_type === "movie" || item.media_type === "tv")
      .slice(0, 12)
      .map((item) => mediaItem(item, requestedKind === "FILM" ? "movie" : requestedKind === "SHOW" ? "tv" : undefined));
    if (!upstream?.ok) return Response.json({ error: "Media search is unavailable" }, { status: 502, headers: corsHeaders });
    return Response.json({ results: screenResults }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" } });
  }

  if (action === "books") {
    const query = url.searchParams.get("q")?.trim() || "subject:fiction";
    const books = await searchBooks(query, 20);
    if (!books.length) return Response.json({ error: "Books are unavailable" }, { status: 502, headers: corsHeaders });
    return Response.json({ results: books }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" } });
  }

  const type = url.searchParams.get("type") === "tv" ? "tv" : "movie";
  const id = url.searchParams.get("id") ?? "";
  if (!/^\d+$/.test(id)) return Response.json({ error: "A valid title is required" }, { status: 400, headers: corsHeaders });
  const titleResponse = await upstreamFetch(`${TMDB}/${type}/${id}?language=en-US`, { headers });
  if (!titleResponse?.ok) return Response.json({ error: "TMDB details are unavailable" }, { status: 502, headers: corsHeaders });
  const title = (await titleResponse.json()) as TmdbItem;
  const seasons = Array.isArray(title.seasons) ? (title.seasons as TmdbItem[]).filter((season) => Number(season.season_number) > 0).map((season) => ({ number: Number(season.season_number), name: String(season.name ?? `Season ${season.season_number}`), episodeCount: Number(season.episode_count ?? 0) })) : [];
  const requestedSeason = Number(url.searchParams.get("season") ?? 1);
  const season = seasons.some((entry) => entry.number === requestedSeason) ? requestedSeason : seasons[0]?.number;
  const episodeRuntime = Array.isArray(title.episode_run_time) ? Number(title.episode_run_time[0] ?? 0) : 0;
  let episodes: TmdbItem[] = [];
  if (type === "tv" && season) {
    const seasonResponse = await upstreamFetch(`${TMDB}/tv/${id}/season/${season}?language=en-US`, { headers });
    if (seasonResponse?.ok) episodes = ((await seasonResponse.json()) as { episodes?: TmdbItem[] }).episodes ?? [];
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
