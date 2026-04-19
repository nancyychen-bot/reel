/**
 * Letterboxd scraper — populates movies, curated_lists, curated_list_items.
 *
 * Run with:
 *   npx tsx scripts/scrape-letterboxd.ts
 *
 * Requires: TMDB_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import * as fs from "fs";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { SEED_LISTS } from "./seed-lists";

// Load env
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

// ── Supabase admin client ──────────────────────────────────────────────────
const supabase = createClient(SUPA_URL, SUPA_KEY);

// ── TMDB helpers ──────────────────────────────────────────────────────────
async function tmdbSearch(title: string, year?: number) {
  const url = new URL("https://api.themoviedb.org/3/search/movie");
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("query", title);
  if (year) url.searchParams.set("year", String(year));

  const res = await fetch(url.toString());
  const data = await res.json();
  return data.results?.[0] ?? null;
}

async function tmdbDetail(id: number) {
  const [detail, credits] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}&append_to_response=external_ids`).then(r => r.json()),
    fetch(`https://api.themoviedb.org/3/movie/${id}/credits?api_key=${TMDB_KEY}`).then(r => r.json()),
  ]);
  const director = credits.crew?.find((c: any) => c.job === "Director")?.name ?? null;
  return { detail, director };
}

// ── Letterboxd scraper ────────────────────────────────────────────────────
async function scrapeList(slug: string, url: string): Promise<Array<{ title: string; year: number | null }>> {
  const films: Array<{ title: string; year: number | null }> = [];
  let page = 1;

  while (true) {
    const pageUrl = url.endsWith("/") ? `${url}page/${page}/` : `${url}/page/${page}/`;
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ReelBot/1.0)" },
    });

    if (!res.ok) break;
    const html = await res.text();
    const $ = cheerio.load(html);

    const items = $("li.poster-container");
    if (items.length === 0) break;

    items.each((_: number, el: any) => {
      const $el = $(el);
      const title = $el.find("img").attr("alt") ?? $el.find(".film-title").text().trim();
      const yearText = $el.find(".metadata").text().trim();
      const year = yearText ? parseInt(yearText) : null;
      if (title) films.push({ title, year: isNaN(year!) ? null : year });
    });

    console.log(`  ${slug} page ${page}: ${items.length} films`);
    page++;

    // Polite delay
    await new Promise(r => setTimeout(r, 800));

    // Stop at 10 pages (~250 films per list)
    if (page > 10) break;
  }

  return films;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Scraping ${SEED_LISTS.length} Letterboxd lists…\n`);

  for (const list of SEED_LISTS) {
    console.log(`\n▸ ${list.name} (${list.slug})`);

    // Upsert curated_list row
    const { data: listRow } = await supabase
      .from("curated_lists")
      .upsert({ slug: list.slug, name: list.name, source_url: list.url }, { onConflict: "slug" })
      .select()
      .single();

    if (!listRow) { console.error("  Failed to upsert list"); continue; }

    // Check if scraped recently (within 7 days)
    const lastScraped = listRow.last_scraped_at ? new Date(listRow.last_scraped_at) : null;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (lastScraped && lastScraped > weekAgo) {
      console.log(`  Skipped — scraped ${lastScraped.toLocaleDateString()}`);
      continue;
    }

    const films = await scrapeList(list.slug, list.url);
    console.log(`  Found ${films.length} films on Letterboxd`);

    let inserted = 0;
    for (let i = 0; i < films.length; i++) {
      const { title, year } = films[i];
      process.stdout.write(`  [${i + 1}/${films.length}] ${title}…`);

      try {
        // Search TMDB
        const result = await tmdbSearch(title, year ?? undefined);
        if (!result) { console.log(" ✗ not found"); continue; }

        const { detail, director } = await tmdbDetail(result.id);

        const movie = {
          tmdb_id:         detail.id,
          imdb_id:         detail.external_ids?.imdb_id ?? null,
          title:           detail.title,
          year:            parseInt(detail.release_date?.slice(0, 4) ?? "0"),
          runtime_minutes: detail.runtime ?? null,
          genres:          detail.genres?.map((g: any) => g.name) ?? [],
          director,
          plot:            detail.overview ?? null,
          poster_url:      detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
          tmdb_rating:     detail.vote_average ?? null,
          fetched_at:      new Date().toISOString(),
        };

        await supabase.from("movies").upsert(movie, { onConflict: "tmdb_id" });
        await supabase.from("curated_list_items").upsert({
          list_id:  listRow.id,
          imdb_id:  movie.imdb_id ?? movie.tmdb_id.toString(),
          tmdb_id:  movie.tmdb_id,
          position: i,
        }, { onConflict: "list_id,tmdb_id" });

        inserted++;
        console.log(` ✓`);
      } catch (err) {
        console.log(` ✗ ${err}`);
      }

      // Rate limit: ~40 req/s TMDB allows
      await new Promise(r => setTimeout(r, 300));
    }

    // Update last_scraped_at
    await supabase.from("curated_lists").update({ last_scraped_at: new Date().toISOString() }).eq("id", listRow.id);
    console.log(`  ✓ Inserted/updated ${inserted} films`);
  }

  console.log("\n✓ Done.");
}

main().catch(err => { console.error(err); process.exit(1); });
