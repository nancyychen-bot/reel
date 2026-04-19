"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tab = "shortlist" | "liked" | "passed" | "matches" | "watched";

interface FilmCell {
  id:        string;
  title:     string;
  year:      number;
  posterUrl: string;
  date:      string;
  extra?:    string;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "shortlist", label: "Shortlist" },
  { key: "liked",     label: "Liked"     },
  { key: "passed",    label: "Passed"    },
  { key: "matches",   label: "Matches"   },
  { key: "watched",   label: "Watched"   },
];

export default function ListsPage() {
  const [active, setActive]           = useState<Tab>("shortlist");
  const [items, setItems]             = useState<FilmCell[]>([]);
  const [loading, setLoading]         = useState(false);
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());
  const userRef                       = useRef<string | null>(null);
  const supabase                      = createClient();

  // Load shortlisted ids so we can show the + button state everywhere
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userRef.current = user.id;
      const { data } = await supabase
        .from("shortlist")
        .select("imdb_id")
        .eq("user_id", user.id);
      setShortlisted(new Set((data ?? []).map((r: any) => r.imdb_id)));
    })();
  }, []);

  useEffect(() => { load(active); }, [active]);

  async function fetchMovies(ids: string[]) {
    if (!ids.length) return new Map<string, { title: string; year: number; poster_url: string }>();
    const { data } = await supabase
      .from("movies")
      .select("imdb_id, title, year, poster_url")
      .in("imdb_id", ids);
    return new Map((data ?? []).map((m: any) => [m.imdb_id, m]));
  }

  async function load(tab: Tab) {
    setLoading(true);
    setItems([]);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    userRef.current = user.id;

    if (tab === "shortlist") {
      const { data: rows } = await supabase
        .from("shortlist")
        .select("imdb_id, added_at")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });

      const list = rows ?? [];
      const movies = await fetchMovies(list.map(r => r.imdb_id));
      setItems(list.map((r: any) => ({
        id:        r.imdb_id,
        title:     movies.get(r.imdb_id)?.title ?? r.imdb_id,
        year:      movies.get(r.imdb_id)?.year ?? 0,
        posterUrl: movies.get(r.imdb_id)?.poster_url ?? "",
        date:      r.added_at,
      })));
    }

    if (tab === "liked" || tab === "passed") {
      const dir = tab === "liked" ? "like" : "pass";
      const { data: rows } = await supabase
        .from("swipes")
        .select("imdb_id, created_at")
        .eq("user_id", user.id)
        .eq("direction", dir)
        .order("created_at", { ascending: false });

      const list = rows ?? [];
      const movies = await fetchMovies(list.map(r => r.imdb_id));
      setItems(list.map((r: any) => ({
        id:        r.imdb_id,
        title:     movies.get(r.imdb_id)?.title ?? r.imdb_id,
        year:      movies.get(r.imdb_id)?.year ?? 0,
        posterUrl: movies.get(r.imdb_id)?.poster_url ?? "",
        date:      r.created_at,
      })));
    }

    if (tab === "matches") {
      const { data: rows } = await supabase
        .from("matches")
        .select("imdb_id, matched_at, user_a, user_b")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order("matched_at", { ascending: false });

      const list = rows ?? [];
      const movies = await fetchMovies(list.map(r => r.imdb_id));
      const friendIds = [...new Set(list.map((m: any) => m.user_a === user.id ? m.user_b : m.user_a))];
      const { data: profileRows } = friendIds.length
        ? await supabase.from("profiles").select("id, username").in("id", friendIds)
        : { data: [] };
      const profileMap = new Map((profileRows ?? []).map((p: any) => [p.id, p.username]));

      setItems(list.map((m: any) => ({
        id:        m.imdb_id,
        title:     movies.get(m.imdb_id)?.title ?? m.imdb_id,
        year:      movies.get(m.imdb_id)?.year ?? 0,
        posterUrl: movies.get(m.imdb_id)?.poster_url ?? "",
        date:      m.matched_at,
        extra:     `with @${profileMap.get(m.user_a === user.id ? m.user_b : m.user_a) ?? "friend"}`,
      })));
    }

    if (tab === "watched") {
      const { data: rows } = await supabase
        .from("watched")
        .select("imdb_id, watched_at")
        .eq("user_id", user.id)
        .order("watched_at", { ascending: false });

      const list = rows ?? [];
      const movies = await fetchMovies(list.map(r => r.imdb_id));
      setItems(list.map((r: any) => ({
        id:        r.imdb_id,
        title:     movies.get(r.imdb_id)?.title ?? r.imdb_id,
        year:      movies.get(r.imdb_id)?.year ?? 0,
        posterUrl: movies.get(r.imdb_id)?.poster_url ?? "",
        date:      r.watched_at,
      })));
    }

    setLoading(false);
  }

  async function remove(item: FilmCell) {
    if (!userRef.current) return;
    if (active === "shortlist") {
      await supabase.from("shortlist").delete().eq("user_id", userRef.current).eq("imdb_id", item.id);
      setShortlisted(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    } else if (active === "liked" || active === "passed") {
      await supabase.from("swipes").delete().eq("user_id", userRef.current).eq("imdb_id", item.id);
    } else if (active === "watched") {
      await supabase.from("watched").delete().eq("user_id", userRef.current).eq("imdb_id", item.id);
    }
    setItems(prev => prev.filter(i => i.id !== item.id));
  }

  async function addToShortlist(item: FilmCell) {
    const res = await fetch("/api/shortlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: parseInt(item.id) || 0, film: { title: item.title, year: item.year, posterUrl: item.posterUrl } }),
    });
    if (res.ok) {
      setShortlisted(prev => new Set([...prev, item.id]));
    }
  }

  const canRemove = active !== "matches";
  const canShortlist = active !== "shortlist";

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#0A0A0A",
      display: "flex",
      flexDirection: "column",
      paddingBottom: 70,
    }}>
      {/* Header */}
      <div style={{ padding: "24px 24px 0", borderBottom: "1px solid rgba(245,241,234,0.06)", flexShrink: 0 }}>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 32,
          fontStyle: "italic",
          fontWeight: 700,
          color: "#F5F1EA",
          marginBottom: 14,
        }}>
          Your Lists
        </h1>

        {/* Tabs — horizontal scroll */}
        <div style={{
          display: "flex",
          overflowX: "auto",
          scrollbarWidth: "none",
          gap: 0,
          paddingBottom: 1,
        } as React.CSSProperties}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              style={{
                flexShrink: 0,
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${active === tab.key ? "#C9A961" : "transparent"}`,
                color: active === tab.key ? "#F5F1EA" : "#5A5550",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "10px 16px 10px 0",
                cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        {loading && (
          <div style={{ padding: "32px 24px", fontFamily: "var(--font-mono)", fontSize: 10, color: "#3A3A3A", letterSpacing: "0.12em" }}>
            Loading…
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ textAlign: "center", padding: "56px 24px" }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", color: "#3A3A3A" }}>
              {active === "shortlist" ? "No films shortlisted yet." : "Nothing here yet."}
            </div>
            {active === "shortlist" && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#2a2a2a", letterSpacing: "0.1em", marginTop: 12 }}>
                Tap + on any film to add it here
              </div>
            )}
          </div>
        )}

        <div style={{ padding: "0 24px" }}>
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
              {/* Poster */}
              <div style={{
                width: 42,
                height: 62,
                flexShrink: 0,
                background: "#141414",
                border: "1px solid rgba(245,241,234,0.06)",
                overflow: "hidden",
                borderRadius: 2,
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
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#5A5550" }}>{item.year || ""}</span>
                  {item.extra && (
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "#8B2A2A" }}>{item.extra}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                {/* + Shortlist */}
                {canShortlist && (
                  <button
                    onClick={() => addToShortlist(item)}
                    title="Add to Shortlist"
                    style={{
                      background: shortlisted.has(item.id) ? "#1a1408" : "none",
                      border: `1px solid ${shortlisted.has(item.id) ? "#C9A96140" : "rgba(245,241,234,0.08)"}`,
                      color: shortlisted.has(item.id) ? "#C9A961" : "#5A5550",
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      lineHeight: 1,
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: shortlisted.has(item.id) ? "default" : "pointer",
                      borderRadius: 2,
                      transition: "all 0.15s",
                    }}
                  >
                    {shortlisted.has(item.id) ? "★" : "+"}
                  </button>
                )}

                {/* × Remove */}
                {canRemove && (
                  <button
                    onClick={() => remove(item)}
                    title="Remove"
                    style={{
                      background: "none",
                      border: "1px solid rgba(245,241,234,0.08)",
                      color: "#3a3a3a",
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      lineHeight: 1,
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      borderRadius: 2,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
