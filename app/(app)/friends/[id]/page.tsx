"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Match {
  imdb_id:    string;
  title:      string;
  year:       number;
  posterUrl:  string;
  matchedAt:  string;
}

export default function FriendMatchesPage() {
  const { id } = useParams<{ id: string }>();
  const [friendName, setFriendName] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from("profiles").select("username").eq("id", id).single();
      setFriendName(profile?.username ?? "");

      // Canonical ordering: user_a < user_b (enforced by DB check constraint)
      const [ua, ub] = [user.id, id].sort();
      const { data: ms } = await supabase
        .from("matches")
        .select("imdb_id, matched_at")
        .eq("user_a", ua)
        .eq("user_b", ub)
        .order("matched_at", { ascending: false });

      // Two-step movie fetch (no FK from matches.imdb_id → movies.imdb_id)
      const imdbIds = (ms ?? []).map((m: any) => m.imdb_id);
      let movieMap = new Map<string, { title: string; year: number; poster_url: string }>();
      if (imdbIds.length > 0) {
        const { data: movies } = await supabase
          .from("movies")
          .select("imdb_id, title, year, poster_url")
          .in("imdb_id", imdbIds);
        movieMap = new Map((movies ?? []).map((m: any) => [m.imdb_id, m]));
      }

      setMatches((ms ?? []).map((m: any) => ({
        imdb_id:   m.imdb_id,
        title:     movieMap.get(m.imdb_id)?.title ?? m.imdb_id,
        year:      movieMap.get(m.imdb_id)?.year ?? 0,
        posterUrl: movieMap.get(m.imdb_id)?.poster_url ?? "",
        matchedAt: m.matched_at,
      })));
      setLoading(false);
    }
    load();
  }, [id]);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#0A0A0A", overflowY: "auto", paddingBottom: 70 }}>
      <header style={{ padding: "24px 24px 20px", borderBottom: "1px solid rgba(245,241,234,0.06)" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550", letterSpacing: "0.12em", marginBottom: 6 }}>
          Matches with
        </p>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 36,
          fontStyle: "italic",
          fontWeight: 700,
          color: "#F5F1EA",
        }}>
          @{friendName}
        </h1>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3A3A3A", letterSpacing: "0.1em", marginTop: 4 }}>
          {matches.length} {matches.length === 1 ? "film" : "films"}
        </p>
      </header>

      <div style={{ padding: "24px" }}>
        {loading && (
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#3A3A3A" }}>Loading…</p>
        )}

        {!loading && matches.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontStyle: "italic", color: "#3A3A3A" }}>
              No matches yet.
            </div>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#2A2A2A", marginTop: 8 }}>
              Keep swiping — when you both like the same film, it appears here.
            </p>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {matches.map(m => (
            <div key={m.imdb_id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{
                aspectRatio: "2/3",
                background: "#141414",
                border: "1px solid rgba(245,241,234,0.06)",
                overflow: "hidden",
                borderRadius: 2,
              }}>
                {m.posterUrl && (
                  <img src={m.posterUrl} alt={m.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
              <div>
                <div style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 11,
                  color: "#F5F1EA",
                  fontWeight: 500,
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {m.title}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550" }}>
                  {m.year}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
