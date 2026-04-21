import { NextRequest } from "next/server";
import { PROVIDER_IDS } from "@/lib/providers";

const OMDB_KEY = process.env.OMDB_API_KEY;
const TMDB_KEY = process.env.TMDB_API_KEY;

async function fetchTrailerKey(tmdbId: string): Promise<string | undefined> {
  if (!TMDB_KEY) return undefined;
  const data = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${TMDB_KEY}`,
    { next: { revalidate: 86400 } }
  ).then(r => r.json()).catch(() => null);
  const videos: Array<{ site: string; type: string; key: string; official: boolean }> = data?.results ?? [];
  const trailers = videos.filter(v => v.site === "YouTube" && v.type === "Trailer");
  const pick = trailers.find(v => v.official) ?? trailers[0];
  return pick?.key;
}

async function fetchStreamingProviders(tmdbId: string): Promise<Array<{ id: number; name: string }>> {
  if (!TMDB_KEY) return [];
  const data = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`,
    { next: { revalidate: 86400 } }
  ).then(r => r.json()).catch(() => null);
  return ((data?.results?.US?.flatrate ?? []) as Array<{ provider_id: number; provider_name: string }>)
    .filter(p => PROVIDER_IDS.has(p.provider_id as any))
    .map(p => ({ id: p.provider_id, name: p.provider_name }));
}

// Parse specific festival wins and nominations from OMDB awards text.
// OMDB format: "Won 1 Palme d'Or. Nominated for 2 Oscars. 22 wins & 37 nominations."
function parseFestivalAwards(awards: string): { wins: string[]; noms: string[] } {
  if (!awards || awards === "N/A") return { wins: [], noms: [] };

  const FESTIVALS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /palme\s+d[''`]or/i,                                   label: "Palme d'Or" },
    { pattern: /golden\s+bear/i,                                       label: "Golden Bear" },
    { pattern: /golden\s+lion/i,                                       label: "Golden Lion" },
    { pattern: /grand\s+jury.*sundance|sundance.*grand\s+jury/i,       label: "Sundance Grand Jury" },
    { pattern: /sundance/i,                                             label: "Sundance" },
    { pattern: /tiff|toronto.*people['']s|people['']s.*toronto/i,      label: "TIFF" },
    { pattern: /silver\s+bear/i,                                       label: "Silver Bear" },
    { pattern: /silver\s+lion/i,                                       label: "Silver Lion" },
    { pattern: /jury\s+prize.*cannes|cannes.*jury\s+prize/i,           label: "Cannes Jury Prize" },
    { pattern: /un\s+certain\s+regard/i,                               label: "Un Certain Regard" },
    { pattern: /academy\s+award|oscar/i,                               label: "Academy Award" },
    { pattern: /bafta/i,                                               label: "BAFTA" },
    { pattern: /golden\s+globe/i,                                      label: "Golden Globe" },
    { pattern: /c[eé]sar/i,                                            label: "César" },
    { pattern: /david\s+di\s+donatello/i,                              label: "David di Donatello" },
    { pattern: /goya/i,                                                label: "Goya Award" },
    { pattern: /european\s+film\s+award/i,                             label: "European Film Award" },
    { pattern: /spirit\s+award/i,                                      label: "Independent Spirit" },
    { pattern: /tribeca/i,                                             label: "Tribeca" },
    { pattern: /berlin/i,                                              label: "Berlin" },
    { pattern: /venice/i,                                              label: "Venice" },
    { pattern: /cannes/i,                                              label: "Cannes" },
  ];

  const wins: string[] = [];
  const noms: string[] = [];
  const seenWon = new Set<string>();
  const seenNom = new Set<string>();

  function markSubFestival(label: string, set: Set<string>) {
    if (label.includes("Palme") || label.includes("Jury") || label.includes("Regard")) set.add("Cannes");
    if (label.includes("Golden Bear") || label.includes("Silver Bear")) set.add("Berlin");
    if (label.includes("Golden Lion") || label.includes("Silver Lion")) set.add("Venice");
    if (label.includes("Sundance Grand Jury")) set.add("Sundance");
  }

  const sentences = awards.split(/\.\s*/);
  for (const sentence of sentences) {
    const isWin = /\bwon\b/i.test(sentence);
    const isNom = /\bnominat/i.test(sentence);
    if (!isWin && !isNom) continue;

    for (const { pattern, label } of FESTIVALS) {
      if (!pattern.test(sentence)) continue;

      if (isWin && !seenWon.has(label)) {
        wins.push(label);
        seenWon.add(label);
        seenNom.add(label); // won implies nominated — don't double-list
        markSubFestival(label, seenWon);
        markSubFestival(label, seenNom);
      } else if (isNom && !seenNom.has(label) && !seenWon.has(label)) {
        noms.push(label);
        seenNom.add(label);
        markSubFestival(label, seenNom);
      }
    }
  }

  return { wins, noms };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tmdbId: string }> }
) {
  const { tmdbId } = await params;
  if (!OMDB_KEY) return Response.json({});

  // If the caller already knows the IMDb ID, skip the TMDB round-trip entirely.
  const imdbIdParam = request.nextUrl.searchParams.get("imdbId");
  const knownImdbId = imdbIdParam?.startsWith("tt") ? imdbIdParam : null;

  if (knownImdbId) {
    // Fast path: go straight to OMDB, fetch providers + trailer in parallel
    const [omdb, streamingProviders, trailerKey] = await Promise.all([
      fetch(
        `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${knownImdbId}`,
        { next: { revalidate: 86400 } }
      ).then(r => r.json()).catch(() => null),
      fetchStreamingProviders(tmdbId),
      fetchTrailerKey(tmdbId),
    ]);

    if (!omdb || omdb.Response === "False") {
      return Response.json({ imdbId: knownImdbId, trailerKey, streamingProviders: streamingProviders.length ? streamingProviders : undefined });
    }

    const rtRating = (omdb.Ratings as Array<{ Source: string; Value: string }> | undefined)
      ?.find(r => r.Source === "Rotten Tomatoes");
    const rtScore    = rtRating ? parseInt(rtRating.Value) : undefined;
    const imdbRating = omdb.imdbRating && omdb.imdbRating !== "N/A"
      ? parseFloat(omdb.imdbRating) : undefined;
    const awards = omdb.Awards && omdb.Awards !== "N/A" ? omdb.Awards : undefined;
    const { wins: festivalWins, noms: festivalNoms } = parseFestivalAwards(omdb.Awards ?? "");

    return Response.json({
      imdbId:      knownImdbId,
      imdbRating,
      rtScore,
      awards,
      festivalWins: festivalWins.length ? festivalWins : undefined,
      festivalNoms: festivalNoms.length ? festivalNoms : undefined,
      director:  omdb.Director !== "N/A" ? omdb.Director : undefined,
      runtime:   omdb.Runtime  !== "N/A" ? parseInt(omdb.Runtime) : undefined,
      language:  omdb.Language !== "N/A" ? omdb.Language : undefined,
      country:   omdb.Country  !== "N/A" ? omdb.Country  : undefined,
      trailerKey,
      streamingProviders: streamingProviders.length ? streamingProviders : undefined,
    });
  }

  // Slow path: look up IMDb ID via TMDB first (fallback for cards without imdbId)
  if (!TMDB_KEY) return Response.json({});

  const [tmdbRes, streamingProviders, trailerKey] = await Promise.all([
    fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids,credits`,
      { next: { revalidate: 86400 } }
    ).then(r => r.json()).catch(() => null),
    fetchStreamingProviders(tmdbId),
    fetchTrailerKey(tmdbId),
  ]);

  const imdbId = tmdbRes?.external_ids?.imdb_id;
  const director = (tmdbRes?.credits?.crew as Array<{ job: string; name: string }> | undefined)
    ?.find(c => c.job === "Director")?.name;
  const runtime = tmdbRes?.runtime ?? undefined;
  const language = tmdbRes?.original_language
    ? new Intl.DisplayNames(["en"], { type: "language" }).of(tmdbRes.original_language)
    : undefined;
  const country = (tmdbRes?.production_countries as Array<{ name: string }> | undefined)?.[0]?.name;

  if (!imdbId) {
    return Response.json({ director, runtime, language, country, trailerKey, streamingProviders: streamingProviders.length ? streamingProviders : undefined });
  }

  const omdb = await fetch(
    `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdbId}`,
    { next: { revalidate: 86400 } }
  ).then(r => r.json()).catch(() => null);

  if (!omdb || omdb.Response === "False") {
    return Response.json({ imdbId, director, runtime, language, country, trailerKey });
  }

  const rtRating = (omdb.Ratings as Array<{ Source: string; Value: string }> | undefined)
    ?.find(r => r.Source === "Rotten Tomatoes");
  const rtScore    = rtRating ? parseInt(rtRating.Value) : undefined;
  const imdbRating = omdb.imdbRating && omdb.imdbRating !== "N/A"
    ? parseFloat(omdb.imdbRating) : undefined;
  const awards = omdb.Awards && omdb.Awards !== "N/A" ? omdb.Awards : undefined;
  const { wins: festivalWins, noms: festivalNoms } = parseFestivalAwards(omdb.Awards ?? "");

  return Response.json({
    imdbId,
    imdbRating,
    rtScore,
    awards,
    festivalWins: festivalWins.length ? festivalWins : undefined,
    festivalNoms: festivalNoms.length ? festivalNoms : undefined,
    director:  director ?? (omdb.Director !== "N/A" ? omdb.Director : undefined),
    runtime:   runtime  ?? (omdb.Runtime  !== "N/A" ? parseInt(omdb.Runtime) : undefined),
    language:  language ?? (omdb.Language !== "N/A" ? omdb.Language : undefined),
    country:   country  ?? (omdb.Country  !== "N/A" ? omdb.Country  : undefined),
    trailerKey,
    streamingProviders: streamingProviders.length ? streamingProviders : undefined,
  });
}
