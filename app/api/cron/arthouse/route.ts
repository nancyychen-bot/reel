/**
 * Daily cron: fetch current year's festival selections from Wikipedia
 * and add any new films to arthouse_films + movies.
 *
 * Secured via CRON_SECRET env var — Vercel passes this automatically
 * via the Authorization header when triggered by the cron schedule.
 */

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as cheerio from "cheerio";

const TMDB_KEY = process.env.TMDB_API_KEY!;

const GENRE_MAP: Record<number, string> = {
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",
  18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",
  9648:"Mystery",10749:"Romance",878:"Science Fiction",53:"Thriller",10752:"War",37:"Western",
};

function ordinalSuffix(n: number): string {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const FESTIVALS = [
  { name: "Cannes",   pageTitle: (y: number) => `${y}_Cannes_Film_Festival` },
  { name: "Venice",   pageTitle: (y: number) => `${y}_Venice_International_Film_Festival` },
  { name: "Berlin",   pageTitle: (y: number) => `${ordinalSuffix(y - 1950)}_Berlin_International_Film_Festival` },
  { name: "TIFF",     pageTitle: (y: number) => `${y}_Toronto_International_Film_Festival` },
  { name: "Sundance", pageTitle: (y: number) => `${y}_Sundance_Film_Festival` },
  { name: "Locarno",  pageTitle: (y: number) => `${y}_Locarno_Film_Festival` },
];

async function fetchWikiPage(title: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": "ReelApp/1.0 arthouse-cron" } });
    const data = await res.json();
    return data.error ? null : (data.parse?.text ?? null);
  } catch { return null; }
}

function extractFilmTitles(html: string): Array<{ title: string; director: string }> {
  const $ = cheerio.load(html);
  const results: Array<{ title: string; director: string }> = [];
  const seen = new Set<string>();

  $("table.wikitable").each((_, table) => {
    const headers: string[] = [];
    $(table).find("tr").first().find("th").each((_, th) => { headers.push($(th).text().trim().toLowerCase()); });
    const filmCol = headers.findIndex(h => h.includes("film") || h.includes("title"));
    const dirCol  = headers.findIndex(h => h.includes("director"));
    if (filmCol === -1) return;

    $(table).find("tr").slice(1).each((_, row) => {
      const cells = $(row).find("td");
      if (!cells.length) return;
      const filmCell = cells.eq(filmCol);
      let title = filmCell.find("i").first().text().trim() || filmCell.find("a").first().text().trim() || filmCell.text().trim();
      title = title.replace(/\[\d+\]/g, "").replace(/[*†]/g, "").trim();
      if (!title || title.length < 2 || title.length > 100 || seen.has(title.toLowerCase())) return;
      seen.add(title.toLowerCase());
      const director = dirCol >= 0 ? cells.eq(dirCol).text().replace(/\[\d+\]/g, "").trim().split("\n")[0].trim() : "";
      results.push({ title, director });
    });
  });
  return results;
}

async function searchTmdb(title: string, year: number): Promise<any | null> {
  for (const y of [year, 0]) {
    const params = new URLSearchParams({ api_key: TMDB_KEY, query: title, include_adult: "false" });
    if (y) params.set("year", String(y));
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?${params}`).then(r => r.json()).catch(() => null);
    const results = res?.results ?? [];
    const match = results.find((f: any) => f.poster_path && f.title?.toLowerCase() === title.toLowerCase())
      ?? results.find((f: any) => f.poster_path && f.vote_count >= 5);
    if (match) return match;
  }
  return null;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const year  = new Date().getFullYear();
  const added: string[] = [];

  // Fetch existing arthouse tmdb_ids to avoid redundant work
  const { data: existing } = await admin.from("arthouse_films").select("tmdb_id");
  const existingIds = new Set((existing ?? []).map((r: any) => r.tmdb_id));

  for (const festival of FESTIVALS) {
    const html = await fetchWikiPage(festival.pageTitle(year));
    if (!html) continue;

    const films = extractFilmTitles(html);
    for (const { title, director } of films) {
      const tmdb = await searchTmdb(title, year);
      if (!tmdb || existingIds.has(tmdb.id)) continue;

      // Upsert into movies
      await admin.from("movies").upsert({
        tmdb_id:     tmdb.id,
        imdb_id:     String(tmdb.id), // placeholder; real imdb_id fetched lazily via OMDB route
        title:       tmdb.title,
        year:        parseInt(tmdb.release_date?.slice(0, 4) ?? String(year)),
        genres:      (tmdb.genre_ids ?? []).map((id: number) => GENRE_MAP[id]).filter(Boolean),
        plot:        tmdb.overview ?? "",
        poster_url:  tmdb.poster_path ? `https://image.tmdb.org/t/p/w780${tmdb.poster_path}` : "",
        tmdb_rating: tmdb.vote_average ?? 0,
        director:    director || null,
        runtime_minutes: null,
      }, { onConflict: "tmdb_id" });

      // Upsert into arthouse_films — merge festivals if already present
      const { data: af } = await admin.from("arthouse_films").select("festivals").eq("tmdb_id", tmdb.id).maybeSingle();
      const festivals = [...new Set([...(af?.festivals ?? []), festival.name])];
      await admin.from("arthouse_films").upsert({ tmdb_id: tmdb.id, festivals }, { onConflict: "tmdb_id" });

      existingIds.add(tmdb.id);
      added.push(`${festival.name}: ${tmdb.title}`);
    }
  }

  console.log(`arthouse cron: added ${added.length} films for ${year}`);
  return Response.json({ year, added: added.length, films: added });
}
