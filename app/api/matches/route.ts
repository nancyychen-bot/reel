import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Returns all matches for the current user, with movie info and friend username.
// Uses admin client to bypass RLS (which only allows user_a to read their matches).
export async function GET(_: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Fetch all matches where user appears as either user_a or user_b
  const { data: ms } = await admin
    .from("matches")
    .select("imdb_id, matched_at, user_a, user_b")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order("matched_at", { ascending: false });

  if (!ms || ms.length === 0) return Response.json({ matches: [] });

  const imdbIds   = [...new Set(ms.map((m: any) => m.imdb_id))];
  const friendIds = [...new Set(ms.map((m: any) => m.user_a === user.id ? m.user_b : m.user_a))];

  // Fetch movies + friend profiles in parallel
  const [{ data: movies }, { data: profiles }] = await Promise.all([
    admin.from("movies").select("imdb_id, title, year, poster_url").in("imdb_id", imdbIds),
    admin.from("profiles").select("id, username").in("id", friendIds),
  ]);

  const movieMap   = new Map((movies   ?? []).map((m: any) => [m.imdb_id, m]));
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  const matches = ms.map((m: any) => {
    const friendId = m.user_a === user.id ? m.user_b : m.user_a;
    const movie    = movieMap.get(m.imdb_id);
    const friend   = profileMap.get(friendId);
    return {
      imdb_id:    m.imdb_id,
      title:      movie?.title    ?? m.imdb_id,
      year:       movie?.year     ?? 0,
      posterUrl:  movie?.poster_url ?? "",
      matchedAt:  m.matched_at,
      friendId,
      friendName: friend?.username ?? "friend",
    };
  });

  return Response.json({ matches });
}
