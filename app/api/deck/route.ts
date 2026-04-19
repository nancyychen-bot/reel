import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDeck, type FilmRecord, type UserPrefs } from "@/lib/recommender";
import { getMovieDetail } from "@/lib/tmdb";
import type { Mood } from "@/lib/moods";

export async function GET(request: NextRequest) {
  const moodsParam = request.nextUrl.searchParams.get("moods") ?? "";
  const moods = moodsParam ? (moodsParam.split(",") as Mood[]) : [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Get user prefs
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("preferred_genres, favorite_film_tmdb_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  // Get swipe history
  const { data: swipes } = await supabase
    .from("swipes")
    .select("imdb_id")
    .eq("user_id", user.id);
  const { data: watched } = await supabase
    .from("watched")
    .select("imdb_id")
    .eq("user_id", user.id);

  const swipedIds = new Set<number>();
  const watchedIds = new Set<number>();
  (swipes ?? []).forEach((s: any) => swipedIds.add(parseInt(s.imdb_id)));
  (watched ?? []).forEach((w: any) => watchedIds.add(parseInt(w.imdb_id)));

  // Pull curated pool
  const { data: pool } = await supabase
    .from("movies")
    .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating")
    .order("tmdb_rating", { ascending: false })
    .limit(500);

  // Count list appearances per film
  const { data: listCounts } = await supabase.rpc("film_list_counts") as { data: Array<{ tmdb_id: number; count: number }> | null };
  const countMap = new Map<number, number>();
  (listCounts ?? []).forEach(r => countMap.set(r.tmdb_id, r.count));

  const filmPool: FilmRecord[] = (pool ?? []).map((f: any) => ({
    tmdb_id:     f.tmdb_id,
    imdb_id:     f.imdb_id,
    title:       f.title,
    year:        f.year,
    runtime:     f.runtime_minutes,
    genres:      f.genres ?? [],
    director:    f.director ?? "",
    plot:        f.plot ?? "",
    poster_url:  f.poster_url ?? "",
    tmdb_rating: f.tmdb_rating ?? 0,
    list_count:  countMap.get(f.tmdb_id) ?? 0,
  }));

  // Build user prefs object
  let seedGenres: string[] = [];
  let seedDirectors: string[] = [];

  if (prefs?.favorite_film_tmdb_ids?.length) {
    // Pull seed film details from DB (they should already be cached)
    const { data: seedFilms } = await supabase
      .from("movies")
      .select("genres, director")
      .in("tmdb_id", prefs.favorite_film_tmdb_ids);

    (seedFilms ?? []).forEach((sf: any) => {
      seedGenres.push(...(sf.genres ?? []));
      if (sf.director) seedDirectors.push(sf.director);
    });
  }

  const userPrefs: UserPrefs = {
    favoriteGenres: prefs?.preferred_genres ?? [],
    seedGenres:     [...new Set(seedGenres)],
    seedDirectors:  [...new Set(seedDirectors)],
  };

  const deck = buildDeck({ pool: filmPool, swipedIds, watchedIds, userPrefs, moods });

  // Shape into FilmData for SwipeCard
  const films = deck.map(f => ({
    tmdbId:     f.tmdb_id,
    title:      f.title,
    year:       f.year,
    director:   f.director,
    runtime:    f.runtime,
    genres:     f.genres,
    plot:       f.plot,
    tmdbRating: f.tmdb_rating,
    posterUrl:  f.poster_url,
  }));

  return Response.json({ films });
}
