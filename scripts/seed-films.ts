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
import { PRESTIGE_IDS } from "../lib/prestige-ids";

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
  // True classics: very high rating + huge vote base
  { label: "Classics (8.0+, 100k votes)",      pages: 5,  params: "sort_by=vote_average.desc&vote_count.gte=100000&vote_average.gte=8.0" },
  // Acclaimed: high rating + solid vote base
  { label: "Acclaimed (7.8+, 50k votes)",       pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=50000&vote_average.gte=7.8" },
  // Quality: good rating + reasonable votes
  { label: "Quality (7.5+, 10k votes)",         pages: 10, params: "sort_by=vote_average.desc&vote_count.gte=10000&vote_average.gte=7.5" },
  // Pre-1980 classics (lower vote counts but still great)
  { label: "Pre-1980 classics",                  pages: 8,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.5&primary_release_date.lte=1980-12-31" },
  // Japanese cinema
  { label: "Japanese cinema",                    pages: 5,  params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.5&with_original_language=ja" },
  // French cinema
  { label: "French cinema",                      pages: 5,  params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.5&with_original_language=fr" },
  // Italian cinema
  { label: "Italian cinema",                     pages: 4,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.5&with_original_language=it" },
  // Korean cinema
  { label: "Korean cinema",                      pages: 4,  params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.5&with_original_language=ko" },
  // German / Austrian cinema
  { label: "German cinema",                      pages: 3,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.5&with_original_language=de" },
  // Russian / Soviet cinema
  { label: "Russian/Soviet cinema",              pages: 3,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.5&with_original_language=ru" },
  // Spanish-language cinema
  { label: "Spanish-language cinema",            pages: 4,  params: "sort_by=vote_average.desc&vote_count.gte=2000&vote_average.gte=7.5&with_original_language=es" },
  // Chinese / Mandarin cinema
  { label: "Chinese cinema",                     pages: 3,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.5&with_original_language=zh" },
  // Documentary
  { label: "Documentaries",                      pages: 4,  params: "sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=7.5&with_genres=99" },
  // Animation (non-English)
  { label: "Animation",                          pages: 3,  params: "sort_by=vote_average.desc&vote_count.gte=5000&vote_average.gte=7.5&with_genres=16" },
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
