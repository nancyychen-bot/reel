/**
 * One-time admin endpoint — retroactively assigns award_winner=true to arthouse
 * films already in the DB by re-scraping each festival's Wikipedia page for
 * recent years (not the film's release year, which is unrelated to the festival year).
 *
 * Usage: GET /api/admin/backfill-arthouse-awards
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

// Check recent years — the cron adds films from current festival seasons,
// so film release year is irrelevant; we need the festival's own year.
const CURRENT_YEAR = new Date().getFullYear();
const YEARS_TO_CHECK = Array.from({ length: CURRENT_YEAR - 2017 }, (_, i) => 2018 + i);

async function fetchWikiPage(title: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json`;
    const res  = await fetch(url, { headers: { "User-Agent": "ReelApp/1.0 arthouse-backfill" } });
    const data = await res.json();
    return data.error ? null : (data.parse?.text ?? null);
  } catch { return null; }
}

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
    admin.from("movies").select("tmdb_id, title"),
  ]);

  if (!arthouseRows?.length) {
    return Response.json({ message: "No arthouse films found.", updated: 0 });
  }

  const movieMap = new Map<number, string>(
    (movieRows ?? []).map((m: any) => [m.tmdb_id as number, m.title as string])
  );

  // Collect unique (festivalName, year) pairs across all recent years for every
  // festival that appears in arthouse_films — NOT based on movie release year.
  const festivalsInUse = new Set<string>();
  for (const row of arthouseRows) {
    for (const fest of (row.festivals ?? [])) festivalsInUse.add(fest);
  }

  const pairs: Array<{ festName: string; year: number; key: string }> = [];
  for (const festName of festivalsInUse) {
    for (const year of YEARS_TO_CHECK) {
      pairs.push({ festName, year, key: `${festName}::${year}` });
    }
  }

  // Fetch all Wikipedia pages in parallel
  const awardTitlesByPair = new Map<string, Set<string>>();
  await Promise.all(pairs.map(async ({ festName, year, key }) => {
    const festDef = FESTIVALS.find(f => f.name === festName);
    if (!festDef) { awardTitlesByPair.set(key, new Set()); return; }
    const html = await fetchWikiPage(festDef.pageTitle(year));
    awardTitlesByPair.set(key, html ? extractAwardTitles(html) : new Set());
  }));

  // For each arthouse film, check if its title appears in ANY award section
  // across all years of each festival it belongs to
  const toUpdate: number[] = [];
  for (const row of arthouseRows) {
    if (row.award_winner) continue;
    const title = movieMap.get(row.tmdb_id);
    if (!title) continue;
    const normTitle = normalise(title);
    let isWinner = false;

    outer: for (const festName of (row.festivals ?? [])) {
      for (const year of YEARS_TO_CHECK) {
        const awardTitles = awardTitlesByPair.get(`${festName}::${year}`);
        if (!awardTitles) continue;
        for (const at of awardTitles) {
          if (normalise(at) === normTitle) { isWinner = true; break outer; }
        }
      }
    }

    if (isWinner) toUpdate.push(row.tmdb_id);
  }

  // Batch update
  for (let i = 0; i < toUpdate.length; i += 100) {
    await admin.from("arthouse_films").update({ award_winner: true }).in("tmdb_id", toUpdate.slice(i, i + 100));
  }

  const pairSummary = [...awardTitlesByPair.entries()]
    .filter(([, t]) => t.size > 0)
    .map(([pair, titles]) => ({ pair, awardTitlesFound: titles.size }));

  return Response.json({
    pairsChecked: pairs.length,
    pairsWithAwardData: pairSummary.length,
    pairSummary,
    arthouseTotal: arthouseRows.length,
    alreadyMarked: arthouseRows.filter((r: any) => r.award_winner).length,
    newlyMarked: toUpdate.length,
    updatedTmdbIds: toUpdate,
  });
}
