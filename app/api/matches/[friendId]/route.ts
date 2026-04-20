import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ friendId: string }> }
) {
  const { friendId } = await params;

  // Verify the requesting user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Use admin client to bypass RLS — matches may be invisible when current user is user_b
  const admin = createAdminClient();

  const [ua, ub] = [user.id, friendId].sort();
  const { data: ms } = await admin
    .from("matches")
    .select("imdb_id, matched_at")
    .eq("user_a", ua)
    .eq("user_b", ub)
    .order("matched_at", { ascending: false });

  const imdbIds = (ms ?? []).map((m: any) => m.imdb_id);
  let movies: any[] = [];
  if (imdbIds.length > 0) {
    const { data } = await admin
      .from("movies")
      .select("tmdb_id, imdb_id, title, year, poster_url, director, runtime_minutes, genres, plot, tmdb_rating")
      .in("imdb_id", imdbIds);
    movies = data ?? [];
  }

  const movieMap = new Map(movies.map(m => [m.imdb_id, m]));
  const matches = (ms ?? []).map((m: any) => {
    const mv = movieMap.get(m.imdb_id);
    return {
      imdb_id:    m.imdb_id,
      tmdbId:     mv?.tmdb_id,
      title:      mv?.title ?? m.imdb_id,
      year:       mv?.year ?? 0,
      posterUrl:  mv?.poster_url ?? "",
      director:   mv?.director ?? "",
      runtime:    mv?.runtime_minutes ?? 0,
      genres:     mv?.genres ?? [],
      plot:       mv?.plot ?? "",
      tmdbRating: mv?.tmdb_rating ?? 0,
      matchedAt:  m.matched_at,
    };
  });

  return Response.json({ matches });
}
