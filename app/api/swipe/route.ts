import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { tmdbId, direction, source, film: filmData } = await request.json();

  if (!tmdbId || !["like", "pass"].includes(direction)) {
    return Response.json({ error: "Invalid params" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Get movie record (or create one from client-provided data for TMDB fallback films)
  let { data: movie } = await supabase
    .from("movies")
    .select("imdb_id, title, year, director, poster_url")
    .eq("tmdb_id", tmdbId)
    .maybeSingle();

  if (!movie) {
    if (!filmData) return Response.json({ error: "Film not found" }, { status: 404 });
    // Use numeric tmdbId string as placeholder imdb_id until OMDB enriches it
    const placeholderId = String(tmdbId);
    await supabase.from("movies").upsert({
      tmdb_id:     tmdbId,
      imdb_id:     placeholderId,
      title:       filmData.title    ?? "",
      year:        filmData.year     ?? 0,
      poster_url:  filmData.posterUrl ?? "",
      genres:      filmData.genres   ?? [],
      plot:        filmData.plot     ?? "",
      tmdb_rating: filmData.tmdbRating ?? 0,
      director:    filmData.director ?? "",
    }, { onConflict: "tmdb_id" });
    movie = { imdb_id: placeholderId, title: filmData.title, year: filmData.year, director: filmData.director, poster_url: filmData.posterUrl };
  }

  // Upsert swipe (unique per user+film)
  await supabase.from("swipes").upsert({
    user_id:   user.id,
    imdb_id:   movie.imdb_id,
    direction,
    source:    source ?? "async",
  }, { onConflict: "user_id,imdb_id" });

  // Check for async match if liked
  if (direction === "like") {
    // Get accepted friends
    const { data: friendships } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .eq("status", "accepted")
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

    const friendIds = (friendships ?? []).map(f =>
      f.user_id === user.id ? f.friend_id : f.user_id
    );

    for (const friendId of friendIds) {
      // Check if friend also liked this film
      const { data: friendSwipe } = await supabase
        .from("swipes")
        .select("id")
        .eq("user_id", friendId)
        .eq("imdb_id", movie.imdb_id)
        .eq("direction", "like")
        .maybeSingle();

      if (friendSwipe) {
        // Create match (canonical order: smaller UUID first)
        const [userA, userB] = [user.id, friendId].sort();

        const { error } = await supabase.from("matches").upsert({
          user_a:   userA,
          user_b:   userB,
          imdb_id:  movie.imdb_id,
          context:  source ?? "async",
        }, { onConflict: "user_a,user_b,imdb_id" });

        if (!error) {
          // Get friend's username for the modal
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", friendId)
            .single();

          return Response.json({
            match: {
              title:      movie.title,
              year:       movie.year,
              director:   movie.director,
              posterUrl:  movie.poster_url,
              friendName: profile?.username ?? "friend",
            },
          });
        }
      }
    }
  }

  return Response.json({ match: null });
}
