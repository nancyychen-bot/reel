import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ friendId: string }> }
) {
  const { friendId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Compute matches from swipe intersection — catches all retroactive likes
  // that were never written to the matches table at swipe-time.
  const [{ data: myLikes }, { data: theirLikes }] = await Promise.all([
    supabase.from("swipes").select("imdb_id").eq("user_id", user.id).eq("direction", "like"),
    admin.from("swipes").select("imdb_id").eq("user_id", friendId).eq("direction", "like"),
  ]);

  const mySet = new Set((myLikes ?? []).map((s: any) => s.imdb_id));
  const commonImdbIds = (theirLikes ?? [])
    .map((s: any) => s.imdb_id)
    .filter((id: string) => mySet.has(id));

  if (commonImdbIds.length === 0) return Response.json({ matches: [] });

  // Backfill matches table so future swipe-time checks stay consistent
  const [ua, ub] = [user.id, friendId].sort();
  void admin.from("matches").upsert(
    commonImdbIds.map((imdb_id: string) => ({ user_a: ua, user_b: ub, imdb_id, context: "backfill" })),
    { onConflict: "user_a,user_b,imdb_id", ignoreDuplicates: true }
  ); // fire-and-forget

  // Fetch movie data for all matched films
  const { data: movies } = await admin
    .from("movies")
    .select("tmdb_id, imdb_id, title, year, poster_url, director, runtime_minutes, genres, plot, tmdb_rating")
    .in("imdb_id", commonImdbIds);

  const movieMap = new Map((movies ?? []).map((m: any) => [m.imdb_id, m]));

  const matches = commonImdbIds.map((imdb_id: string) => {
    const mv = movieMap.get(imdb_id);
    return {
      imdb_id,
      tmdbId:     mv?.tmdb_id,
      title:      mv?.title ?? imdb_id,
      year:       mv?.year ?? 0,
      posterUrl:  mv?.poster_url ?? "",
      director:   mv?.director ?? "",
      runtime:    mv?.runtime_minutes ?? 0,
      genres:     mv?.genres ?? [],
      plot:       mv?.plot ?? "",
      tmdbRating: mv?.tmdb_rating ?? 0,
      matchedAt:  new Date().toISOString(),
    };
  });

  return Response.json({ matches });
}
