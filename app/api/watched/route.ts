import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { tmdbId, film: filmData, rating, review } = await request.json();

  if (!tmdbId || !rating) {
    return Response.json({ error: "Invalid params" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Look up or create the movie record
  let { data: movie } = await supabase
    .from("movies")
    .select("imdb_id")
    .eq("tmdb_id", tmdbId)
    .maybeSingle();

  if (!movie) {
    if (!filmData) return Response.json({ error: "Film not found" }, { status: 404 });
    const admin = createAdminClient();
    const placeholderId = String(tmdbId);
    await admin.from("movies").upsert({
      tmdb_id:    tmdbId,
      imdb_id:    placeholderId,
      title:      filmData.title     ?? "",
      year:       filmData.year      ?? 0,
      poster_url: filmData.posterUrl ?? "",
    }, { onConflict: "tmdb_id" });
    movie = { imdb_id: placeholderId };
  }

  const { error } = await supabase.from("watched").upsert({
    user_id:    user.id,
    imdb_id:    movie.imdb_id,
    watched_at: new Date().toISOString(),
    rating,
    review:     review || null,
  }, { onConflict: "user_id,imdb_id" });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, imdbId: movie.imdb_id });
}
