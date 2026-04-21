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

// Popular discover: mainstream/blockbuster films filtered by revenue + vote count.
// Revenue ≥ $50M eliminates arthouse; vote_count ≥ 10k ensures broad audience reach.
async function fetchPopularDiscover(
  genres: Genre[],
  special: Special[],
  pages = 20,
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
    "vote_count.gte=10000",
    "with_revenue.gte=50000000",
    "sort_by=popularity.desc",
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

// Provider-filtered discover: films available on specific streaming services.
// Uses TMDB's with_watch_providers (pipe = OR) so Netflix|Prime returns films on either.
async function fetchProviderDiscover(
  providerIds: Set<number>,
  genres: Genre[],
  special: Special[],
  pages = 15,
): Promise<FilmRecord[]> {
  if (!TMDB_KEY) return [];
  const providerStr = Array.from(providerIds).join("|");
  const genrePart   = genres.length > 0
    ? `&with_genres=${genres.map(g => GENRE_TO_TMDB[g]).filter(Boolean).join("|")}`
    : "";

  const dateParts: string[] = [];
  if (special.includes("Classic")) dateParts.push("primary_release_date.lte=1979-12-31");
  if (special.includes("Recent"))  dateParts.push(`primary_release_date.gte=${CURRENT_YEAR - 3}-01-01`);
  const datePart = dateParts.length > 0 ? `&${dateParts.map(d => d).join("&")}` : "";

  const runtimePart = special.includes("Short") ? "&with_runtime.lte=99&with_runtime.gte=20"
                    : special.includes("Epic")   ? "&with_runtime.gte=150"
                    : "";

  const synRuntime = syntheticRuntimeFor(special);
  const base = `with_watch_providers=${providerStr}&watch_region=US&sort_by=vote_average.desc&vote_count.gte=200&include_adult=false${genrePart}${datePart}${runtimePart}`;

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
      .map((f: any) => tmdbResultToFilm(f, 0, synRuntime))
  );
}

// ── route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const genresParam    = request.nextUrl.searchParams.get("genres")    ?? "";
  const specialParam   = request.nextUrl.searchParams.get("special")   ?? "";
  const excludeParam   = request.nextUrl.searchParams.get("exclude")   ?? "";
  const providersParam = request.nextUrl.searchParams.get("providers") ?? "";
  const genres    = genresParam    ? (genresParam.split(",")  as Genre[])   : [];
  const special   = specialParam   ? (specialParam.split(",") as Special[]) : [];
  const providerFilter = providersParam ? new Set(providersParam.split(",").map(Number)) : null;
  const page    = parseInt(request.nextUrl.searchParams.get("page") ?? "1");
  // Session-swiped IDs sent by the client — exclude immediately without waiting for DB commits
  const sessionExcludeIds = new Set<number>(
    excludeParam ? excludeParam.split(",").map(Number).filter(n => n > 0) : []
  );

  const wantsArthouse    = special.includes("Art House");
  const wantsPopular     = special.includes("Popular");
  const filteredSpecial  = special.filter(s => s !== "Art House" && s !== "Popular") as Special[];
  const hasFilters       = genres.length > 0 || filteredSpecial.length > 0 || wantsPopular;
  const hasRuntimeFilter = filteredSpecial.some(s => s === "Short" || s === "Epic");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Swipe history + prefs + watched — order swipes newest-first so recent likes weight more
  const [{ data: prefs }, { data: swipes }, { data: watchedRows }] = await Promise.all([
    supabase.from("user_preferences")
      .select("preferred_genres, favorite_film_tmdb_ids")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("swipes")
      .select("imdb_id, direction, source")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("watched")
      .select("imdb_id")
      .eq("user_id", user.id),
  ]);

  // Room passes are temporary — don't permanently exclude them from the regular deck.
  // Room likes still count as seen (user already liked it).
  const isRoomPass = (s: any) => s.source === "room" && s.direction === "pass";
  const allSwipedImdbIds = (swipes ?? []).filter((s: any) => !isRoomPass(s)).map((s: any) => s.imdb_id).filter(Boolean);
  const likedImdbSet     = new Set((swipes ?? []).filter((s: any) => s.direction === "like").map((s: any) => s.imdb_id));

  // ── Adaptive taste profile ───────────────────────────────────────────────
  const recentLikedIds = (swipes ?? [])
    .filter((s: any) => s.direction === "like" && isNaN(parseInt(s.imdb_id)))
    .slice(0, 60).map((s: any) => s.imdb_id);
  const recentPassedIds = (swipes ?? [])
    .filter((s: any) => s.direction === "pass" && !isRoomPass(s) && isNaN(parseInt(s.imdb_id)))
    .slice(0, 60).map((s: any) => s.imdb_id);

  const seedTmdbIds: number[] = prefs?.favorite_film_tmdb_ids ?? [];

  const [{ data: likedMoviesForPrefs }, { data: passedMoviesForPrefs }, { data: seedMovies }] = await Promise.all([
    recentLikedIds.length > 0
      ? supabase.from("movies").select("genres, director, year").in("imdb_id", recentLikedIds)
      : Promise.resolve({ data: [] as any[] }),
    recentPassedIds.length > 0
      ? supabase.from("movies").select("genres, director").in("imdb_id", recentPassedIds)
      : Promise.resolve({ data: [] as any[] }),
    seedTmdbIds.length > 0
      ? supabase.from("movies").select("genres, director").in("tmdb_id", seedTmdbIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // Genre like-rate: likes / (likes + passes) per genre — normalises for saturation
  const genreLikes  = new Map<string, number>();
  const genrePasses = new Map<string, number>();
  const dirLikes    = new Map<string, number>();
  const dirPasses   = new Map<string, number>();

  for (const m of likedMoviesForPrefs ?? []) {
    for (const g of m.genres ?? []) genreLikes.set(g,  (genreLikes.get(g)  ?? 0) + 1);
    if (m.director) dirLikes.set(m.director, (dirLikes.get(m.director) ?? 0) + 1);
  }
  for (const m of passedMoviesForPrefs ?? []) {
    for (const g of m.genres ?? []) genrePasses.set(g, (genrePasses.get(g) ?? 0) + 1);
    if (m.director) dirPasses.set(m.director, (dirPasses.get(m.director) ?? 0) + 1);
  }

  // Genres with enough data points, ranked by like-rate
  const allGenres = new Set([...genreLikes.keys(), ...genrePasses.keys()]);
  const genreRates = [...allGenres]
    .map(g => {
      const l = genreLikes.get(g) ?? 0;
      const p = genrePasses.get(g) ?? 0;
      return { g, rate: l / (l + p), total: l + p };
    })
    .filter(x => x.total >= 3); // need at least 3 data points

  const seedGenres    = [...new Set([
    ...genreRates.filter(x => x.rate >= 0.55).sort((a, b) => b.rate - a.rate).slice(0, 6).map(x => x.g),
    ...(seedMovies ?? []).flatMap((m: any) => m.genres ?? []),
  ])];
  const passedGenres  = genreRates.filter(x => x.rate <= 0.3).map(x => x.g);

  // Directors: liked vs passed frequency
  const allDirs = new Set([...dirLikes.keys(), ...dirPasses.keys()]);
  const dirRates = [...allDirs].map(d => ({
    d,
    rate:  (dirLikes.get(d) ?? 0) / ((dirLikes.get(d) ?? 0) + (dirPasses.get(d) ?? 0)),
    total: (dirLikes.get(d) ?? 0) + (dirPasses.get(d) ?? 0),
  })).filter(x => x.total >= 2);

  const seedDirectors    = [...new Set([
    ...dirRates.filter(x => x.rate >= 0.6).sort((a, b) => b.rate - a.rate).slice(0, 4).map(x => x.d),
    ...(seedMovies ?? []).map((m: any) => m.director).filter(Boolean),
  ])];
  const passedDirectors  = dirRates.filter(x => x.rate <= 0.25).map(x => x.d);

  // Era preference: average release year of liked films
  const likedYears = (likedMoviesForPrefs ?? []).map((m: any) => m.year).filter((y: number) => y > 1900);
  const eraCenter  = likedYears.length > 0
    ? Math.round(likedYears.reduce((a: number, b: number) => a + b, 0) / likedYears.length)
    : 0;

  // Numeric placeholder imdb_ids (e.g. "12345") ARE the tmdb_id — add them directly.
  // This covers discover films whose movies upsert may have failed.
  const directTmdbIds = new Set<number>();
  const allExcludedImdbIds = [
    ...allSwipedImdbIds,
    ...(watchedRows ?? []).map((w: any) => w.imdb_id).filter(Boolean),
  ];
  for (const id of allExcludedImdbIds) {
    const n = parseInt(id);
    if (!isNaN(n)) directTmdbIds.add(n);
  }

  // ── Build filter-aware DB query ──────────────────────────────────────────
  const MOVIE_SELECT = "tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating, ebert_great_movie";

  // Resolve real imdb_ids (tt...) → tmdb_id via movies table (swipes + watched).
  const realImdbIds = allExcludedImdbIds.filter(id => isNaN(parseInt(id)));
  const swipedMoviesPromise = realImdbIds.length > 0
    ? supabase.from("movies").select("tmdb_id, imdb_id").in("imdb_id", realImdbIds).limit(5000)
    : Promise.resolve({ data: [] as any[] });

  let dbPool: any[] = [];

  if (wantsArthouse) {
    // For Art House: fetch arthouse records with award_winner flag.
    // Prefer award winners (Palme d'Or, Golden Lion, etc.) — fall back to all
    // arthouse selections only when the award-winner pool is too thin (< 30 films).
    const { data: af } = await supabase.from("arthouse_films").select("tmdb_id, award_winner");
    const allAf = af ?? [];
    const awardIds = allAf.filter((r: any) => r.award_winner).map((r: any) => r.tmdb_id as number);
    const allAfIds = allAf.map((r: any) => r.tmdb_id as number);
    // Use award winners if there are enough; otherwise fall back to all arthouse
    const afIds = awardIds.length >= 30 ? awardIds : allAfIds;

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

  // Build swipedIds: movies-table lookup (real imdb_ids) + direct numeric ids + session excludes
  const swipedIds = new Set<number>([...directTmdbIds, ...sessionExcludeIds]);
  (swipedMoviesData ?? []).forEach((m: any) => swipedIds.add(m.tmdb_id));

  const likedTmdbIds: number[] = (swipedMoviesData ?? [])
    .filter((m: any) => likedImdbSet.has(m.imdb_id))
    .map((m: any) => m.tmdb_id)
    .slice(0, 20);

  // DB films — Ebert Great Movies get the highest boost (list_count 4),
  // other prestige films get 3, rest get 0.
  // Filter by both imdb_id and tmdb_id so swiped films are excluded even when
  // the imdb_id → tmdb_id lookup (swipedMoviesPromise) is incomplete.
  const excludedImdbSet = new Set(allExcludedImdbIds);
  const dbFilms: FilmRecord[] = dbPool
    .filter((f: any) => !excludedImdbSet.has(f.imdb_id) && !swipedIds.has(f.tmdb_id))
    .map((f: any) => tmdbResultToFilm(
      f,
      f.ebert_great_movie  ? 4 :
      PRESTIGE_IDS.has(f.tmdb_id) ? 3 : 0
    ));
  const dbIds = new Set(dbFilms.map(f => f.tmdb_id));

  // ── Discover pool ────────────────────────────────────────────────────────
  // Always run a filter-aware discover pool when filters are active.
  // For Art House we rely entirely on the DB (arthouse_films).
  // For broad unfiltered browsing, only run discover when DB is thin or on later pages.
  const [recFilms, discoverFilms] = await Promise.all([
    // Skip recommendations for Popular/provider filters — they're not vote-count filtered
    (wantsPopular || providerFilter) ? Promise.resolve([] as FilmRecord[]) : fetchRecommendations(likedTmdbIds, new Set([...swipedIds, ...dbIds])),
    (() => {
      if (wantsArthouse)  return Promise.resolve([] as FilmRecord[]);
      if (providerFilter) return fetchProviderDiscover(providerFilter, genres, filteredSpecial, 15);
      if (wantsPopular)   return fetchPopularDiscover(genres, filteredSpecial, 12);
      if (hasFilters)     return fetchFilteredDiscover(genres, filteredSpecial, 20);
      if (dbFilms.length < 100 || page > 3)
        return fetchBroadDiscover(15, (page - 1) * 60);
      return Promise.resolve([] as FilmRecord[]);
    })(),
  ]);

  // Merge: recs → DB → discover, dedup.
  // Popular: use only discover (DB has no vote_count filter).
  // Art House: recs/discover are empty; DB was fetched from arthouse_films IDs directly.
  const seen = new Set<number>(swipedIds);
  let filmPool: FilmRecord[] = [];
  // For provider filter: enrich discover results with DB prestige data.
  // DB films that are also in the provider pool carry their list_count/ebert boost.
  // For Popular: discover only (no prestige bias intended).
  let mergeSource: FilmRecord[];
  if (providerFilter) {
    const providerTmdbIds = new Set(discoverFilms.map(f => f.tmdb_id));
    const enrichedDb = dbFilms.filter(f => providerTmdbIds.has(f.tmdb_id));
    mergeSource = [...enrichedDb, ...discoverFilms];
  } else if (wantsPopular) {
    mergeSource = discoverFilms;
  } else {
    mergeSource = [...recFilms, ...dbFilms, ...discoverFilms];
  }
  for (const f of mergeSource) {
    if (!seen.has(f.tmdb_id)) {
      seen.add(f.tmdb_id);
      filmPool.push(f);
    }
  }

  // Provider filter is handled via fetchProviderDiscover (see below) —
  // no post-hoc per-film lookup needed here.

  const userPrefs: UserPrefs = {
    favoriteGenres:  prefs?.preferred_genres ?? [],
    seedGenres,
    seedDirectors,
    passedGenres,
    passedDirectors,
    eraCenter,
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
