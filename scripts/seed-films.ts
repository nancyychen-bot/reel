/**
 * Seed the movies table with critically acclaimed films from TMDB.
 *
 * Since Letterboxd blocks server-side requests, this uses TMDB Discover
 * with multiple targeted queries that approximate the kinds of films
 * found on Letterboxd Top 250, Sight & Sound, Criterion, etc.
 *
 * Run with:
 *   npx tsx scripts/seed-films.ts
 */

import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";

// Prestige TMDB IDs — films that should always be in the DB
// (mirrors lib/prestige-ids.ts — keep in sync if updating)
const PRESTIGE_IDS = new Set<number>([
  // Silent & pre-war
  15,534,3920,34,981,7001,11426,15807,19665,19815,4713,18979,31555,
  // 1940s
  289,9377,2769,9808,984,
  // 1950s
  346,11877,1903,490,22502,18717,15093,11778,14551,16361,4611,18917,11499,12666,
  2157,8204,4154,4975,950,24085,18491,11532,21504,24427,
  // 1960s
  1397,1340,2990,2649,7988,23400,10073,22285,22488,10054,15260,15474,4809,9820,
  14576,12079,10293,14522,29907,26547,10528,17517,7980,14891,13841,23054,12662,
  12613,213,18946,8077,935,4011,20,539,
  // 1970s
  238,240,1535,62,28,820,4231,185,15919,703,1362,10530,2975,8953,11202,6982,
  3282,6984,14537,11875,12476,1585,2274,2469,1911,10017,37285,14190,389,10999,8467,
  // 1980s
  8062,22183,10837,6972,11645,11517,33267,398,46120,149,10515,8392,26354,30498,
  11876,3059,1710,194,78,694,20629,26519,33514,13096,22490,10921,12477,21799,34734,26505,
  // 1990s
  128,424,680,9655,28178,11072,11362,9472,769,11374,11622,9540,9527,14700,9591,
  1582,15340,23649,29833,11839,13234,19105,14916,22803,1422,11564,19,1645,19841,21732,18897,9830,
  // 2000s
  129,10539,11514,16820,11040,3060,11553,403,670,9343,4761,1018,4174,4803,9329,14069,
  598,38,153,4586,9298,1933,1638,13616,12697,44943,20765,7345,6977,12691,14647,12720,
  14280,27586,3053,89540,27346,107044,
  // 2010s
  21728,72579,103216,13277,46738,52494,52365,65843,60308,74643,60827,70670,69151,
  92368,104732,38757,204197,218613,195544,176042,196936,209112,258846,242268,227700,
  260310,169232,328111,254128,295842,309566,320573,381288,376867,344786,342473,373977,
  247614,95516,445617,427396,432132,400535,415442,422855,432121,508442,534352,491418,
  517208,527774,552688,519632,496243,601666,530385,612885,617258,591028,577922,492188,
  522241,378236,
  // 2020s
  581734,710017,736804,762504,649097,650871,736140,755566,770245,792777,674324,811721,
  813640,774752,829280,830082,654393,1008042,1034041,1064213,1084199,1164707,
]);

// ── Env ───────────────────────────────────────────────────────────────────
const envFile = fs.readFileSync(".env.local", "utf8");
const env: Record<string, string> = {};
envFile.split("\n").forEach(line => {
  const eq = line.indexOf("=");
  if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
});

const TMDB_KEY = env["TMDB_API_KEY"];
const SUPA_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SUPA_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!TMDB_KEY || !SUPA_URL || !SUPA_KEY) {
  console.error("Missing env vars. Check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPA_URL, SUPA_KEY);

const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  53: "Thriller", 10752: "War", 37: "Western",
};

// ── Discovery tiers ──────────────────────────────────────────────────────
// Each tier targets a different slice of acclaimed cinema.
const TIERS = [
  // ── English-language quality bands ──────────────────────────────────────
  { label: "Classics (8.0+, 100k votes)",        pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=100000&vote_average.gte=8.0" },
  { label: "Acclaimed (7.8+, 50k votes)",         pages: 20, params: "sort_by=vote_average.desc&vote_count.gte=50000&vote_average.gte=7.8" },
  { label: "Quality (7.5+, 10k votes)",           pages: 25, params: "sort_by=vote_average.desc&vote_count.gte=10000&vote_average.gte=7.5" },
  { label: "Solid (7.2+, 5k votes)",              pages: 20, params: "sort_by=vote_average.desc&vote_count.gte=5000&vote_average.gte=7.2" },
  { label: "Deep cut (7.0+, 2k votes)",           pages: 20, params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.0" },
  { label: "Cult (7.5+, 500 votes)",              pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=500&vote_count.lte=5000&vote_average.gte=7.5" },

  // ── Popular / mainstream ─────────────────────────────────────────────────
  { label: "Popular blockbusters",                pages: 15, params: "sort_by=revenue.desc&vote_count.gte=5000&vote_average.gte=6.5" },
  { label: "Popular by vote count",               pages: 15, params: "sort_by=vote_count.desc&vote_average.gte=7.0" },
  { label: "Popular recent (2015+)",              pages: 12, params: "sort_by=popularity.desc&vote_count.gte=5000&vote_average.gte=6.8&primary_release_date.gte=2015-01-01" },

  // ── Decade-specific ──────────────────────────────────────────────────────
  { label: "Pre-1950 classics",                   pages: 10, params: "sort_by=vote_average.desc&vote_count.gte=500&vote_average.gte=7.0&primary_release_date.lte=1949-12-31" },
  { label: "1950s cinema",                        pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=500&vote_average.gte=7.0&primary_release_date.gte=1950-01-01&primary_release_date.lte=1959-12-31" },
  { label: "1960s cinema",                        pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=500&vote_average.gte=7.0&primary_release_date.gte=1960-01-01&primary_release_date.lte=1969-12-31" },
  { label: "1970s cinema",                        pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&primary_release_date.gte=1970-01-01&primary_release_date.lte=1979-12-31" },
  { label: "1980s cinema",                        pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31" },
  { label: "1990s cinema",                        pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.0&primary_release_date.gte=1990-01-01&primary_release_date.lte=1999-12-31" },
  { label: "2000s cinema",                        pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.0&primary_release_date.gte=2000-01-01&primary_release_date.lte=2009-12-31" },
  { label: "2010s cinema",                        pages: 20, params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.0&primary_release_date.gte=2010-01-01&primary_release_date.lte=2019-12-31" },
  { label: "Recent (2020+)",                      pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=6.8&primary_release_date.gte=2020-01-01" },
  { label: "Recent popular (2020+)",              pages: 10, params: "sort_by=popularity.desc&vote_count.gte=3000&vote_average.gte=6.5&primary_release_date.gte=2020-01-01" },

  // ── East Asian cinema ────────────────────────────────────────────────────
  { label: "Japanese cinema",                     pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=500&vote_average.gte=7.0&with_original_language=ja" },
  { label: "Japanese popular",                    pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=2000&vote_average.gte=6.5&with_original_language=ja" },
  { label: "Korean cinema",                       pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=500&vote_average.gte=7.0&with_original_language=ko" },
  { label: "Korean popular",                      pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=2000&vote_average.gte=6.5&with_original_language=ko" },
  { label: "Chinese cinema",                      pages: 10, params: "sort_by=vote_average.desc&vote_count.gte=300&vote_average.gte=7.0&with_original_language=zh" },
  { label: "Chinese popular",                     pages: 6,  params: "sort_by=popularity.desc&vote_count.gte=1000&vote_average.gte=6.5&with_original_language=zh" },

  // ── European cinema ──────────────────────────────────────────────────────
  { label: "French cinema",                       pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=500&vote_average.gte=7.0&with_original_language=fr" },
  { label: "French popular",                      pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=1000&vote_average.gte=6.5&with_original_language=fr" },
  { label: "Italian cinema",                      pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=300&vote_average.gte=7.0&with_original_language=it" },
  { label: "German cinema",                       pages: 10, params: "sort_by=vote_average.desc&vote_count.gte=300&vote_average.gte=7.0&with_original_language=de" },
  { label: "Spanish-language cinema",             pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=500&vote_average.gte=7.0&with_original_language=es" },
  { label: "Spanish popular",                     pages: 6,  params: "sort_by=popularity.desc&vote_count.gte=1000&vote_average.gte=6.5&with_original_language=es" },
  { label: "Russian/Soviet cinema",               pages: 10, params: "sort_by=vote_average.desc&vote_count.gte=300&vote_average.gte=7.0&with_original_language=ru" },
  { label: "Swedish cinema",                      pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=sv" },
  { label: "Danish cinema",                       pages: 6,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=da" },
  { label: "Norwegian cinema",                    pages: 6,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=nb" },
  { label: "Finnish cinema",                      pages: 4,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=fi" },
  { label: "Polish cinema",                       pages: 6,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=pl" },
  { label: "Czech cinema",                        pages: 5,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=cs" },
  { label: "Hungarian cinema",                    pages: 4,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=hu" },
  { label: "Romanian cinema",                     pages: 4,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=ro" },
  { label: "Greek cinema",                        pages: 4,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=el" },
  { label: "Dutch cinema",                        pages: 4,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=nl" },

  // ── South & West Asian cinema ────────────────────────────────────────────
  { label: "Hindi cinema",                        pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_original_language=hi" },
  { label: "Hindi popular",                       pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=2000&vote_average.gte=6.5&with_original_language=hi" },
  { label: "Iranian cinema",                      pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=fa" },
  { label: "Turkish cinema",                      pages: 6,  params: "sort_by=vote_average.desc&vote_count.gte=500&vote_average.gte=7.0&with_original_language=tr" },
  { label: "Arabic cinema",                       pages: 5,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=ar" },

  // ── Other world cinema ───────────────────────────────────────────────────
  { label: "Portuguese cinema",                   pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=pt" },
  { label: "Portuguese popular",                  pages: 5,  params: "sort_by=popularity.desc&vote_count.gte=1000&vote_average.gte=6.5&with_original_language=pt" },
  { label: "Tamil cinema",                        pages: 6,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_original_language=ta" },
  { label: "Telugu cinema",                       pages: 5,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_original_language=te" },
  { label: "Filipino cinema",                     pages: 4,  params: "sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.0&with_original_language=tl" },

  // ── Genre deep-dives ─────────────────────────────────────────────────────
  { label: "Documentaries",                       pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=300&vote_average.gte=7.0&with_genres=99" },
  { label: "Documentary popular",                 pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=500&vote_average.gte=6.5&with_genres=99" },
  { label: "Animation",                           pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_genres=16" },
  { label: "Animation popular",                   pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=2000&vote_average.gte=6.5&with_genres=16" },
  { label: "Horror",                              pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=6.8&with_genres=27" },
  { label: "Horror popular",                      pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=2000&vote_average.gte=6.5&with_genres=27" },
  { label: "Sci-Fi",                              pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_genres=878" },
  { label: "Sci-Fi popular",                      pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=3000&vote_average.gte=6.5&with_genres=878" },
  { label: "Thriller",                            pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_genres=53" },
  { label: "Thriller popular",                    pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=3000&vote_average.gte=6.5&with_genres=53" },
  { label: "Crime",                               pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_genres=80" },
  { label: "Crime popular",                       pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=3000&vote_average.gte=6.5&with_genres=80" },
  { label: "Drama",                               pages: 15, params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.2&with_genres=18" },
  { label: "Romance",                             pages: 10, params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_genres=10749" },
  { label: "Romance popular",                     pages: 6,  params: "sort_by=popularity.desc&vote_count.gte=2000&vote_average.gte=6.5&with_genres=10749" },
  { label: "Comedy",                              pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.0&with_genres=35" },
  { label: "Comedy popular",                      pages: 8,  params: "sort_by=popularity.desc&vote_count.gte=3000&vote_average.gte=6.5&with_genres=35" },
  { label: "Action",                              pages: 12, params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.0&with_genres=28" },
  { label: "Action popular",                      pages: 10, params: "sort_by=popularity.desc&vote_count.gte=5000&vote_average.gte=6.5&with_genres=28" },
  { label: "Adventure",                           pages: 10, params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.0&with_genres=12" },
  { label: "Western",                             pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=500&vote_average.gte=7.0&with_genres=37" },
  { label: "War",                                 pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_genres=10752" },
  { label: "Mystery",                             pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_genres=9648" },
  { label: "Music",                               pages: 6,  params: "sort_by=vote_average.desc&vote_count.gte=500&vote_average.gte=7.0&with_genres=10402" },
  { label: "History",                             pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.0&with_genres=36" },
  { label: "Family",                              pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.0&with_genres=10751" },
  { label: "Fantasy",                             pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.0&with_genres=14" },
];

// ── Fetch a TMDB detail page ──────────────────────────────────────────────
async function fetchDetail(tmdbId: number): Promise<{
  imdb_id: string | null;
  director: string | null;
  runtime: number | null;
}> {
  try {
    const [detail, credits] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`)
        .then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${TMDB_KEY}`)
        .then(r => r.json()),
    ]);
    return {
      imdb_id:  detail.external_ids?.imdb_id ?? null,
      director: (credits.crew as Array<{ job: string; name: string }> | undefined)
                  ?.find(c => c.job === "Director")?.name ?? null,
      runtime:  detail.runtime ?? null,
    };
  } catch {
    return { imdb_id: null, director: null, runtime: null };
  }
}

// ── Fetch a full film record by TMDB ID (for prestige seeding) ────────────
async function fetchFullDetail(tmdbId: number): Promise<{
  tmdb_id: number; imdb_id: string; title: string; year: number;
  runtime_minutes: number | null; genres: string[]; director: string | null;
  plot: string; poster_url: string; tmdb_rating: number;
} | null> {
  try {
    const [detail, credits] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`)
        .then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${TMDB_KEY}`)
        .then(r => r.json()),
    ]);
    if (!detail.title || !detail.poster_path) return null;
    return {
      tmdb_id:         tmdbId,
      imdb_id:         detail.external_ids?.imdb_id ?? String(tmdbId),
      title:           detail.title,
      year:            parseInt(detail.release_date?.slice(0, 4) ?? "0"),
      runtime_minutes: detail.runtime ?? null,
      genres:          (detail.genres ?? []).map((g: { name: string }) => g.name),
      director:        (credits.crew as Array<{ job: string; name: string }> | undefined)
                         ?.find(c => c.job === "Director")?.name ?? null,
      plot:            detail.overview ?? "",
      poster_url:      `https://image.tmdb.org/t/p/w780${detail.poster_path}`,
      tmdb_rating:     detail.vote_average ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Delay helper ─────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  // 1. Collect all candidate films from discover
  const seen = new Set<number>();
  const candidates: Array<{
    tmdb_id: number; title: string; year: number; genres: string[];
    plot: string; poster_url: string; tmdb_rating: number;
  }> = [];

  console.log("Phase 1: Collecting films from TMDB Discover…\n");

  for (const tier of TIERS) {
    process.stdout.write(`  ${tier.label}… `);
    let added = 0;
    for (let page = 1; page <= tier.pages; page++) {
      const res = await fetch(
        `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&include_adult=false&${tier.params}&page=${page}`
      ).then(r => r.json()).catch(() => ({ results: [] }));

      for (const f of (res.results ?? [])) {
        if (!f.poster_path || !f.title || seen.has(f.id)) continue;
        seen.add(f.id);
        candidates.push({
          tmdb_id:     f.id,
          title:       f.title,
          year:        parseInt(f.release_date?.slice(0, 4) ?? "0"),
          genres:      (f.genre_ids ?? []).map((id: number) => GENRE_MAP[id]).filter(Boolean),
          plot:        f.overview ?? "",
          poster_url:  `https://image.tmdb.org/t/p/w780${f.poster_path}`,
          tmdb_rating: f.vote_average ?? 0,
        });
        added++;
      }
      await sleep(120); // respect TMDB rate limit
    }
    console.log(`${added} films`);
  }

  console.log(`\nTotal unique candidates: ${candidates.length}`);

  // 2. Check which tmdb_ids already exist in DB
  const { data: existing } = await supabase.from("movies").select("tmdb_id");
  const existingIds = new Set((existing ?? []).map((r: any) => r.tmdb_id));
  const toFetch = candidates.filter(c => !existingIds.has(c.tmdb_id));
  console.log(`Already in DB: ${existingIds.size} | Need detail fetch: ${toFetch.length}\n`);

  // 3. Fetch full details (director, runtime, IMDB ID) in batches
  console.log("Phase 2: Fetching film details…\n");
  const BATCH = 5;
  let inserted = 0;

  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const details = await Promise.all(batch.map(f => fetchDetail(f.tmdb_id)));

    const rows = batch.map((f, j) => ({
      tmdb_id:         f.tmdb_id,
      imdb_id:         details[j].imdb_id ?? String(f.tmdb_id),
      title:           f.title,
      year:            f.year,
      runtime_minutes: details[j].runtime,
      genres:          f.genres,
      director:        details[j].director,
      plot:            f.plot,
      poster_url:      f.poster_url,
      tmdb_rating:     f.tmdb_rating,
    }));

    const { error } = await supabase.from("movies").upsert(rows, { onConflict: "tmdb_id" });
    if (error) console.error(`  Upsert error at batch ${i}: ${error.message}`);
    else inserted += rows.length;

    if ((i / BATCH) % 10 === 0) {
      process.stdout.write(`  ${inserted}/${toFetch.length} films saved…\r`);
    }

    await sleep(350); // ~40 req/s TMDB limit, we're doing 10 req per batch
  }

  // 4. Phase 3: Ensure all prestige films are in the DB
  //    Some obscure arthouse films have low vote counts and won't appear in Discover.
  //    Fetch them directly by TMDB ID.
  console.log("\nPhase 3: Ensuring prestige films are seeded…\n");
  const allIds = new Set([...existingIds, ...toFetch.map(c => c.tmdb_id)]);
  const missingPrestige = Array.from(PRESTIGE_IDS).filter(id => !allIds.has(id));
  console.log(`  Prestige films missing from DB: ${missingPrestige.length}`);

  let prestigeInserted = 0;
  for (let i = 0; i < missingPrestige.length; i += BATCH) {
    const batch = missingPrestige.slice(i, i + BATCH);
    const details = await Promise.all(batch.map(id => fetchFullDetail(id)));
    const rows = details.filter(d => d !== null) as NonNullable<typeof details[0]>[];
    if (rows.length) {
      const { error } = await supabase.from("movies").upsert(rows, { onConflict: "tmdb_id" });
      if (error) console.error(`  Prestige upsert error: ${error.message}`);
      else prestigeInserted += rows.length;
    }
    await sleep(400);
  }

  console.log(`\n✓ Seeded ${inserted} discover films + ${prestigeInserted} prestige films.`);
  console.log(`  DB now has ~${existingIds.size + inserted + prestigeInserted} total.\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
