import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildRoomDeck, type FilmRecord, type UserPrefs } from "@/lib/recommender";
import { type Genre, type Special } from "@/lib/filters";
import { PRESTIGE_IDS } from "@/lib/prestige-ids";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: room } = await supabase
    .from("rooms")
    .select("id, mood_tags, queue_imdb_ids")
    .eq("code", code.toUpperCase())
    .single();

  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });

  const reset = request.nextUrl.searchParams.get("reset") === "1";

  // Return cached queue if already generated (unless reset was requested)
  if (!reset && room.queue_imdb_ids?.length) {
    const { data: films } = await supabase
      .from("movies")
      .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating")
      .in("imdb_id", room.queue_imdb_ids);

    // Preserve stored order
    const filmMap = new Map((films ?? []).map((f: any) => [f.imdb_id, f]));
    const ordered = room.queue_imdb_ids
      .map((id: string) => filmMap.get(id))
      .filter(Boolean);

    return Response.json({ films: ordered.map(shapeFilm) });
  }

  // Parse genres/special/providers from mood_tags
  // Providers are stored as "provider:8", "provider:9" etc.
  const tags: string[] = room.mood_tags ?? [];
  const SPECIAL_VALUES = ["Short", "Epic", "Classic", "Recent", "Art House", "Popular"];
  const providerTags   = tags.filter(t => t.startsWith("provider:"));
  const nonProviderTags = tags.filter(t => !t.startsWith("provider:"));
  const genres         = nonProviderTags.filter(t => !SPECIAL_VALUES.includes(t)) as Genre[];
  const special        = nonProviderTags.filter(t =>  SPECIAL_VALUES.includes(t)) as Special[];
  const wantsArthouse  = special.includes("Art House");
  const filteredSpecial = special.filter(s => s !== "Art House") as Special[];
  const roomProviderFilter = providerTags.length > 0
    ? new Set(providerTags.map(t => parseInt(t.slice(9))))
    : null;

  // Get participants and build prefs for both
  const { data: participants } = await supabase
    .from("room_participants")
    .select("user_id")
    .eq("room_id", room.id);

  const participantIds = (participants ?? []).map((p: any) => p.user_id);

  async function getPrefs(uid: string): Promise<UserPrefs> {
    const [{ data: prefs }, { data: likedSwipes }, { data: passedSwipes }] = await Promise.all([
      supabase.from("user_preferences")
        .select("preferred_genres, favorite_film_tmdb_ids")
        .eq("user_id", uid).maybeSingle(),
      supabase.from("swipes").select("imdb_id")
        .eq("user_id", uid).eq("direction", "like")
        .order("created_at", { ascending: false }).limit(60),
      supabase.from("swipes").select("imdb_id")
        .eq("user_id", uid).eq("direction", "pass")
        .order("created_at", { ascending: false }).limit(60),
    ]);

    const likedIds  = (likedSwipes  ?? []).map((s: any) => s.imdb_id).filter((id: string) => isNaN(parseInt(id)));
    const passedIds = (passedSwipes ?? []).map((s: any) => s.imdb_id).filter((id: string) => isNaN(parseInt(id)));
    const seedTmdbIds: number[] = prefs?.favorite_film_tmdb_ids ?? [];

    const [{ data: likedMovies }, { data: passedMovies }, { data: seedMovies }] = await Promise.all([
      likedIds.length  > 0 ? supabase.from("movies").select("genres, director, year").in("imdb_id", likedIds)  : Promise.resolve({ data: [] as any[] }),
      passedIds.length > 0 ? supabase.from("movies").select("genres, director").in("imdb_id", passedIds)       : Promise.resolve({ data: [] as any[] }),
      seedTmdbIds.length > 0 ? supabase.from("movies").select("genres, director").in("tmdb_id", seedTmdbIds)   : Promise.resolve({ data: [] as any[] }),
    ]);

    const genreLikes  = new Map<string, number>();
    const genrePasses = new Map<string, number>();
    const dirLikes    = new Map<string, number>();
    const dirPasses   = new Map<string, number>();

    for (const m of likedMovies  ?? []) {
      for (const g of m.genres ?? []) genreLikes.set(g,  (genreLikes.get(g)  ?? 0) + 1);
      if (m.director) dirLikes.set(m.director, (dirLikes.get(m.director) ?? 0) + 1);
    }
    for (const m of passedMovies ?? []) {
      for (const g of m.genres ?? []) genrePasses.set(g, (genrePasses.get(g) ?? 0) + 1);
      if (m.director) dirPasses.set(m.director, (dirPasses.get(m.director) ?? 0) + 1);
    }

    const allGenres  = new Set([...genreLikes.keys(), ...genrePasses.keys()]);
    const genreRates = [...allGenres].map(g => {
      const l = genreLikes.get(g) ?? 0, p = genrePasses.get(g) ?? 0;
      return { g, rate: l / (l + p), total: l + p };
    }).filter(x => x.total >= 3);

    const allDirs  = new Set([...dirLikes.keys(), ...dirPasses.keys()]);
    const dirRates = [...allDirs].map(d => {
      const l = dirLikes.get(d) ?? 0, p = dirPasses.get(d) ?? 0;
      return { d, rate: l / (l + p), total: l + p };
    }).filter(x => x.total >= 2);

    const likedYears = (likedMovies ?? []).map((m: any) => m.year).filter((y: number) => y > 1900);
    const eraCenter  = likedYears.length > 0
      ? Math.round(likedYears.reduce((a: number, b: number) => a + b, 0) / likedYears.length)
      : 0;

    return {
      favoriteGenres:  prefs?.preferred_genres ?? [],
      seedGenres:      [...new Set([
        ...genreRates.filter(x => x.rate >= 0.55).sort((a, b) => b.rate - a.rate).slice(0, 6).map(x => x.g),
        ...(seedMovies ?? []).flatMap((m: any) => m.genres ?? []),
      ])],
      seedDirectors:   [...new Set([
        ...dirRates.filter(x => x.rate >= 0.6).sort((a, b) => b.rate - a.rate).slice(0, 4).map(x => x.d),
        ...(seedMovies ?? []).map((m: any) => m.director).filter(Boolean),
      ])],
      passedGenres:    genreRates.filter(x => x.rate <= 0.3).map(x => x.g),
      passedDirectors: dirRates.filter(x => x.rate <= 0.25).map(x => x.d),
      eraCenter,
    };
  }

  const wantsRecent  = filteredSpecial.includes("Recent");
  const currentYear  = new Date().getFullYear();

  // Run prefs, pool, and optional arthouse/recent queries all in parallel
  const poolQuery = supabase
    .from("movies")
    .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating, ebert_great_movie")
    .gte("tmdb_rating", 7.0)
    .order("tmdb_rating", { ascending: false })
    .limit(800);

  const recentQuery = wantsRecent
    ? supabase
        .from("movies")
        .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating, ebert_great_movie")
        .gte("year", currentYear - 3)
        .gte("tmdb_rating", 6.5)
        .order("tmdb_rating", { ascending: false })
        .limit(400)
    : Promise.resolve({ data: [] as any[] });

  const arthouseQuery = wantsArthouse
    ? supabase.from("arthouse_films").select("tmdb_id, award_winner")
    : Promise.resolve({ data: [] as any[] });

  const [allUserPrefs, poolResult, recentResult, arthouseResult] = await Promise.all([
    Promise.all(participantIds.map(getPrefs)),
    poolQuery,
    recentQuery,
    arthouseQuery,
  ]);

  // Fetch arthouse IDs if Art House filter is active — prefer award winners
  let arthouseIds: Set<number> | null = null;
  if (wantsArthouse) {
    const allAf   = arthouseResult.data ?? [];
    const awardIds = allAf.filter((r: any) => r.award_winner).map((r: any) => r.tmdb_id as number);
    const allIds   = allAf.map((r: any) => r.tmdb_id as number);
    arthouseIds = new Set(awardIds.length >= 30 ? awardIds : allIds);
  }

  // Merge base pool with recent films (deduplicated by tmdb_id)
  const seenIds = new Set<number>();
  const mergedPool: any[] = [];
  for (const f of [...(poolResult.data ?? []), ...(recentResult.data ?? [])]) {
    if (!seenIds.has(f.tmdb_id)) {
      seenIds.add(f.tmdb_id);
      mergedPool.push(f);
    }
  }
  const pool = mergedPool;

  const toFilmRecord = (f: any): FilmRecord => ({
    tmdb_id:     f.tmdb_id,
    imdb_id:     f.imdb_id,
    title:       f.title,
    year:        f.year,
    runtime:     f.runtime_minutes ?? 0,
    genres:      f.genres ?? [],
    director:    f.director ?? "",
    plot:        f.plot ?? "",
    poster_url:  f.poster_url ?? "",
    tmdb_rating: f.tmdb_rating ?? 0,
    list_count:  f.ebert_great_movie ? 4 : PRESTIGE_IDS.has(f.tmdb_id) ? 3 : 1,
  });

  // Build the film pool — if provider filter active, fetch from TMDB discover
  // (same approach as the deck route) so we get the full catalog, not just the
  // thin intersection of our prestige DB with the provider library.
  let allFilms: FilmRecord[];

  if (roomProviderFilter && roomProviderFilter.size > 0 && process.env.TMDB_API_KEY) {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    const providerStr = Array.from(roomProviderFilter).join("|");
    const providerPages = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        fetch(
          `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_watch_providers=${providerStr}&watch_region=US&sort_by=vote_average.desc&vote_count.gte=200&include_adult=false&page=${i + 1}`
        ).then(r => r.json()).catch(() => ({ results: [] }))
      )
    );
    const seen = new Set<number>();
    const discoverFilms: FilmRecord[] = providerPages.flatMap((p: any) =>
      (p.results ?? [])
        .filter((f: any) => f.poster_path && f.title && !seen.has(f.id) && seen.add(f.id))
        .map((f: any): FilmRecord => ({
          tmdb_id:     f.id,
          imdb_id:     String(f.id),
          title:       f.title,
          year:        parseInt(f.release_date?.slice(0, 4) ?? "0"),
          runtime:     0,
          genres:      (f.genre_ids ?? []).map((id: number) => {
            const MAP: Record<number,string> = {28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Science Fiction",53:"Thriller",10752:"War",37:"Western"};
            return MAP[id];
          }).filter(Boolean),
          director:    "",
          plot:        f.overview ?? "",
          poster_url:  f.poster_path ? `https://image.tmdb.org/t/p/w780${f.poster_path}` : "",
          tmdb_rating: f.vote_average ?? 0,
          list_count:  PRESTIGE_IDS.has(f.id) ? 3 : 1,
        }))
    );
    // Enrich with DB prestige data for films we have on record
    const dbByTmdbId = new Map((pool ?? []).map((f: any) => [f.tmdb_id, f]));
    allFilms = discoverFilms.map(f => {
      const db = dbByTmdbId.get(f.tmdb_id);
      if (!db) return f;
      return toFilmRecord(db); // use DB version — has full metadata + prestige score
    });
  } else {
    allFilms = (pool ?? [])
      .filter((f: any) => !arthouseIds || arthouseIds.has(f.tmdb_id))
      .map(toFilmRecord);
  }

  const ebertOrPrestige = (f: FilmRecord) => f.list_count >= 3;
  const prestigePool = allFilms.filter(ebertOrPrestige);
  const generalPool  = allFilms.filter(f => !ebertOrPrestige(f) && f.tmdb_rating >= 7.8);

  const emptyPrefs = { favoriteGenres: [], seedGenres: [], seedDirectors: [], passedGenres: [], passedDirectors: [], eraCenter: 0 };
  const deckArgs = {
    swipedIds:    new Set<number>(),
    watchedIds:   new Set<number>(),
    allUserPrefs: allUserPrefs.length > 0 ? allUserPrefs : [emptyPrefs],
    moods:        [] as never[],
    genres,
    special:      filteredSpecial,
  };

  // Target 80% prestige in the 60-film queue
  const TOTAL           = 60;
  const prestigeTarget  = Math.round(TOTAL * 0.8); // 48
  const generalTarget   = TOTAL - prestigeTarget;   // 12

  const prestigeSlice = buildRoomDeck({ pool: prestigePool, ...deckArgs, count: prestigeTarget });
  const extraNeeded   = Math.max(0, prestigeTarget - prestigeSlice.length);
  const generalSlice  = buildRoomDeck({ pool: generalPool, ...deckArgs, count: generalTarget + extraNeeded });

  // Merge and shuffle
  let merged = [...prestigeSlice, ...generalSlice];
  for (let i = merged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [merged[i], merged[j]] = [merged[j], merged[i]];
  }

  const deck = merged;

  // Cache on room row so both users get identical films
  await supabase.from("rooms").update({
    queue_imdb_ids: deck.map(f => f.imdb_id),
    status: "active",
  }).eq("id", room.id);

  return Response.json({ films: deck.map(shapeFilm) });
}

function shapeFilm(f: any) {
  return {
    tmdbId:     f.tmdb_id,
    title:      f.title,
    year:       f.year,
    director:   f.director || "Unknown",
    runtime:    f.runtime_minutes ?? f.runtime ?? 0,
    genres:     f.genres ?? [],
    plot:       f.plot ?? "",
    tmdbRating: f.tmdb_rating ?? 0,
    posterUrl:  f.poster_url ?? "",
  };
}
