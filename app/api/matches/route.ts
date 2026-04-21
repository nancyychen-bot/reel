import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Returns all matches for the current user by intersecting liked swipes.
// This catches retroactive matches (films both users liked before becoming friends)
// that were never written to the matches table at swipe-time.
export async function GET(_: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Get accepted friends
  const { data: fs } = await supabase
    .from("friendships")
    .select("user_id, friend_id")
    .eq("status", "accepted")
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

  if (!fs || fs.length === 0) return Response.json({ matches: [] });

  const friendIds = fs.map(f => f.user_id === user.id ? f.friend_id : f.user_id);

  // Fetch current user's likes + all friends' likes in parallel (2 queries total)
  const [{ data: myLikes }, { data: friendLikes }] = await Promise.all([
    supabase.from("swipes").select("imdb_id").eq("user_id", user.id).eq("direction", "like"),
    admin.from("swipes").select("user_id, imdb_id").in("user_id", friendIds).eq("direction", "like"),
  ]);

  const myLikedSet = new Set((myLikes ?? []).map((s: any) => s.imdb_id));

  // Group friend likes by user_id, then intersect with mine
  const likesByFriend = new Map<string, string[]>();
  for (const s of friendLikes ?? []) {
    if (!likesByFriend.has(s.user_id)) likesByFriend.set(s.user_id, []);
    likesByFriend.get(s.user_id)!.push(s.imdb_id);
  }

  const matches: Array<{ friendId: string; imdb_id: string }> = [];
  for (const [friendId, theirLikes] of likesByFriend) {
    for (const imdbId of theirLikes) {
      if (myLikedSet.has(imdbId)) {
        matches.push({ friendId, imdb_id: imdbId });
      }
    }
  }

  return Response.json({ matches });
}
