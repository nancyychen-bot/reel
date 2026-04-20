/**
 * Admin endpoint — seeds Roger Ebert's Great Movies into the movies table
 * and returns the TMDB IDs found.
 *
 * Usage (call repeatedly with increasing offset until done=true):
 *   GET /api/admin/seed-ebert?secret=<SUPABASE_SERVICE_ROLE_KEY>&offset=0
 *   GET /api/admin/seed-ebert?secret=<SUPABASE_SERVICE_ROLE_KEY>&offset=20
 *   ...
 */
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EBERT_FILMS } from "@/lib/ebert-films";

const TMDB_KEY = process.env.TMDB_API_KEY!;

const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  53: "Thriller", 10752: "War", 37: "Western",
};

async function searchTmdb(title: string, year: number): Promise<any | null> {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}&year=${year}&include_adult=false`;
  const res  = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const results = data.results ?? [];
  if (results.length === 0) {
    // Retry without year constraint
    const url2 = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}&include_adult=false`;
    const res2  = await fetch(url2);
    if (!res2.ok) return null;
    const data2 = await res2.json();
    return data2.results?.[0] ?? null;
  }
  return results[0];
}

async function fetchDetails(tmdbId: number): Promise<any | null> {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits`;
  const res  = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export async function GET(request: NextRequest) {
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0");
  const limit  = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "50"), 100);
  const batch  = EBERT_FILMS.slice(offset, offset + limit);
  const admin  = createAdminClient();

  // Process all films in parallel
  const results = await Promise.all(batch.map(async film => {
    try {
      const hit = await searchTmdb(film.title, film.year);
      if (!hit) return { ...film, tmdbId: null as number | null, status: "not_found" };

      const detail = await fetchDetails(hit.id);
      if (!detail) return { ...film, tmdbId: hit.id as number | null, status: "details_failed" };

      const director = (detail.credits?.crew ?? [])
        .find((c: any) => c.job === "Director")?.name ?? "";
      const genres = (detail.genres ?? []).map((g: any) => GENRE_MAP[g.id] ?? g.name).filter(Boolean);

      await admin.from("movies").upsert({
        tmdb_id:           detail.id,
        imdb_id:           detail.imdb_id || String(detail.id),
        title:             detail.title,
        year:              parseInt(detail.release_date?.slice(0, 4) ?? "0") || film.year,
        poster_url:        detail.poster_path ? `https://image.tmdb.org/t/p/w780${detail.poster_path}` : "",
        genres,
        plot:              detail.overview ?? "",
        tmdb_rating:       detail.vote_average ?? 0,
        director,
        runtime_minutes:   detail.runtime ?? null,
        ebert_great_movie: true,
      }, { onConflict: "tmdb_id" });

      return { ...film, tmdbId: detail.id as number | null, status: "ok" };
    } catch (err: any) {
      return { ...film, tmdbId: null as number | null, status: `error: ${err.message}` };
    }
  }));

  return Response.json({
    offset,
    processed: batch.length,
    total: EBERT_FILMS.length,
    done: offset + batch.length >= EBERT_FILMS.length,
    next_offset: offset + limit,
    results,
  });
}
