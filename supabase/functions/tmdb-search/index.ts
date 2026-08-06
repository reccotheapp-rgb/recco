const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TmdbItem = {
  id: number;
  media_type?: 'movie' | 'tv';
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();
  const token = Deno.env.get('TMDB_READ_ACCESS_TOKEN');

  if (!query) return Response.json({ results: [] }, { headers: corsHeaders });
  if (!token) return Response.json({ error: 'TMDB is not configured.' }, { status: 503, headers: corsHeaders });

  const tmdbResponse = await fetch(`https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
  });

  if (!tmdbResponse.ok) return Response.json({ error: 'Media search failed.' }, { status: 502, headers: corsHeaders });

  const payload = await tmdbResponse.json() as { results: TmdbItem[] };
  const results = payload.results
    .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
    .slice(0, 20)
    .map((item) => ({
      id: `tmdb:${item.media_type}:${item.id}`,
      kind: item.media_type === 'tv' ? 'SHOW' : 'FILM',
      title: item.title ?? item.name ?? 'Untitled',
      by: item.media_type === 'tv' ? 'TV series' : 'Film',
      year: (item.release_date ?? item.first_air_date ?? '').slice(0, 4),
      image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
      note: item.overview ?? '',
    }));

  return Response.json({ results }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
