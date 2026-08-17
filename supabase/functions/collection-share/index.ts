import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Cache-Control": "public, max-age=300" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return Response.json({ error: "Invalid collection link" }, { status: 400, headers });
  }
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const key = keys.default;
  if (!key) return Response.json({ error: "Service unavailable" }, { status: 503, headers });
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", key);
  const { data: collection } = await admin
    .from("collections")
    .select("id, title, description")
    .eq("share_token", token)
    .eq("visibility", "UNLISTED")
    .maybeSingle();
  if (!collection) return Response.json({ error: "This collection is private or unavailable" }, { status: 404, headers });
  const { data: items } = await admin
    .from("collection_items")
    .select("media_snapshot, position")
    .eq("collection_id", collection.id)
    .order("position", { ascending: true });
  return Response.json({ title: collection.title, description: collection.description, items: (items ?? []).map((item) => item.media_snapshot) }, { headers });
});
