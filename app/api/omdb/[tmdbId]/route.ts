import { NextRequest } from "next/server";

const OMDB_KEY = process.env.OMDB_API_KEY;
const TMDB_KEY = process.env.TMDB_API_KEY;

// Detect specific festival/award wins from OMDB awards text.
// OMDB format: "Won 1 Palme d'Or... 22 wins & 37 nominations."
function parseFestivalWins(awards: string): string[] {
  if (!awards || awards === "N/A") return [];

  const FESTIVALS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /palme\s+d[''`]or/i,          label: "Palme d'Or" },
    { pattern: /golden\s+bear/i,             label: "Golden Bear" },
    { pattern: /golden\s+lion/i,             label: "Golden Lion" },
    { pattern: /grand\s+jury.*sundance|sundance.*grand\s+jury/i, label: "Sundance Grand Jury" },
    { pattern: /sundance/i,                  label: "Sundance" },
    { pattern: /tiff|toronto.*people|people.*toronto/i, label: "TIFF" },
    { pattern: /silver\s+bear/i,             label: "Silver Bear" },
    { pattern: /silver\s+lion/i,             label: "Silver Lion" },
    { pattern: /jury\s+prize.*cannes|cannes.*jury\s+prize/i, label: "Cannes Jury Prize" },
    { pattern: /un\s+certain\s+regard/i,     label: "Un Certain Regard" },
    { pattern: /academy\s+award|oscar/i,     label: "Academy Award" },
    { pattern: /bafta/i,                     label: "BAFTA" },
    { pattern: /golden\s+globe/i,            label: "Golden Globe" },
    { pattern: /c[eé]sar/i,                  label: "César" },
    { pattern: /david\s+di\s+donatello/i,    label: "David di Donatello" },
    { pattern: /goya/i,                      label: "Goya Award" },
    { pattern: /european\s+film\s+award/i,   label: "European Film Award" },
    { pattern: /spirit\s+award/i,            label: "Independent Spirit" },
    { pattern: /tribeca/i,                   label: "Tribeca" },
    { pattern: /berlin/i,                    label: "Berlin" },
    { pattern: /venice/i,                    label: "Venice" },
    { pattern: /cannes/i,                    label: "Cannes" },
  ];

  const won: string[] = [];
  const seen = new Set<string>();

  // Split on sentence boundaries to check "Won ... [festival]" per sentence
  const sentences = awards.split(/\.\s*/);
  for (const sentence of sentences) {
    if (!/\bwon\b/i.test(sentence)) continue;
    for (const { pattern, label } of FESTIVALS) {
      if (!seen.has(label) && pattern.test(sentence)) {
        won.push(label);
        seen.add(label);
        // If we matched a specific sub-festival (e.g. Palme d'Or), skip the generic one
        if (label.includes("Palme") || label.includes("Jury") || label.includes("Regard")) seen.add("Cannes");
        if (label.includes("Golden Bear") || label.includes("Silver Bear")) seen.add("Berlin");
        if (label.includes("Golden Lion") || label.includes("Silver Lion")) seen.add("Venice");
        if (label.includes("Sundance Grand Jury")) seen.add("Sundance");
        if (label.includes("TIFF")) seen.add("TIFF");
      }
    }
  }

  // De-duplicate: remove generic "Cannes/Berlin/Venice" if specific award already added
  return won;
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ tmdbId: string }> }
) {
  const { tmdbId } = await params;
  if (!TMDB_KEY || !OMDB_KEY) return Response.json({});

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
    return Response.json({ director, runtime, language, country });
  }

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
  const festivalWins = parseFestivalWins(omdb.Awards ?? "");

  return Response.json({
    imdbId,
    imdbRating,
    rtScore,
    awards,
    festivalWins: festivalWins.length ? festivalWins : undefined,
    director:  director ?? (omdb.Director !== "N/A" ? omdb.Director : undefined),
    runtime:   runtime  ?? (omdb.Runtime  !== "N/A" ? parseInt(omdb.Runtime) : undefined),
    language:  language ?? (omdb.Language !== "N/A" ? omdb.Language : undefined),
    country:   country  ?? (omdb.Country  !== "N/A" ? omdb.Country  : undefined),
  });
}
