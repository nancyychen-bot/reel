import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: friendId } = await params;

  // Verify caller is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Fetch friend's liked swipes (bypass RLS)
  const { data: swipes } = await admin
    .from("swipes")
    .select("imdb_id")
    .eq("user_id", friendId)
    .eq("direction", "like");

  if (!swipes || swipes.length === 0) return Response.json({ films: [] });

  const imdbIds = swipes.map((s: { imdb_id: string }) => s.imdb_id);

  const { data: movies } = await admin
    .from("movies")
    .select("tmdb_id, imdb_id, title, year, poster_url, director, runtime_minutes, genres, plot, tmdb_rating")
    .in("imdb_id", imdbIds);

  const films = (movies ?? []).map((m: any) => ({
    tmdbId:     m.tmdb_id,
    imdbId:     m.imdb_id,
    title:      m.title,
    year:       m.year,
    posterUrl:  m.poster_url,
    director:   m.director,
    runtime:    m.runtime_minutes,
    genres:     m.genres,
    plot:       m.plot,
    tmdbRating: m.tmdb_rating,
  }));

  return Response.json({ films });
}
