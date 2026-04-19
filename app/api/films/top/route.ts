import { NextResponse } from "next/server";

// Fetch top ~250 films from TMDB top_rated (13 pages × 20 = 260)
export async function GET() {
  const key = process.env.TMDB_API_KEY;
  if (!key) return NextResponse.json({ films: [] });

  try {
    const pages = await Promise.all(
      Array.from({ length: 13 }, (_, i) =>
        fetch(
          `https://api.themoviedb.org/3/movie/top_rated?api_key=${key}&language=en-US&page=${i + 1}`
        ).then(r => r.json())
      )
    );

    const films = pages
      .flatMap((p: any) => p.results ?? [])
      .filter((f: any) => f.poster_path && f.title)
      .map((f: any) => ({
        id:          f.id,
        title:       f.title,
        year:        f.release_date?.slice(0, 4) ?? "",
        poster_path: f.poster_path,
        rating:      f.vote_average,
      }));

    return NextResponse.json({ films });
  } catch {
    return NextResponse.json({ films: [] });
  }
}
