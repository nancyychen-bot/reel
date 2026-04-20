"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FilmModal, { type ModalFilm } from "@/components/FilmModal";

type TabKey = "matches" | "liked" | "shortlist";

interface Film {
  tmdbId:     number;
  imdbId:     string;
  title:      string;
  year:       number;
  posterUrl:  string;
  director?:  string;
  runtime?:   number;
  genres?:    string[];
  plot?:      string;
  tmdbRating?: number;
}

interface Match {
  imdb_id:    string;
  tmdbId?:    number;
  title:      string;
  year:       number;
  posterUrl:  string;
  director?:  string;
  runtime?:   number;
  genres?:    string[];
  plot?:      string;
  tmdbRating?: number;
  matchedAt:  string;
}

// ── small reusable film grid card with action buttons ─────────────────────────
function FilmCard({ film, addedIds, onLike, onShortlist, onOpen }: {
  film:        Film;
  addedIds:    Set<string>;
  onLike:      (f: Film) => void;
  onShortlist: (f: Film) => void;
  onOpen:      (f: Film) => void;
}) {
  const added = addedIds.has(film.imdbId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div
        onClick={() => onOpen(film)}
        style={{
          width: "100%",
          aspectRatio: "2/3",
          background: "#141414",
          border: "1px solid rgba(245,241,234,0.06)",
          overflow: "hidden",
          borderRadius: 2,
          position: "relative",
          cursor: "pointer",
        }}>
        {film.posterUrl && (
          <img src={film.posterUrl} alt={film.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </div>

      <div>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 11, color: "#F5F1EA",
          fontWeight: 500, lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {film.title}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550" }}>
          {film.year}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={() => onLike(film)}
          disabled={added}
          title="Add to Liked"
          style={{
            flex: 1,
            background: added ? "rgba(245,241,234,0.04)" : "transparent",
            border: `1px solid ${added ? "rgba(245,241,234,0.08)" : "rgba(245,241,234,0.15)"}`,
            color: added ? "#3A3A3A" : "#F5F1EA",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            padding: "5px 0",
            cursor: added ? "default" : "pointer",
            borderRadius: 2,
            transition: "all 0.15s",
          }}
        >
          {added ? "✓" : "♥"}
        </button>
        <button
          onClick={() => onShortlist(film)}
          disabled={added}
          title="Add to Shortlist"
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid rgba(245,241,234,0.15)",
            color: added ? "#3A3A3A" : "#C9A961",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            padding: "5px 0",
            cursor: added ? "default" : "pointer",
            borderRadius: 2,
            transition: "all 0.15s",
          }}
        >
          + List
        </button>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function FriendProfilePage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const [tab, setTab]             = useState<TabKey>("matches");
  const [friendName, setFriendName] = useState("");
  const [matches, setMatches]     = useState<Match[]>([]);
  const [liked, setLiked]         = useState<Film[]>([]);
  const [shortlist, setShortlist] = useState<Film[]>([]);
  const [loading, setLoading]     = useState(true);
  const [addedIds, setAddedIds]   = useState<Set<string>>(new Set());
  const [modalFilm, setModalFilm] = useState<ModalFilm | null>(null);

  // Load data for whichever tab is active (lazy-load non-matches tabs)
  useEffect(() => {
    async function loadBase() {
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", id).single();
      setFriendName(profile?.username ?? "");
      const res = await fetch(`/api/matches/${id}`);
      if (res.ok) {
        const { matches: data } = await res.json();
        setMatches(data ?? []);
      }
      setLoading(false);
    }
    loadBase();
  }, [id]);

  const loadLiked = useCallback(async () => {
    if (liked.length > 0) return;
    const res = await fetch(`/api/friends/${id}/liked`);
    if (res.ok) setLiked((await res.json()).films ?? []);
  }, [id, liked.length]);

  const loadShortlist = useCallback(async () => {
    if (shortlist.length > 0) return;
    const res = await fetch(`/api/friends/${id}/shortlist`);
    if (res.ok) setShortlist((await res.json()).films ?? []);
  }, [id, shortlist.length]);

  useEffect(() => {
    if (tab === "liked")     loadLiked();
    if (tab === "shortlist") loadShortlist();
  }, [tab]);

  async function handleLike(film: Film) {
    await fetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId:    film.tmdbId,
        direction: "like",
        film: {
          title:    film.title,
          year:     film.year,
          posterUrl: film.posterUrl,
          director: film.director,
        },
      }),
    });
    setAddedIds(prev => new Set(prev).add(film.imdbId));
  }

  async function handleShortlist(film: Film) {
    await fetch("/api/shortlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId: film.tmdbId,
        film: {
          title:    film.title,
          year:     film.year,
          posterUrl: film.posterUrl,
          director: film.director,
        },
      }),
    });
    setAddedIds(prev => new Set(prev).add(film.imdbId));
  }

  function tabStyle(active: boolean): React.CSSProperties {
    return {
      flex: 1,
      background: "transparent",
      border: "none",
      borderBottom: `2px solid ${active ? "#F5F1EA" : "rgba(245,241,234,0.08)"}`,
      color: active ? "#F5F1EA" : "#5A5550",
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      padding: "0 0 10px",
      cursor: "pointer",
      transition: "color 0.15s, border-color 0.15s",
    };
  }

  function EmptyState({ text }: { text: string }) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0" }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", color: "#3A3A3A" }}>
          {text}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "#0A0A0A", overflowY: "auto", paddingBottom: 70 }}>
      <FilmModal film={modalFilm} onClose={() => setModalFilm(null)} />
      <header style={{ padding: "24px 24px 0", borderBottom: "1px solid rgba(245,241,234,0.06)" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550", letterSpacing: "0.12em", marginBottom: 6 }}>
          @{friendName}
        </p>
        <h1 style={{
          fontFamily: "var(--font-serif)", fontSize: 32, fontStyle: "italic",
          fontWeight: 700, color: "#F5F1EA", marginBottom: 20,
        }}>
          {tab === "matches"   && `${matches.length} mutual match${matches.length !== 1 ? "es" : ""}`}
          {tab === "liked"     && "Their liked films"}
          {tab === "shortlist" && "Their shortlist"}
        </h1>

        <div style={{ display: "flex" }}>
          <button style={tabStyle(tab === "matches")}   onClick={() => setTab("matches")}>Matches</button>
          <button style={tabStyle(tab === "liked")}     onClick={() => setTab("liked")}>Liked</button>
          <button style={tabStyle(tab === "shortlist")} onClick={() => setTab("shortlist")}>Shortlist</button>
        </div>
      </header>

      <div style={{ padding: "24px" }}>

        {/* Matches tab */}
        {tab === "matches" && (
          <>
            {loading && <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#3A3A3A" }}>Loading…</p>}
            {!loading && matches.length === 0 && (
              <EmptyState text="No matches yet." />
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {matches.map(m => (
                <div key={m.imdb_id}
                  onClick={() => setModalFilm({ tmdbId: m.tmdbId, imdbId: m.imdb_id, title: m.title, year: m.year, posterUrl: m.posterUrl, director: m.director, runtime: m.runtime, genres: m.genres, plot: m.plot, tmdbRating: m.tmdbRating })}
                  style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, cursor: "pointer" }}>
                  <div style={{
                    width: "100%", aspectRatio: "2/3", background: "#141414",
                    border: "1px solid rgba(245,241,234,0.06)",
                    overflow: "hidden", borderRadius: 2,
                  }}>
                    {m.posterUrl && (
                      <img src={m.posterUrl} alt={m.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                  </div>
                  <div>
                    <div style={{
                      fontFamily: "var(--font-sans)", fontSize: 11, color: "#F5F1EA",
                      fontWeight: 500, lineHeight: 1.3,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
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
          </>
        )}

        {/* Liked tab */}
        {tab === "liked" && (
          <>
            {liked.length === 0 && <EmptyState text="Nothing liked yet." />}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {liked.map(f => (
                <FilmCard key={f.imdbId} film={f} addedIds={addedIds}
                  onLike={handleLike} onShortlist={handleShortlist}
                  onOpen={f => setModalFilm({ tmdbId: f.tmdbId, imdbId: f.imdbId, title: f.title, year: f.year, posterUrl: f.posterUrl, director: f.director, runtime: f.runtime, genres: f.genres, plot: f.plot, tmdbRating: f.tmdbRating })} />
              ))}
            </div>
          </>
        )}

        {/* Shortlist tab */}
        {tab === "shortlist" && (
          <>
            {shortlist.length === 0 && <EmptyState text="Nothing shortlisted yet." />}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {shortlist.map(f => (
                <FilmCard key={f.imdbId} film={f} addedIds={addedIds}
                  onLike={handleLike} onShortlist={handleShortlist}
                  onOpen={f => setModalFilm({ tmdbId: f.tmdbId, imdbId: f.imdbId, title: f.title, year: f.year, posterUrl: f.posterUrl, director: f.director, runtime: f.runtime, genres: f.genres, plot: f.plot, tmdbRating: f.tmdbRating })} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
