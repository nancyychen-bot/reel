"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tab = "liked" | "passed" | "matches" | "watched";

interface FilmCell {
  id:        string;
  title:     string;
  year:      number;
  posterUrl: string;
  date:      string;
  extra?:    string; // friend name for matches
}

const TABS: { key: Tab; label: string }[] = [
  { key: "liked",   label: "Liked"   },
  { key: "passed",  label: "Passed"  },
  { key: "matches", label: "Matches" },
  { key: "watched", label: "Watched" },
];

export default function ListsPage() {
  const [active, setActive] = useState<Tab>("liked");
  const [items, setItems] = useState<FilmCell[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    load(active);
  }, [active]);

  async function load(tab: Tab) {
    setLoading(true);
    setItems([]);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Helper: look up movie metadata for a list of imdb_ids
    async function fetchMovies(ids: string[]): Promise<Map<string, { title: string; year: number; poster_url: string }>> {
      if (!ids.length) return new Map();
      const { data } = await supabase
        .from("movies")
        .select("imdb_id, title, year, poster_url")
        .in("imdb_id", ids);
      return new Map((data ?? []).map((m: any) => [m.imdb_id, m]));
    }

    if (tab === "liked" || tab === "passed") {
      const dir = tab === "liked" ? "like" : "pass";
      const { data: swipeRows } = await supabase
        .from("swipes")
        .select("imdb_id, created_at")
        .eq("user_id", user.id)
        .eq("direction", dir)
        .order("created_at", { ascending: false });

      const rows = swipeRows ?? [];
      const movies = await fetchMovies(rows.map(s => s.imdb_id));
      setItems(rows.map((s: any) => ({
        id:        s.imdb_id,
        title:     movies.get(s.imdb_id)?.title ?? s.imdb_id,
        year:      movies.get(s.imdb_id)?.year ?? 0,
        posterUrl: movies.get(s.imdb_id)?.poster_url ?? "",
        date:      s.created_at,
      })));
    }

    if (tab === "matches") {
      const { data: matchRows } = await supabase
        .from("matches")
        .select("imdb_id, matched_at, user_a, user_b")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order("matched_at", { ascending: false });

      const rows = matchRows ?? [];
      const movies = await fetchMovies(rows.map(m => m.imdb_id));

      // Fetch friend usernames
      const friendIds = [...new Set(rows.map((m: any) => m.user_a === user.id ? m.user_b : m.user_a))];
      const { data: profileRows } = friendIds.length
        ? await supabase.from("profiles").select("id, username").in("id", friendIds)
        : { data: [] };
      const profileMap = new Map((profileRows ?? []).map((p: any) => [p.id, p.username]));

      setItems(rows.map((m: any) => ({
        id:        m.imdb_id,
        title:     movies.get(m.imdb_id)?.title ?? m.imdb_id,
        year:      movies.get(m.imdb_id)?.year ?? 0,
        posterUrl: movies.get(m.imdb_id)?.poster_url ?? "",
        date:      m.matched_at,
        extra:     `with @${profileMap.get(m.user_a === user.id ? m.user_b : m.user_a) ?? "friend"}`,
      })));
    }

    if (tab === "watched") {
      const { data: watchedRows } = await supabase
        .from("watched")
        .select("imdb_id, watched_at")
        .eq("user_id", user.id)
        .order("watched_at", { ascending: false });

      const rows = watchedRows ?? [];
      const movies = await fetchMovies(rows.map(w => w.imdb_id));
      setItems(rows.map((w: any) => ({
        id:        w.imdb_id,
        title:     movies.get(w.imdb_id)?.title ?? w.imdb_id,
        year:      movies.get(w.imdb_id)?.year ?? 0,
        posterUrl: movies.get(w.imdb_id)?.poster_url ?? "",
        date:      w.watched_at,
      })));
    }

    setLoading(false);
  }

  async function unpass(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("swipes").delete().eq("user_id", user.id).eq("imdb_id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A" }}>
      {/* Header */}
      <header style={{ padding: "24px 24px 0", borderBottom: "1px solid rgba(245,241,234,0.06)" }}>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 36,
          fontStyle: "italic",
          fontWeight: 700,
          color: "#F5F1EA",
          marginBottom: 16,
        }}>
          Your Lists
        </h1>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${active === tab.key ? "#8B2A2A" : "transparent"}`,
                color: active === tab.key ? "#F5F1EA" : "#5A5550",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "12px 14px 12px 0",
                cursor: "pointer",
                marginRight: 16,
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div style={{ padding: "24px" }}>
        {loading && (
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#3A3A3A" }}>Loading…</p>
        )}

        {!loading && items.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", color: "#3A3A3A" }}>
              Nothing here yet.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {items.map(item => (
            <div
              key={item.id}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "center",
                padding: "12px 0",
                borderBottom: "1px solid rgba(245,241,234,0.05)",
              }}
            >
              {/* Poster thumbnail */}
              <div style={{
                width: 40,
                height: 60,
                flexShrink: 0,
                background: "#141414",
                border: "1px solid rgba(245,241,234,0.06)",
                overflow: "hidden",
                borderRadius: 1,
              }}>
                {item.posterUrl && (
                  <img src={item.posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "#F5F1EA",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {item.title}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#5A5550" }}>{item.year}</span>
                  {item.extra && (
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "#8B2A2A" }}>{item.extra}</span>
                  )}
                </div>
              </div>

              {/* Un-pass button */}
              {active === "passed" && (
                <button
                  onClick={() => unpass(item.id)}
                  title="Remove from passed — film re-enters deck"
                  style={{
                    background: "none",
                    border: "1px solid rgba(245,241,234,0.08)",
                    color: "#5A5550",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    letterSpacing: "0.1em",
                    padding: "4px 8px",
                    cursor: "pointer",
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                >
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
