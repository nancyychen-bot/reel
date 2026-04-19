/**
 * Shortlist API
 *
 * Before using, run this SQL in Supabase Dashboard → SQL Editor:
 *
 *   create table if not exists shortlist (
 *     user_id   uuid references profiles not null,
 *     imdb_id   text not null,
 *     added_at  timestamptz default now(),
 *     primary key (user_id, imdb_id)
 *   );
 *   alter table shortlist enable row level security;
 *   create policy "shortlist: owner" on shortlist
 *     for all using (auth.uid() = user_id);
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { tmdbId, film } = await request.json();
  if (!tmdbId) return Response.json({ error: "Invalid params" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure movie exists in DB (same logic as swipe route)
  let { data: movie } = await supabase
    .from("movies")
    .select("imdb_id")
    .eq("tmdb_id", tmdbId)
    .maybeSingle();

  if (!movie && film) {
    const admin = createAdminClient();
    const placeholderId = String(tmdbId);
    await admin.from("movies").upsert({
      tmdb_id:     tmdbId,
      imdb_id:     placeholderId,
      title:       film.title     ?? "",
      year:        film.year      ?? 0,
      poster_url:  film.posterUrl ?? "",
      genres:      film.genres    ?? [],
      plot:        film.plot      ?? "",
      tmdb_rating: film.tmdbRating ?? 0,
      director:    film.director  ?? "",
    }, { onConflict: "tmdb_id" });
    movie = { imdb_id: placeholderId };
  }

  if (!movie) return Response.json({ error: "Film not found" }, { status: 404 });

  const imdbId = movie.imdb_id;

  // Upsert a "like" swipe so the film also appears in Liked
  await supabase.from("swipes").upsert({
    user_id:  user.id,
    imdb_id:  imdbId,
    direction: "like",
    source:   "shortlist",
  }, { onConflict: "user_id,imdb_id" });

  // Add to shortlist
  const { error } = await supabase.from("shortlist").upsert({
    user_id:  user.id,
    imdb_id:  imdbId,
  }, { onConflict: "user_id,imdb_id" });

  if (error) {
    console.error("shortlist upsert error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, imdbId });
}

export async function DELETE(request: NextRequest) {
  const { imdbId } = await request.json();
  if (!imdbId) return Response.json({ error: "Invalid params" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("shortlist")
    .delete()
    .eq("user_id", user.id)
    .eq("imdb_id", imdbId);

  return Response.json({ ok: true });
}
