import { NextRequest } from "next/server";
import { getMovieDetail } from "@/lib/tmdb";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ tmdbId: string }> }
) {
  const { tmdbId } = await params;
  const id = parseInt(tmdbId);
  if (isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });

  const supabase = await createClient();

  // Check cache first
  const { data: cached } = await supabase
    .from("movies")
    .select("*")
    .eq("tmdb_id", id)
    .maybeSingle();

  if (cached) return Response.json(cached);

  // Fetch from TMDB and cache
  const film = await getMovieDetail(id);

  await supabase.from("movies").upsert({
    tmdb_id:     film.tmdbId,
    imdb_id:     film.imdbId,
    title:       film.title,
    year:        film.year,
    runtime_minutes: film.runtime,
    genres:      film.genres,
    director:    film.director,
    plot:        film.plot,
    poster_url:  film.posterUrl,
    tmdb_rating: film.tmdbRating,
  });

  return Response.json(film);
}
