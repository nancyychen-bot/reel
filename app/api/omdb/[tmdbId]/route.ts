import { NextRequest } from "next/server";

const OMDB_KEY = process.env.OMDB_API_KEY;
const TMDB_KEY = process.env.TMDB_API_KEY;

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ tmdbId: string }> }
) {
  const { tmdbId } = await params;
  if (!TMDB_KEY || !OMDB_KEY) return Response.json({});

  // Get IMDB ID from TMDB (includes director, runtime, language, country)
  const tmdbRes = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids,credits`,
    { next: { revalidate: 86400 } }
  ).then(r => r.json()).catch(() => null);

  const imdbId = tmdbRes?.external_ids?.imdb_id;
  const director = (tmdbRes?.credits?.crew as Array<{ job: string; name: string }> | undefined)
    ?.find(c => c.job === "Director")?.name;
  const runtime = tmdbRes?.runtime ?? undefined;
  const language = tmdbRes?.original_language
    ? new Intl.DisplayNames(["en"], { type: "language" }).of(tmdbRes.original_language)
    : undefined;
  const country = (tmdbRes?.production_countries as Array<{ name: string }> | undefined)?.[0]?.name;

  if (!imdbId) {
    // Return TMDB-only enrichment (no OMDB ratings)
    return Response.json({ director, runtime, language, country });
  }

  // Fetch OMDB data for ratings + awards
  const omdb = await fetch(
    `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdbId}`,
    { next: { revalidate: 86400 } }
  ).then(r => r.json()).catch(() => null);

  if (!omdb || omdb.Response === "False") {
    return Response.json({ imdbId, director, runtime, language, country });
  }

  const rtRating = (omdb.Ratings as Array<{ Source: string; Value: string }> | undefined)
    ?.find(r => r.Source === "Rotten Tomatoes");
  const rtScore    = rtRating ? parseInt(rtRating.Value) : undefined;
  const imdbRating = omdb.imdbRating && omdb.imdbRating !== "N/A"
    ? parseFloat(omdb.imdbRating) : undefined;
  const awards = omdb.Awards && omdb.Awards !== "N/A" ? omdb.Awards : undefined;

  return Response.json({
    imdbId,
    imdbRating,
    rtScore,
    awards,
    director:  director ?? (omdb.Director !== "N/A" ? omdb.Director : undefined),
    runtime:   runtime  ?? (omdb.Runtime  !== "N/A" ? parseInt(omdb.Runtime) : undefined),
    language:  language ?? (omdb.Language !== "N/A" ? omdb.Language : undefined),
    country:   country  ?? (omdb.Country  !== "N/A" ? omdb.Country  : undefined),
  });
}
