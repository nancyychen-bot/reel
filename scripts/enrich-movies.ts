/**
 * Pre-warm the enrichment cache for all movies in the DB.
 * Fetches OMDB + TMDB data and writes to enrichment columns so the
 * app doesn't burn the 1000 req/day OMDB limit on live requests.
 *
 * Prioritises by tmdb_rating desc so the best films are cached first.
 * OMDB limit is 1000/day — run again tomorrow to finish the rest.
 *
 * Run with:
 *   npx tsx scripts/enrich-movies.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OMDB_KEY      = process.env.OMDB_API_KEY!;
const TMDB_KEY      = process.env.TMDB_API_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || !OMDB_KEY || !TMDB_KEY) {
  console.error("Missing env vars — check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OMDB_LIMIT   = 950; // leave 50 headroom
const DELAY_MS     = 250; // ~4 req/sec, well under rate limits

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchTrailerKey(tmdbId: number): Promise<string | undefined> {
  const data = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${TMDB_KEY}`
  ).then(r => r.json()).catch(() => null);
  const videos: Array<{ site: string; type: string; key: string; official: boolean }> = data?.results ?? [];
  const trailers = videos.filter(v => v.site === "YouTube" && v.type === "Trailer");
  const pick = trailers.find(v => v.official) ?? trailers[0];
  return pick?.key;
}

async function enrichOne(movie: {
  tmdb_id: number;
  imdb_id: string | null;
  director: string | null;
  runtime_minutes: number | null;
}): Promise<boolean> {
  const { tmdb_id, imdb_id } = movie;

  let resolvedImdbId = imdb_id;
  let director = movie.director ?? undefined;
  let runtime  = movie.runtime_minutes ?? undefined;
  let language: string | undefined;
  let country:  string | undefined;
  let trailerKey: string | undefined;

  // If no imdb_id, fetch from TMDB
  if (!resolvedImdbId) {
    const tmdbRes = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdb_id}?api_key=${TMDB_KEY}&append_to_response=external_ids,credits`
    ).then(r => r.json()).catch(() => null);

    resolvedImdbId = tmdbRes?.external_ids?.imdb_id ?? null;
    if (!director) {
      director = (tmdbRes?.credits?.crew as Array<{ job: string; name: string }> | undefined)
        ?.find(c => c.job === "Director")?.name;
    }
    if (!runtime) runtime = tmdbRes?.runtime ?? undefined;
    language = tmdbRes?.original_language
      ? new Intl.DisplayNames(["en"], { type: "language" }).of(tmdbRes.original_language)
      : undefined;
    country = (tmdbRes?.production_countries as Array<{ name: string }> | undefined)?.[0]?.name;

    await sleep(DELAY_MS);
  }

  trailerKey = await fetchTrailerKey(tmdb_id);
  await sleep(DELAY_MS);

  let imdbRating: number | undefined;
  let rtScore:    number | undefined;
  let awards:     string | undefined;

  if (resolvedImdbId) {
    const omdb = await fetch(
      `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${resolvedImdbId}`
    ).then(r => r.json()).catch(() => null);

    await sleep(DELAY_MS);

    if (omdb && omdb.Response !== "False") {
      const rtRating = (omdb.Ratings as Array<{ Source: string; Value: string }> | undefined)
        ?.find(r => r.Source === "Rotten Tomatoes");
      rtScore    = rtRating ? parseInt(rtRating.Value) : undefined;
      imdbRating = omdb.imdbRating && omdb.imdbRating !== "N/A" ? parseFloat(omdb.imdbRating) : undefined;
      awards     = omdb.Awards && omdb.Awards !== "N/A" ? omdb.Awards : undefined;
      if (!director) director = omdb.Director !== "N/A" ? omdb.Director : undefined;
      if (!runtime)  runtime  = omdb.Runtime  !== "N/A" ? parseInt(omdb.Runtime) : undefined;
      if (!language) language = omdb.Language !== "N/A" ? omdb.Language : undefined;
      if (!country)  country  = omdb.Country  !== "N/A" ? omdb.Country  : undefined;
    }
  }

  const { error } = await supabase
    .from("movies")
    .update({
      imdb_id:        resolvedImdbId ?? undefined,
      imdb_rating:    imdbRating,
      rt_score:       rtScore,
      awards_text:    awards,
      trailer_key:    trailerKey,
      language,
      country,
      director,
      runtime_minutes: runtime,
      enriched_at:    new Date().toISOString(),
    })
    .eq("tmdb_id", tmdb_id);

  if (error) {
    console.error(`  ✗ tmdb_id=${tmdb_id}: ${error.message}`);
    return false;
  }
  return true;
}

async function main() {
  console.log("Fetching unenriched movies from DB...");

  // Fetch all unenriched movies, highest-rated first
  const { data: movies, error } = await supabase
    .from("movies")
    .select("tmdb_id, imdb_id, director, runtime_minutes")
    .is("enriched_at", null)
    .order("tmdb_rating", { ascending: false })
    .limit(OMDB_LIMIT);

  if (error) { console.error(error); process.exit(1); }
  if (!movies?.length) { console.log("All movies already enriched!"); return; }

  console.log(`Enriching ${movies.length} movies (OMDB limit: ${OMDB_LIMIT})...\n`);

  let done = 0, failed = 0;
  for (const movie of movies) {
    process.stdout.write(`[${done + failed + 1}/${movies.length}] tmdb_id=${movie.tmdb_id} imdb_id=${movie.imdb_id ?? "?"} ... `);
    const ok = await enrichOne(movie as any);
    if (ok) { done++;   console.log("✓"); }
    else    { failed++; }
  }

  console.log(`\nDone: ${done} enriched, ${failed} failed.`);

  // Report remaining
  const { count } = await supabase
    .from("movies")
    .select("tmdb_id", { count: "exact", head: true })
    .is("enriched_at", null);
  if (count) console.log(`${count} movies still unenriched — run again tomorrow.`);
  else       console.log("All movies are now enriched!");
}

main();
