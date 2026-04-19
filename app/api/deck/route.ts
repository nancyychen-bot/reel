import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDeck, type FilmRecord, type UserPrefs } from "@/lib/recommender";
import type { Mood } from "@/lib/moods";

const TMDB_KEY = process.env.TMDB_API_KEY;

const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  53: "Thriller", 10752: "War", 37: "Western",
};

// Fetch N pages of TMDB top-rated films directly (no DB required)
async function fetchTmdbPool(pages = 10): Promise<FilmRecord[]> {
  if (!TMDB_KEY) return [];
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      fetch(
        `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_KEY}&language=en-US&page=${i + 1}`
      )
        .then(r => r.json())
        .catch(() => ({ results: [] }))
    )
  );
  return results.flatMap((p: any) =>
    (p.results ?? [])
      .filter((f: any) => f.poster_path && f.title)
      .map((f: any): FilmRecord => ({
        tmdb_id:     f.id,
        imdb_id:     "",
        title:       f.title,
        year:        parseInt(f.release_date?.slice(0, 4) ?? "0"),
        runtime:     0,
        genres:      (f.genre_ids ?? []).map((id: number) => GENRE_MAP[id]).filter(Boolean),
        director:    "",
        plot:        f.overview ?? "",
        poster_url:  `https://image.tmdb.org/t/p/w780${f.poster_path}`,
        tmdb_rating: f.vote_average ?? 0,
        list_count:  0,
      }))
  );
}

export async function GET(request: NextRequest) {
  const moodsParam = request.nextUrl.searchParams.get("moods") ?? "";
  const moods = moodsParam ? (moodsParam.split(",") as Mood[]) : [];
  const page  = parseInt(request.nextUrl.searchParams.get("page") ?? "1");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Get user prefs
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("preferred_genres, favorite_film_tmdb_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  // Get swipe history (tmdb_id stored as imdb_id field — use tmdb_id column when available)
  const { data: swipes } = await supabase
    .from("swipes")
    .select("imdb_id")
    .eq("user_id", user.id);

  const swipedIds = new Set<number>();
  (swipes ?? []).forEach((s: any) => {
    const n = parseInt(s.imdb_id);
    if (!isNaN(n)) swipedIds.add(n);
  });

  // Try DB pool first
  const { data: dbPool } = await supabase
    .from("movies")
    .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating")
    .order("tmdb_rating", { ascending: false })
    .limit(500);

  let filmPool: FilmRecord[] = (dbPool ?? []).map((f: any) => ({
    tmdb_id:     f.tmdb_id,
    imdb_id:     f.imdb_id ?? "",
    title:       f.title,
    year:        f.year ?? 0,
    runtime:     f.runtime_minutes ?? 0,
    genres:      f.genres ?? [],
    director:    f.director ?? "",
    plot:        f.plot ?? "",
    poster_url:  f.poster_url ?? "",
    tmdb_rating: f.tmdb_rating ?? 0,
    list_count:  0,
  }));

  // Fall back to TMDB directly if DB is empty or sparse
  if (filmPool.length < 50) {
    filmPool = await fetchTmdbPool(13); // ~260 films
  }

  // Build user prefs
  const userPrefs: UserPrefs = {
    favoriteGenres: prefs?.preferred_genres ?? [],
    seedGenres:     [],
    seedDirectors:  [],
  };

  // Rotate pool across pages so "endless" works — each page gets a different slice
  // by using a seeded shuffle offset based on page number
  const offset = ((page - 1) * 30) % Math.max(filmPool.length, 1);
  const rotatedPool = [...filmPool.slice(offset), ...filmPool.slice(0, offset)];

  const deck = buildDeck({
    pool:      rotatedPool,
    swipedIds,
    watchedIds: new Set(),
    userPrefs,
    moods,
    count: 30,
  });

  const films = deck.map(f => ({
    tmdbId:     f.tmdb_id,
    title:      f.title,
    year:       f.year,
    director:   f.director || "Unknown",
    runtime:    f.runtime,
    genres:     f.genres,
    plot:       f.plot,
    tmdbRating: f.tmdb_rating,
    posterUrl:  f.poster_url,
  }));

  return Response.json({ films });
}
