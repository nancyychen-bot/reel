import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildRoomDeck, type FilmRecord, type UserPrefs } from "@/lib/recommender";
import { type Genre, type Special } from "@/lib/filters";

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

  // Return cached queue if already generated
  if (room.queue_imdb_ids?.length) {
    const { data: films } = await supabase
      .from("movies")
      .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating")
      .in("imdb_id", room.queue_imdb_ids);

    // Preserve stored order
    const filmMap = new Map((films ?? []).map((f: any) => [f.imdb_id, f]));
    const ordered = room.queue_imdb_ids
      .map((id: string) => filmMap.get(id))
      .filter(Boolean);

    return Response.json({ films: ordered.map(shapeFilm) });
  }

  // Parse genres/special from mood_tags (stored as ["Drama","Thriller","Short"] etc.)
  const tags: string[] = room.mood_tags ?? [];
  const SPECIAL_VALUES = ["Short", "Epic", "Classic", "Recent"];
  const genres  = tags.filter(t => !SPECIAL_VALUES.includes(t)) as Genre[];
  const special = tags.filter(t =>  SPECIAL_VALUES.includes(t)) as Special[];

  // Get participants and build prefs for both
  const { data: participants } = await supabase
    .from("room_participants")
    .select("user_id")
    .eq("room_id", room.id);

  const participantIds = (participants ?? []).map((p: any) => p.user_id);

  async function getPrefs(uid: string): Promise<UserPrefs> {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("preferred_genres, favorite_film_tmdb_ids")
      .eq("user_id", uid)
      .maybeSingle();
    return {
      favoriteGenres: prefs?.preferred_genres ?? [],
      seedGenres:     [],
      seedDirectors:  [],
    };
  }

  const [userAPrefs, userBPrefs] = await Promise.all(
    participantIds.slice(0, 2).map(getPrefs)
  );

  // Quality pool: seeded films only, rated 7.3+, ordered by rating desc
  // This leans toward acclaimed/arthouse rather than mainstream blockbusters
  const { data: pool } = await supabase
    .from("movies")
    .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating")
    .gte("tmdb_rating", 7.3)
    .order("tmdb_rating", { ascending: false })
    .limit(600);

  const filmPool: FilmRecord[] = (pool ?? []).map((f: any) => ({
    tmdb_id:     f.tmdb_id,
    imdb_id:     f.imdb_id,
    title:       f.title,
    year:        f.year,
    runtime:     f.runtime_minutes ?? 0,
    genres:      f.genres ?? [],
    director:    f.director ?? "",
    plot:        f.plot ?? "",
    poster_url:  f.poster_url ?? "",
    tmdb_rating: f.tmdb_rating ?? 0,
    list_count:  1, // all DB films are curated — score them as such
  }));

  const deck = buildRoomDeck({
    pool:       filmPool,
    swipedIds:  new Set(),
    watchedIds: new Set(),
    userAPrefs: userAPrefs ?? { favoriteGenres: [], seedGenres: [], seedDirectors: [] },
    userBPrefs: userBPrefs ?? { favoriteGenres: [], seedGenres: [], seedDirectors: [] },
    moods:      [],
    genres,
    special,
    count:      60,
  });

  // Cache on room row so both users get identical films
  await supabase.from("rooms").update({
    queue_imdb_ids: deck.map(f => f.imdb_id),
    status: "active",
  }).eq("id", room.id);

  return Response.json({ films: deck.map(shapeFilm) });
}

function shapeFilm(f: any) {
  return {
    tmdbId:     f.tmdb_id,
    title:      f.title,
    year:       f.year,
    director:   f.director || "Unknown",
    runtime:    f.runtime_minutes ?? f.runtime ?? 0,
    genres:     f.genres ?? [],
    plot:       f.plot ?? "",
    tmdbRating: f.tmdb_rating ?? 0,
    posterUrl:  f.poster_url ?? "",
  };
}
