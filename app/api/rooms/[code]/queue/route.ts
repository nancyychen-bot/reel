import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildRoomDeck, type FilmRecord, type UserPrefs } from "@/lib/recommender";
import type { Mood } from "@/lib/moods";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: room } = await supabase
    .from("rooms")
    .select("id, mood_tags, queue_imdb_ids")
    .eq("code", code.toUpperCase())
    .single();

  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });

  // If queue already computed, return it
  if (room.queue_imdb_ids?.length) {
    const { data: films } = await supabase
      .from("movies")
      .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating")
      .in("imdb_id", room.queue_imdb_ids);

    const shaped = (films ?? []).map((f: any) => ({
      tmdbId:     f.tmdb_id,
      title:      f.title,
      year:       f.year,
      director:   f.director,
      runtime:    f.runtime_minutes,
      genres:     f.genres ?? [],
      plot:       f.plot ?? "",
      tmdbRating: f.tmdb_rating ?? 0,
      posterUrl:  f.poster_url ?? "",
    }));

    return Response.json({ films: shaped });
  }

  // Get both participants
  const { data: participants } = await supabase
    .from("room_participants")
    .select("user_id")
    .eq("room_id", room.id);

  const participantIds = (participants ?? []).map((p: any) => p.user_id);

  // Build prefs for each participant
  async function getPrefs(uid: string): Promise<UserPrefs> {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("preferred_genres, favorite_film_tmdb_ids")
      .eq("user_id", uid)
      .maybeSingle();

    let seedGenres: string[] = [];
    let seedDirectors: string[] = [];

    if (prefs?.favorite_film_tmdb_ids?.length) {
      const { data: seedFilms } = await supabase
        .from("movies")
        .select("genres, director")
        .in("tmdb_id", prefs.favorite_film_tmdb_ids);
      (seedFilms ?? []).forEach((sf: any) => {
        seedGenres.push(...(sf.genres ?? []));
        if (sf.director) seedDirectors.push(sf.director);
      });
    }

    return {
      favoriteGenres: prefs?.preferred_genres ?? [],
      seedGenres:     [...new Set(seedGenres)],
      seedDirectors:  [...new Set(seedDirectors)],
    };
  }

  const [userAPrefs, userBPrefs] = await Promise.all(
    participantIds.slice(0, 2).map(getPrefs)
  );

  const { data: pool } = await supabase
    .from("movies")
    .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating")
    .order("tmdb_rating", { ascending: false })
    .limit(500);

  const filmPool: FilmRecord[] = (pool ?? []).map((f: any) => ({
    tmdb_id:     f.tmdb_id,
    imdb_id:     f.imdb_id,
    title:       f.title,
    year:        f.year,
    runtime:     f.runtime_minutes,
    genres:      f.genres ?? [],
    director:    f.director ?? "",
    plot:        f.plot ?? "",
    poster_url:  f.poster_url ?? "",
    tmdb_rating: f.tmdb_rating ?? 0,
    list_count:  1,
  }));

  const moods = (room.mood_tags ?? []) as Mood[];
  const deck = buildRoomDeck({
    pool:       filmPool,
    swipedIds:  new Set(),
    watchedIds: new Set(),
    userAPrefs: userAPrefs ?? { favoriteGenres: [], seedGenres: [], seedDirectors: [] },
    userBPrefs: userBPrefs ?? { favoriteGenres: [], seedGenres: [], seedDirectors: [] },
    moods,
  });

  // Cache queue on the room
  await supabase.from("rooms").update({
    queue_imdb_ids: deck.map(f => f.imdb_id),
    status: "active",
  }).eq("id", room.id);

  const films = deck.map(f => ({
    tmdbId:     f.tmdb_id,
    title:      f.title,
    year:       f.year,
    director:   f.director,
    runtime:    f.runtime,
    genres:     f.genres,
    plot:       f.plot,
    tmdbRating: f.tmdb_rating,
    posterUrl:  f.poster_url,
  }));

  return Response.json({ films });
}
