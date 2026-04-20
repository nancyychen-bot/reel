import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const q    = request.nextUrl.searchParams.get("q");
  const page = request.nextUrl.searchParams.get("page") ?? "1";

  if (!q) return Response.json({ results: [] });

  // Run TMDB search and local DB search in parallel
  const [tmdbRes, dbRes] = await Promise.all([
    fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(q)}&page=${page}&include_adult=false`,
      { next: { revalidate: 300 } }
    ),
    createAdminClient()
      .from("movies")
      .select("tmdb_id, imdb_id, title, year, poster_url, plot")
      .ilike("title", `%${q}%`)
      .order("tmdb_rating", { ascending: false })
      .limit(8),
  ]);

  const tmdbResults: any[] = tmdbRes.ok ? (await tmdbRes.json()).results ?? [] : [];
  const dbRows: any[]      = dbRes.data ?? [];

  // Merge: start with DB results (they're already enriched), then append
  // TMDB results that aren't already covered, up to 8 total
  const seen    = new Set<number>();
  const merged: any[] = [];

  // DB hits first
  for (const row of dbRows) {
    if (!row.tmdb_id) continue;
    seen.add(row.tmdb_id);
    merged.push({
      id:        row.tmdb_id,
      title:     row.title,
      year:      row.year ?? 0,
      posterUrl: row.poster_url ?? "",
      overview:  row.plot ?? "",
    });
  }

  // Fill remaining slots from TMDB
  for (const f of tmdbResults) {
    if (seen.has(f.id)) continue;
    merged.push({
      id:        f.id,
      title:     f.title,
      year:      parseInt(f.release_date?.slice(0, 4) ?? "0") || 0,
      posterUrl: f.poster_path ? `https://image.tmdb.org/t/p/w185${f.poster_path}` : "",
      overview:  f.overview ?? "",
    });
    if (merged.length >= 12) break;
  }

  return Response.json({ results: merged });
}
