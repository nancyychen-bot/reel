/**
 * One-time admin endpoint — retroactively assigns award_winner=true to arthouse
 * films already in the DB by re-scraping each festival's Wikipedia page for
 * every year represented in arthouse_films.
 *
 * Usage: GET /api/admin/backfill-arthouse-awards
 * Processes all (festival × year) pairs in one shot (Vercel Pro, 300s limit).
 */

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as cheerio from "cheerio";

export const maxDuration = 300;

const AWARD_SECTION_RE = /\b(award|prize|winner|palme|golden\s+lion|silver\s+lion|golden\s+bear|silver\s+bear|jury|special\s+mention)\b/i;
const AWARD_COLUMN_RE  = /\b(award|prize)\b/i;

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const FESTIVALS: Array<{ name: string; pageTitle: (y: number) => string }> = [
  { name: "Cannes",   pageTitle: (y) => `${y}_Cannes_Film_Festival` },
  { name: "Venice",   pageTitle: (y) => `${y}_Venice_International_Film_Festival` },
  { name: "Berlin",   pageTitle: (y) => `${ordinalSuffix(y - 1950)}_Berlin_International_Film_Festival` },
  { name: "TIFF",     pageTitle: (y) => `${y}_Toronto_International_Film_Festival` },
  { name: "Sundance", pageTitle: (y) => `${y}_Sundance_Film_Festival` },
  { name: "Locarno",  pageTitle: (y) => `${y}_Locarno_Film_Festival` },
];

async function fetchWikiPage(title: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json`;
    const res  = await fetch(url, { headers: { "User-Agent": "ReelApp/1.0 arthouse-backfill" } });
    const data = await res.json();
    return data.error ? null : (data.parse?.text ?? null);
  } catch { return null; }
}

/** Returns a Set of lowercased film titles found in award sections of this page. */
function extractAwardTitles(html: string): Set<string> {
  const $ = cheerio.load(html);
  const awardTableEls = new Set<unknown>();

  $("h2, h3, h4").each((_, el) => {
    if (!AWARD_SECTION_RE.test($(el).text())) return;
    let next = $(el).next();
    while (next.length) {
      if (next.is("h2, h3, h4")) break;
      if (next.is("table.wikitable")) awardTableEls.add(next.get(0));
      next.find("table.wikitable").each((__, t) => { awardTableEls.add(t); });
      next = next.next();
    }
  });

  const titles = new Set<string>();
  $("table.wikitable").each((_, table) => {
    const headers: string[] = [];
    $(table).find("tr").first().find("th").each((__, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });
    const filmCol = headers.findIndex(h => h.includes("film") || h.includes("title"));
    if (filmCol === -1) return;
    if (!awardTableEls.has(table) && !headers.some(h => AWARD_COLUMN_RE.test(h))) return;

    $(table).find("tr").slice(1).each((__, row) => {
      const cells = $(row).find("td");
      if (!cells.length) return;
      const cell = cells.eq(filmCol);
      let title = cell.find("i").first().text().trim()
        || cell.find("a").first().text().trim()
        || cell.text().trim();
      title = title.replace(/\[\d+\]/g, "").replace(/[*†]/g, "").trim();
      if (title.length >= 2) titles.add(title.toLowerCase());
    });
  });

  return titles;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function GET(_: NextRequest) {
  const admin = createAdminClient();

  const [{ data: arthouseRows }, { data: movieRows }] = await Promise.all([
    admin.from("arthouse_films").select("tmdb_id, festivals, award_winner"),
    admin.from("movies").select("tmdb_id, title, year"),
  ]);

  if (!arthouseRows?.length) {
    return Response.json({ message: "No arthouse films found.", updated: 0 });
  }

  const movieMap = new Map<number, { title: string; year: number }>(
    (movieRows ?? []).map((m: any) => [m.tmdb_id as number, { title: m.title as string, year: m.year as number }])
  );

  // Collect unique (festival, year) pairs
  const pairSet = new Set<string>();
  for (const row of arthouseRows) {
    const movie = movieMap.get(row.tmdb_id);
    if (!movie?.year) continue;
    for (const fest of (row.festivals ?? [])) {
      pairSet.add(`${fest}::${movie.year}`);
    }
  }
  const pairs = [...pairSet].sort();

  // Fetch all Wikipedia pages in parallel
  const awardTitlesByPair = new Map<string, Set<string>>();
  await Promise.all(pairs.map(async (pair) => {
    const [festName, yearStr] = pair.split("::");
    const festDef = FESTIVALS.find(f => f.name === festName);
    if (!festDef) { awardTitlesByPair.set(pair, new Set()); return; }
    const html = await fetchWikiPage(festDef.pageTitle(parseInt(yearStr)));
    awardTitlesByPair.set(pair, html ? extractAwardTitles(html) : new Set());
  }));

  // Determine which films are award winners
  const toUpdate: number[] = [];
  for (const row of arthouseRows) {
    if (row.award_winner) continue;
    const movie = movieMap.get(row.tmdb_id);
    if (!movie) continue;
    const normTitle = normalise(movie.title);
    let isWinner = false;
    for (const fest of (row.festivals ?? [])) {
      const awardTitles = awardTitlesByPair.get(`${fest}::${movie.year}`);
      if (!awardTitles) continue;
      for (const at of awardTitles) {
        if (normalise(at) === normTitle) { isWinner = true; break; }
      }
      if (isWinner) break;
    }
    if (isWinner) toUpdate.push(row.tmdb_id);
  }

  // Batch update
  const CHUNK = 100;
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    await admin.from("arthouse_films").update({ award_winner: true }).in("tmdb_id", toUpdate.slice(i, i + CHUNK));
  }

  const pairSummary = [...awardTitlesByPair.entries()].map(([pair, titles]) => ({
    pair, awardTitlesFound: titles.size,
  }));

  return Response.json({
    pairsChecked: pairs.length,
    pairSummary,
    arthouseTotal: arthouseRows.length,
    alreadyMarked: arthouseRows.filter((r: any) => r.award_winner).length,
    newlyMarked: toUpdate.length,
    updatedTmdbIds: toUpdate,
  });
}
