import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDeck, type FilmRecord, type UserPrefs } from "@/lib/recommender";
import { type Genre, type Special } from "@/lib/filters";

const TMDB_KEY = process.env.TMDB_API_KEY;

const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  53: "Thriller", 10752: "War", 37: "Western",
};

function tmdbResultToFilm(f: any, listCount = 0): FilmRecord {
  return {
    tmdb_id:     f.id,
    imdb_id:     f.imdb_id ?? "",
    title:       f.title,
    year:        parseInt(f.release_date?.slice(0, 4) ?? "0"),
    runtime:     f.runtime_minutes ?? f.runtime ?? 0,
    genres:      Array.isArray(f.genres)
                   ? f.genres
                   : (f.genre_ids ?? []).map((id: number) => GENRE_MAP[id]).filter(Boolean),
    director:    f.director ?? "",
    plot:        f.overview ?? f.plot ?? "",
    poster_url:  f.poster_path
                   ? `https://image.tmdb.org/t/p/w780${f.poster_path}`
                   : (f.poster_url ?? ""),
    tmdb_rating: f.vote_average ?? f.tmdb_rating ?? 0,
    list_count:  listCount,
  };
}

// Fetch TMDB recommendations for a set of films the user has liked.
// Returns films not already in the pool, scored with list_count=2
// (treated as "recommended for you" — boosts them in the ranker).
async function fetchRecommendations(
  likedTmdbIds: number[],
  excludeIds: Set<number>,
): Promise<FilmRecord[]> {
  if (!TMDB_KEY || likedTmdbIds.length === 0) return [];

  const results = await Promise.all(
    likedTmdbIds.slice(0, 8).map(id =>
      fetch(
        `https://api.themoviedb.org/3/movie/${id}/recommendations?api_key=${TMDB_KEY}&language=en-US&page=1`
      )
        .then(r => r.json())
        .catch(() => ({ results: [] }))
    )
  );

  const seen = new Set<number>(excludeIds);
  return results.flatMap((p: any) =>
    (p.results ?? [])
      .filter((f: any) => f.poster_path && f.title && !seen.has(f.id) && seen.add(f.id))
      .map((f: any) => tmdbResultToFilm(f, 2)) // list_count=2 → +1 score bonus
  );
}

// Broader TMDB discover pool — fills gaps when the user has swiped through
// most of the DB or when they have no liked films yet.
async function fetchDiscoverPool(pages = 15, offset = 0): Promise<FilmRecord[]> {
  if (!TMDB_KEY) return [];

  // Multiple quality tiers fetched in parallel
  const queries = [
    `sort_by=vote_average.desc&vote_count.gte=10000&vote_average.gte=7.0`,
    `sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.5&primary_release_date.lte=1980-12-31`,
    `sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.3&with_original_language=ja|fr|it|ko|de|ru|es|zh`,
  ];

  const pageOffset = Math.floor(offset / 20); // rotate starting page for variety
  const results = await Promise.all(
    queries.flatMap(params =>
      Array.from({ length: Math.ceil(pages / queries.length) }, (_, i) =>
        fetch(
          `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&include_adult=false&${params}&page=${(pageOffset + i) % 500 + 1}`
        )
          .then(r => r.json())
          .catch(() => ({ results: [] }))
      )
    )
  );

  const seen = new Set<number>();
  return results.flatMap((p: any) =>
    (p.results ?? [])
      .filter((f: any) => f.poster_path && f.title && !seen.has(f.id) && seen.add(f.id))
      .map((f: any) => tmdbResultToFilm(f))
  );
}

export async function GET(request: NextRequest) {
  const genresParam  = request.nextUrl.searchParams.get("genres") ?? "";
  const specialParam = request.nextUrl.searchParams.get("special") ?? "";
  const genres  = genresParam  ? (genresParam.split(",")  as Genre[])   : [];
  const special = specialParam ? (specialParam.split(",") as Special[]) : [];
  const page    = parseInt(request.nextUrl.searchParams.get("page") ?? "1");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch in parallel: prefs + swipe history
  const [{ data: prefs }, { data: swipes }] = await Promise.all([
    supabase
      .from("user_preferences")
      .select("preferred_genres, favorite_film_tmdb_ids")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("swipes")
      .select("imdb_id, direction")
      .eq("user_id", user.id),
  ]);

  // Build swiped set for filtering
  const swipedIds = new Set<number>();
  const likedImdbIds: string[] = [];
  (swipes ?? []).forEach((s: any) => {
    const n = parseInt(s.imdb_id);
    if (!isNaN(n)) swipedIds.add(n);
    if (s.direction === "like") likedImdbIds.push(s.imdb_id);
  });

  // Look up tmdb_ids for liked films (so we can hit the recommendations API)
  const likedTmdbIds: number[] = [];
  if (likedImdbIds.length > 0) {
    const { data: likedMovies } = await supabase
      .from("movies")
      .select("tmdb_id")
      .in("imdb_id", likedImdbIds.slice(0, 20))
      .order("tmdb_rating", { ascending: false });
    (likedMovies ?? []).forEach((m: any) => likedTmdbIds.push(m.tmdb_id));
  }

  // DB pool — our seeded films
  const { data: dbPool } = await supabase
    .from("movies")
    .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating")
    .order("tmdb_rating", { ascending: false })
    .limit(500);

  const dbFilms: FilmRecord[] = (dbPool ?? []).map((f: any) => tmdbResultToFilm(f));
  const dbIds = new Set(dbFilms.map(f => f.tmdb_id));

  // Fetch personalised recs + broader discover in parallel
  const [recFilms, discoverFilms] = await Promise.all([
    fetchRecommendations(likedTmdbIds, new Set([...swipedIds, ...dbIds])),
    // Only hit discover if DB is thin or user is on later pages
    (dbFilms.length < 100 || page > 3)
      ? fetchDiscoverPool(15, (page - 1) * 60)
      : Promise.resolve([] as FilmRecord[]),
  ]);

  // Merge: recs first (personalised), then DB, then discover
  const seen = new Set<number>(swipedIds);
  const filmPool: FilmRecord[] = [];
  for (const f of [...recFilms, ...dbFilms, ...discoverFilms]) {
    if (!seen.has(f.tmdb_id)) {
      seen.add(f.tmdb_id);
      filmPool.push(f);
    }
  }

  const userPrefs: UserPrefs = {
    favoriteGenres: prefs?.preferred_genres ?? [],
    seedGenres:     [],
    seedDirectors:  [],
  };

  const deck = buildDeck({
    pool:       filmPool,
    swipedIds,
    watchedIds: new Set(),
    userPrefs,
    moods:      [],
    genres,
    special,
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
