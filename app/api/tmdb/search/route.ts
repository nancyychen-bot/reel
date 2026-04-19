import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  const page = request.nextUrl.searchParams.get("page") ?? "1";

  if (!q) return Response.json({ results: [] });

  const url = new URL("https://api.themoviedb.org/3/search/movie");
  url.searchParams.set("api_key", process.env.TMDB_API_KEY!);
  url.searchParams.set("query", q);
  url.searchParams.set("page", page);
  url.searchParams.set("include_adult", "false");

  const res = await fetch(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) return Response.json({ results: [] }, { status: 500 });

  const data = await res.json();
  return Response.json({ results: data.results });
}
