import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDeck, type FilmRecord, type UserPrefs } from "@/lib/recommender";
import { type Genre, type Special } from "@/lib/filters";
import { PRESTIGE_IDS } from "@/lib/prestige-ids";

const TMDB_KEY = process.env.TMDB_API_KEY;

const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  53: "Thriller", 10752: "War", 37: "Western",
};

// Reverse map: genre name → TMDB genre ID (for discover queries)
const GENRE_TO_TMDB: Record<string, number> = Object.fromEntries(
  Object.entries(GENRE_MAP).map(([id, name]) => [name, Number(id)])
);

const CURRENT_YEAR = new Date().getFullYear();

// ── helpers ──────────────────────────────────────────────────────────────────

function tmdbResultToFilm(f: any, listCount = 0, syntheticRuntime?: number): FilmRecord {
  return {
    tmdb_id:     f.id ?? f.tmdb_id,
    imdb_id:     f.imdb_id ?? "",
    title:       f.title,
    year:        parseInt(f.release_date?.slice(0, 4) ?? String(f.year ?? 0)),
    // DB films use runtime_minutes; TMDB search results have no runtime.
    // syntheticRuntime is set when we fetched from a TMDB discover query that
    // already filtered by runtime, so we know the value is in range.
    runtime:     syntheticRuntime ?? f.runtime_minutes ?? f.runtime ?? 0,
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

// Personalised recommendations based on films the user has already liked.
async function fetchRecommendations(
  likedTmdbIds: number[],
  excludeIds: Set<number>,
): Promise<FilmRecord[]> {
  if (!TMDB_KEY || likedTmdbIds.length === 0) return [];
  const results = await Promise.all(
    likedTmdbIds.slice(0, 8).map(id =>
      fetch(
        `https://api.themoviedb.org/3/movie/${id}/recommendations?api_key=${TMDB_KEY}&language=en-US&page=1`
      ).then(r => r.json()).catch(() => ({ results: [] }))
    )
  );
  const seen = new Set<number>(excludeIds);
  return results.flatMap((p: any) =>
    (p.results ?? [])
      .filter((f: any) => f.poster_path && f.title && !seen.has(f.id) && seen.add(f.id))
      .map((f: any) => tmdbResultToFilm(f, 2))
  );
}

// Build TMDB discover queries that respect the active genre / special filters.
// Returns an array of query-param strings (one per discover batch).
function buildDiscoverParamSets(genres: Genre[], special: Special[]): string[] {
  const genrePart = genres.length > 0
    ? `with_genres=${genres.map(g => GENRE_TO_TMDB[g]).filter(Boolean).join("|")}`
    : "";

  // Specials that need a date constraint
  const dateFilters: string[] = [];
  if (special.includes("Classic")) dateFilters.push("primary_release_date.lte=1979-12-31");
  if (special.includes("Recent"))  dateFilters.push(`primary_release_date.gte=${CURRENT_YEAR - 3}-01-01`);

  // Specials that need a runtime constraint
  const runtimeFilters: string[] = [];
  if (special.includes("Short")) runtimeFilters.push("with_runtime.lte=99&with_runtime.gte=20");
  if (special.includes("Epic"))  runtimeFilters.push("with_runtime.gte=150");

  // Build the Cartesian product of date × runtime filters (or "no constraint" if empty)
  const dateOptions   = dateFilters.length   > 0 ? dateFilters   : [""];
  const runtimeOptions = runtimeFilters.length > 0 ? runtimeFilters : [""];

  const paramSets: string[] = [];
  for (const date of dateOptions) {
    for (const runtime of runtimeOptions) {
      const parts = [
        genrePart,
        date,
        runtime,
        "sort_by=vote_average.desc",
        "vote_count.gte=200",
        "include_adult=false",
      ].filter(Boolean);
      paramSets.push(parts.join("&"));
    }
  }

  return paramSets;
}

// Synthetic runtime values passed to films fetched via a runtime-filtered
// discover query (the TMDB results don't include runtime in the payload,
// but we know they satisfy the constraint we asked for).
function syntheticRuntimeFor(special: Special[]): number | undefined {
  if (special.includes("Short")) return 80;  // representative short-film length
  if (special.includes("Epic"))  return 170; // representative epic length
  return undefined;
}

async function fetchFilteredDiscover(
  genres: Genre[],
  special: Special[],
  pages = 10,
): Promise<FilmRecord[]> {
  if (!TMDB_KEY) return [];

  const paramSets = buildDiscoverParamSets(genres, special);
  const synRuntime = syntheticRuntimeFor(special);
  const pagesPerSet = Math.max(1, Math.ceil(pages / paramSets.length));

  const results = await Promise.all(
    paramSets.flatMap(params =>
      Array.from({ length: pagesPerSet }, (_, i) =>
        fetch(
          `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&${params}&page=${i + 1}`
        ).then(r => r.json()).catch(() => ({ results: [] }))
      )
    )
  );

  const seen = new Set<number>();
  return results.flatMap((p: any) =>
    (p.results ?? [])
      .filter((f: any) => f.poster_path && f.title && !seen.has(f.id) && seen.add(f.id))
      .map((f: any) => tmdbResultToFilm(f, 0, synRuntime))
  );
}

// Popular discover: films with 5,000+ votes, sorted by vote count descending.
// Optionally scoped to genre/special filters if also active.
async function fetchPopularDiscover(
  genres: Genre[],
  special: Special[],
  pages = 12,
): Promise<FilmRecord[]> {
  if (!TMDB_KEY) return [];

  const genrePart = genres.length > 0
    ? `with_genres=${genres.map(g => GENRE_TO_TMDB[g]).filter(Boolean).join("|")}`
    : "";

  const dateParts: string[] = [];
  if (special.includes("Classic")) dateParts.push("primary_release_date.lte=1979-12-31");
  if (special.includes("Recent"))  dateParts.push(`primary_release_date.gte=${CURRENT_YEAR - 3}-01-01`);

  const base = [
    genrePart,
    ...dateParts,
    "vote_count.gte=5000",
    "sort_by=vote_count.desc",
    "include_adult=false",
  ].filter(Boolean).join("&");

  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      fetch(
        `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&${base}&page=${i + 1}`
      ).then(r => r.json()).catch(() => ({ results: [] }))
    )
  );

  const seen = new Set<number>();
  return results.flatMap((p: any) =>
    (p.results ?? [])
      .filter((f: any) => f.poster_path && f.title && !seen.has(f.id) && seen.add(f.id))
      .map((f: any) => tmdbResultToFilm(f))
  );
}

// Broad fallback discover pool (no filter constraints) — used when no filters
// are active and the DB is thin.
async function fetchBroadDiscover(pages = 15, pageOffset = 0): Promise<FilmRecord[]> {
  if (!TMDB_KEY) return [];
  const queries = [
    `sort_by=vote_average.desc&vote_count.gte=10000&vote_average.gte=7.0`,
    `sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.5&primary_release_date.lte=1980-12-31`,
    `sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.3&with_original_language=ja|fr|it|ko|de|ru|es|zh`,
  ];
  const off = Math.floor(pageOffset / 20);
  const results = await Promise.all(
    queries.flatMap(params =>
      Array.from({ length: Math.ceil(pages / queries.length) }, (_, i) =>
        fetch(
          `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&include_adult=false&${params}&page=${(off + i) % 500 + 1}`
        ).then(r => r.json()).catch(() => ({ results: [] }))
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

// ── route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const genresParam  = request.nextUrl.searchParams.get("genres")  ?? "";
  const specialParam = request.nextUrl.searchParams.get("special") ?? "";
  const genres  = genresParam  ? (genresParam.split(",")  as Genre[])   : [];
  const special = specialParam ? (specialParam.split(",") as Special[]) : [];
  const page    = parseInt(request.nextUrl.searchParams.get("page") ?? "1");

  const wantsArthouse    = special.includes("Art House");
  const wantsPopular     = special.includes("Popular");
  const filteredSpecial  = special.filter(s => s !== "Art House" && s !== "Popular") as Special[];
  const hasFilters       = genres.length > 0 || filteredSpecial.length > 0 || wantsPopular;
  const hasRuntimeFilter = filteredSpecial.some(s => s === "Short" || s === "Epic");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Swipe history + prefs
  const [{ data: prefs }, { data: swipes }] = await Promise.all([
    supabase.from("user_preferences")
      .select("preferred_genres, favorite_film_tmdb_ids")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("swipes")
      .select("imdb_id, direction")
      .eq("user_id", user.id),
  ]);

  const allSwipedImdbIds = (swipes ?? []).map((s: any) => s.imdb_id).filter(Boolean);
  const likedImdbSet     = new Set((swipes ?? []).filter((s: any) => s.direction === "like").map((s: any) => s.imdb_id));

  // ── Build filter-aware DB query ──────────────────────────────────────────
  const MOVIE_SELECT = "tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating";

  // Swipe lookup runs in parallel with everything else
  const swipedMoviesPromise = allSwipedImdbIds.length > 0
    ? supabase.from("movies").select("tmdb_id, imdb_id").in("imdb_id", allSwipedImdbIds.slice(0, 1000))
    : Promise.resolve({ data: [] as any[] });

  let dbPool: any[] = [];
  let arthouseIds: Set<number> | null = null;

  if (wantsArthouse) {
    // For Art House: fetch arthouse IDs first, then query movies for exactly those IDs.
    // This guarantees we pull ALL seeded arthouse films rather than hoping they fall
    // within the top-N by rating from the entire movies table.
    const { data: af } = await supabase.from("arthouse_films").select("tmdb_id");
    const afIds = (af ?? []).map((r: any) => r.tmdb_id as number);
    arthouseIds = new Set(afIds);

    if (afIds.length > 0) {
      const { data } = await supabase
        .from("movies")
        .select(MOVIE_SELECT)
        .in("tmdb_id", afIds)
        .order("tmdb_rating", { ascending: false });
      dbPool = data ?? [];
    }
  } else {
    // Standard path: filter-aware query against the full movies table.
    // Genre and year filters applied at DB level for a dense pool.
    // Runtime filters (Short/Epic) rely on post-hoc matchesFilters because
    // runtime_minutes is often null for non-seeded films; discover compensates.
    let q = supabase
      .from("movies")
      .select(MOVIE_SELECT)
      .order("tmdb_rating", { ascending: false })
      .limit(hasRuntimeFilter ? 2000 : 600);

    if (genres.length > 0)                   q = (q as any).overlaps("genres", genres);
    if (filteredSpecial.includes("Classic"))  q = (q as any).lt("year", 1980).gt("year", 0);
    if (filteredSpecial.includes("Recent"))   q = (q as any).gte("year", CURRENT_YEAR - 3);

    const { data } = await q;
    dbPool = data ?? [];
  }

  const { data: swipedMoviesData } = await swipedMoviesPromise;

  // Build swipedIds
  const swipedIds = new Set<number>();
  (swipedMoviesData ?? []).forEach((m: any) => swipedIds.add(m.tmdb_id));
  allSwipedImdbIds.forEach((id: string) => { const n = parseInt(id); if (!isNaN(n)) swipedIds.add(n); });

  const likedTmdbIds: number[] = (swipedMoviesData ?? [])
    .filter((m: any) => likedImdbSet.has(m.imdb_id))
    .map((m: any) => m.tmdb_id)
    .slice(0, 20);

  // DB films
  const dbFilms: FilmRecord[] = dbPool
    .map((f: any) => tmdbResultToFilm(f, PRESTIGE_IDS.has(f.tmdb_id) ? 3 : 0));
  const dbIds = new Set(dbFilms.map(f => f.tmdb_id));

  // ── Discover pool ────────────────────────────────────────────────────────
  // Always run a filter-aware discover pool when filters are active.
  // For Art House we rely entirely on the DB (arthouse_films).
  // For broad unfiltered browsing, only run discover when DB is thin or on later pages.
  const [recFilms, discoverFilms] = await Promise.all([
    fetchRecommendations(likedTmdbIds, new Set([...swipedIds, ...dbIds])),
    (() => {
      if (wantsArthouse) return Promise.resolve([] as FilmRecord[]);
      if (wantsPopular)  return fetchPopularDiscover(genres, filteredSpecial, 12);
      if (hasFilters)    return fetchFilteredDiscover(genres, filteredSpecial, 12);
      if (dbFilms.length < 100 || page > 3)
        return fetchBroadDiscover(15, (page - 1) * 60);
      return Promise.resolve([] as FilmRecord[]);
    })(),
  ]);

  // Merge: recs → DB → discover, dedup.
  // Art House recs/discover are already empty (wantsArthouse skips them),
  // and dbFilms were fetched directly from arthouse_films IDs, so no extra filter needed.
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

  // ── Calibration: first 50 swipes favour prestige films ──────────────────
  const swipeCount     = (swipes ?? []).length;
  const isCalibrating  = swipeCount < 50;
  const TOTAL          = 30;
  const prestigeTarget = isCalibrating ? Math.round(TOTAL * 0.8) : Math.round(TOTAL * 0.5);
  const generalTarget  = TOTAL - prestigeTarget;

  const prestigePool = filmPool.filter(f =>  PRESTIGE_IDS.has(f.tmdb_id));
  const generalPool  = filmPool.filter(f => !PRESTIGE_IDS.has(f.tmdb_id));

  const deckArgs = {
    swipedIds, watchedIds: new Set<number>(), userPrefs, moods: [],
    genres, special: filteredSpecial,
  };

  const prestigeSlice = buildDeck({ pool: prestigePool, ...deckArgs, count: prestigeTarget });
  const generalSlice  = buildDeck({
    pool: generalPool, ...deckArgs,
    count: generalTarget + Math.max(0, prestigeTarget - prestigeSlice.length),
  });

  // Shuffle the merged deck
  const merged = [...prestigeSlice, ...generalSlice];
  for (let i = merged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [merged[i], merged[j]] = [merged[j], merged[i]];
  }

  const films = merged.map(f => ({
    tmdbId:     f.tmdb_id,
    imdbId:     f.imdb_id || undefined,
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
