/**
 * Seed the arthouse_films table from Wikipedia festival pages.
 *
 * Scrapes official selections from 6 major arthouse festivals (2010–present)
 * via the Wikipedia API, resolves each film against TMDB, and upserts into:
 *   - movies (with full film data)
 *   - arthouse_films (tmdb_id + which festivals selected the film)
 *
 * Run with:
 *   npx tsx scripts/seed-arthouse.ts
 */

import * as fs from "fs";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

// ── Env ───────────────────────────────────────────────────────────────────
const envFile = fs.readFileSync(".env.local", "utf8");
const env: Record<string, string> = {};
envFile.split("\n").forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const eq = trimmed.indexOf("=");
  if (eq > 0) {
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, ""); // strip optional quotes
    env[key] = val;
  }
});

const TMDB_KEY = env["TMDB_API_KEY"];
const SUPA_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SUPA_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];
if (!TMDB_KEY || !SUPA_URL || !SUPA_KEY) { console.error("Missing env vars"); process.exit(1); }

const supabase = createClient(SUPA_URL, SUPA_KEY);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const GENRE_MAP: Record<number, string> = {
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",
  18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",
  9648:"Mystery",10749:"Romance",878:"Science Fiction",53:"Thriller",10752:"War",37:"Western",
};

// ── Festival Wikipedia page title generators ──────────────────────────────
function ordinalSuffix(n: number): string {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const FESTIVALS: Array<{
  name: string;
  pageTitle: (year: number) => string;
}> = [
  {
    name: "Cannes",
    pageTitle: y => `${y}_Cannes_Film_Festival`,
  },
  {
    name: "Venice",
    pageTitle: y => `${y}_Venice_International_Film_Festival`,
  },
  {
    name: "Berlin",
    // 1951 = 1st, so ordinal = year - 1950
    pageTitle: y => `${ordinalSuffix(y - 1950)}_Berlin_International_Film_Festival`,
  },
  {
    name: "TIFF",
    pageTitle: y => `${y}_Toronto_International_Film_Festival`,
  },
  {
    name: "Sundance",
    pageTitle: y => `${y}_Sundance_Film_Festival`,
  },
  {
    name: "Locarno",
    pageTitle: y => `${y}_Locarno_Film_Festival`,
  },
];

// ── Fetch Wikipedia page HTML ─────────────────────────────────────────────
async function fetchWikiPage(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ReelApp/1.0 (film database seed script)" } });
    const data = await res.json();
    if (data.error) return null;
    return data.parse?.text ?? null;
  } catch {
    return null;
  }
}

// ── Extract film titles from Wikipedia HTML ───────────────────────────────
function extractFilmTitles(html: string): Array<{ title: string; director: string }> {
  const $ = cheerio.load(html);
  const results: Array<{ title: string; director: string }> = [];
  const seen = new Set<string>();

  $("table.wikitable").each((_, table) => {
    const headers: string[] = [];
    $(table).find("tr").first().find("th").each((_, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });

    const filmCol   = headers.findIndex(h => h.includes("film") || h.includes("title"));
    const dirCol    = headers.findIndex(h => h.includes("director"));

    if (filmCol === -1) return; // Not a film table

    $(table).find("tr").slice(1).each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length === 0) return;

      const filmCell = cells.eq(filmCol);
      // Film titles are often in <i> tags or the first link
      let title = filmCell.find("i").first().text().trim()
        || filmCell.find("a").first().text().trim()
        || filmCell.text().trim();

      // Clean up title — remove footnotes like [1], trailing punctuation
      title = title.replace(/\[\d+\]/g, "").replace(/[*†]/g, "").trim();
      if (!title || title.length < 2 || title.length > 100) return;

      const director = dirCol >= 0
        ? cells.eq(dirCol).text().replace(/\[\d+\]/g, "").trim().split("\n")[0].trim()
        : "";

      if (!seen.has(title.toLowerCase())) {
        seen.add(title.toLowerCase());
        results.push({ title, director });
      }
    });
  });

  return results;
}

// ── Search TMDB for a film ────────────────────────────────────────────────
async function searchTmdb(title: string, year: number): Promise<any | null> {
  // Try with year first, then without
  for (const yearParam of [year, 0]) {
    const params = new URLSearchParams({
      api_key: TMDB_KEY,
      query: title,
      include_adult: "false",
    });
    if (yearParam) params.set("year", String(yearParam));

    const res = await fetch(`https://api.themoviedb.org/3/search/movie?${params}`).then(r => r.json()).catch(() => null);
    const results = res?.results ?? [];

    // Pick best match: must have a poster, prefer exact title match
    const match = results.find((f: any) =>
      f.poster_path &&
      f.title?.toLowerCase() === title.toLowerCase()
    ) ?? results.find((f: any) =>
      f.poster_path &&
      f.vote_count >= 5
    );

    if (match) return match;
  }
  return null;
}

// ── Fetch full TMDB detail (director, runtime, imdb_id) ──────────────────
async function fetchTmdbDetail(tmdbId: number): Promise<{ imdb_id: string | null; director: string | null; runtime: number | null }> {
  try {
    const [detail, credits] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${TMDB_KEY}`).then(r => r.json()),
    ]);
    return {
      imdb_id:  detail.external_ids?.imdb_id ?? null,
      director: (credits.crew as Array<{ job: string; name: string }> | undefined)?.find(c => c.job === "Director")?.name ?? null,
      runtime:  detail.runtime ?? null,
    };
  } catch {
    return { imdb_id: null, director: null, runtime: null };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const START_YEAR = 2010;
  const END_YEAR   = new Date().getFullYear();

  // Track tmdb_id → festivals[] for final upsert
  const filmFestivals = new Map<number, Set<string>>();
  const filmData      = new Map<number, any>(); // tmdb_id → movie row

  console.log(`Scraping ${FESTIVALS.length} festivals from ${START_YEAR}–${END_YEAR}...\n`);

  for (const festival of FESTIVALS) {
    let festivalTotal = 0;
    process.stdout.write(`${festival.name}: `);

    for (let year = START_YEAR; year <= END_YEAR; year++) {
      const pageTitle = festival.pageTitle(year);
      const html = await fetchWikiPage(pageTitle);
      await sleep(300); // Respect Wikipedia rate limits

      if (!html) continue;

      const films = extractFilmTitles(html);
      let yearTotal = 0;

      // Process in small batches to respect TMDB limits
      for (let i = 0; i < films.length; i += 3) {
        const batch = films.slice(i, i + 3);
        await Promise.all(batch.map(async ({ title, director: wikiDirector }) => {
          const tmdbResult = await searchTmdb(title, year);
          if (!tmdbResult) return;

          const tmdbId = tmdbResult.id;

          // Mark festival
          if (!filmFestivals.has(tmdbId)) filmFestivals.set(tmdbId, new Set());
          filmFestivals.get(tmdbId)!.add(festival.name);

          // Store film data if not already seen
          if (!filmData.has(tmdbId)) {
            filmData.set(tmdbId, {
              tmdb_id:     tmdbId,
              title:       tmdbResult.title,
              year:        parseInt(tmdbResult.release_date?.slice(0, 4) ?? String(year)),
              genres:      (tmdbResult.genre_ids ?? []).map((id: number) => GENRE_MAP[id]).filter(Boolean),
              plot:        tmdbResult.overview ?? "",
              poster_url:  tmdbResult.poster_path ? `https://image.tmdb.org/t/p/w780${tmdbResult.poster_path}` : "",
              tmdb_rating: tmdbResult.vote_average ?? 0,
              director:    wikiDirector || null,
              imdb_id:     null, // filled in Phase 2
              runtime_minutes: null,
            });
            yearTotal++;
          }
        }));
        await sleep(200);
      }

      festivalTotal += yearTotal;
      process.stdout.write(`${year}(${yearTotal}) `);
    }
    console.log(`→ ${festivalTotal} new films\n`);
  }

  const allTmdbIds = Array.from(filmData.keys());
  console.log(`\nTotal unique films found: ${allTmdbIds.length}`);

  // ── Phase 2: Fill in missing directors + imdb_ids ─────────────────────
  console.log("\nFetching detailed data for films missing director/imdb_id...");
  const needsDetail = allTmdbIds.filter(id => !filmData.get(id)?.director || !filmData.get(id)?.imdb_id);
  console.log(`${needsDetail.length} films need detail fetch`);

  for (let i = 0; i < needsDetail.length; i += 5) {
    const batch = needsDetail.slice(i, i + 5);
    const details = await Promise.all(batch.map(id => fetchTmdbDetail(id)));
    batch.forEach((id, j) => {
      const film = filmData.get(id)!;
      if (!film.director && details[j].director) film.director = details[j].director;
      if (!film.imdb_id  && details[j].imdb_id)  film.imdb_id  = details[j].imdb_id;
      if (!film.runtime_minutes && details[j].runtime) film.runtime_minutes = details[j].runtime;
    });
    await sleep(400);
    if (i % 50 === 0) process.stdout.write(`  ${i}/${needsDetail.length}\r`);
  }

  // ── Phase 3: Check which films are already in the movies DB ──────────────
  console.log("\n\nUpserting into movies table...");
  const { data: existing } = await supabase.from("movies").select("tmdb_id");
  const existingIds = new Set((existing ?? []).map((r: any) => r.tmdb_id));
  const toUpsert = allTmdbIds.filter(id => {
    const f = filmData.get(id)!;
    return f.poster_url && f.title; // Only insert films with basic data
  });

  const BATCH = 20;
  for (let i = 0; i < toUpsert.length; i += BATCH) {
    const batch = toUpsert.slice(i, i + BATCH).map(id => {
      const f = filmData.get(id)!;
      return {
        tmdb_id:         f.tmdb_id,
        imdb_id:         f.imdb_id ?? String(f.tmdb_id),
        title:           f.title,
        year:            f.year,
        runtime_minutes: f.runtime_minutes,
        genres:          f.genres,
        director:        f.director,
        plot:            f.plot,
        poster_url:      f.poster_url,
        tmdb_rating:     f.tmdb_rating,
      };
    });
    const { error } = await supabase.from("movies").upsert(batch, { onConflict: "tmdb_id" });
    if (error) console.error(`  movies upsert error at ${i}: ${error.message}`);
    await sleep(200);
  }

  // ── Phase 4: Upsert into arthouse_films ──────────────────────────────────
  console.log("Upserting into arthouse_films table...");
  const arthouseRows = allTmdbIds
    .filter(id => filmData.get(id)?.poster_url)
    .map(id => ({
      tmdb_id:   id,
      festivals: Array.from(filmFestivals.get(id) ?? []),
    }));

  for (let i = 0; i < arthouseRows.length; i += BATCH) {
    const batch = arthouseRows.slice(i, i + BATCH);
    const { error } = await supabase.from("arthouse_films").upsert(batch, { onConflict: "tmdb_id" });
    if (error) console.error(`  arthouse_films upsert error at ${i}: ${error.message}`);
    await sleep(100);
  }

  console.log(`\n✓ Done. ${arthouseRows.length} films in arthouse_films table.`);
}

main().catch(err => { console.error(err); process.exit(1); });
