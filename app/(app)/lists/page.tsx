"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import FilmModal, { type ModalFilm } from "@/components/FilmModal";
import WatchedModal, { type WatchedModalFilm } from "@/components/WatchedModal";

type Tab = "shortlist" | "liked" | "passed" | "matches" | "watched";

interface FilmCell {
  id:          string;   // imdb_id
  tmdbId?:     number;
  title:       string;
  year:        number;
  posterUrl:   string;
  date:        string;
  extra?:      string;
  director?:   string;
  runtime?:    number;
  genres?:     string[];
  plot?:       string;
  tmdbRating?: number;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "shortlist", label: "Shortlist" },
  { key: "liked",     label: "Liked"     },
  { key: "passed",    label: "Passed"    },
  { key: "matches",   label: "Matches"   },
  { key: "watched",   label: "Watched"   },
];

interface SearchResult {
  id:        number;
  title:     string;
  year:      number;
  posterUrl: string;
  overview:  string;
}

// ── Grid card ─────────────────────────────────────────────────────────────────
function GridCard({
  item, canShortlist, canRemove, canWatch, shortlisted, watchedIds,
  onOpen, onShortlist, onRemove, onWatch,
}: {
  item:         FilmCell;
  canShortlist: boolean;
  canRemove:    boolean;
  canWatch:     boolean;
  shortlisted:  Set<string>;
  watchedIds:   Set<string>;
  onOpen:       (item: FilmCell) => void;
  onShortlist:  (item: FilmCell) => void;
  onRemove:     (item: FilmCell) => void;
  onWatch:      (item: FilmCell) => void;
}) {
  const rating        = item.tmdbRating ?? 0;
  const genres        = item.genres ?? [];
  const isShortlisted = shortlisted.has(item.id);
  const isWatched     = watchedIds.has(item.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      {/* Poster — clickable */}
      <div
        onClick={() => onOpen(item)}
        style={{
          width: "100%",
          aspectRatio: "2/3",
          background: "#141414",
          border: "1px solid rgba(245,241,234,0.06)",
          borderRadius: 3,
          overflow: "hidden",
          cursor: "pointer",
          position: "relative",
          marginBottom: 8,
        }}
      >
        {item.posterUrl && (
          <img
            src={item.posterUrl}
            alt={item.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}

        {/* Rating badge — top right */}
        {rating >= 0.1 && (
          <div style={{
            position: "absolute", top: 6, right: 6,
            background: "rgba(10,10,10,0.82)",
            backdropFilter: "blur(6px)",
            borderRadius: 2,
            padding: "2px 6px",
            display: "flex", alignItems: "center", gap: 3,
          }}>
            <span style={{ color: "#C9A961", fontSize: 9 }}>★</span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10,
              color: "#F5F1EA", letterSpacing: "0.04em",
            }}>
              {rating.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 12, color: "#F5F1EA",
        fontWeight: 500, lineHeight: 1.3,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        marginBottom: 2,
        cursor: "pointer",
      }} onClick={() => onOpen(item)}>
        {item.title}
      </div>

      {/* Year · Runtime */}
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550",
        letterSpacing: "0.05em", marginBottom: 5,
      }}>
        {[item.year || "", item.runtime ? `${item.runtime} min` : ""].filter(Boolean).join(" · ")}
      </div>

      {/* Genre chips — max 2 */}
      {genres.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {genres.slice(0, 2).map(g => (
            <span key={g} style={{
              fontFamily: "var(--font-sans)", fontSize: 9,
              color: "#4a4a4a", border: "1px solid #1e1e1e",
              borderRadius: 2, padding: "2px 6px",
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>{g}</span>
          ))}
        </div>
      )}

      {/* Friend match label */}
      {item.extra && (
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 10,
          color: "#8B2A2A", marginBottom: 5,
        }}>
          {item.extra}
        </div>
      )}

      {/* Action buttons */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: "flex", gap: 6 }}
      >
        {canShortlist && (
          <button
            onClick={() => onShortlist(item)}
            title="Add to Shortlist"
            style={{
              flex: 1,
              background: isShortlisted ? "#1a1408" : "transparent",
              border: `1px solid ${isShortlisted ? "#C9A96140" : "rgba(245,241,234,0.08)"}`,
              color: isShortlisted ? "#C9A961" : "#5A5550",
              fontFamily: "var(--font-mono)", fontSize: 9,
              letterSpacing: "0.08em", padding: "5px 0",
              cursor: isShortlisted ? "default" : "pointer",
              borderRadius: 2, transition: "all 0.15s",
            }}
          >
            {isShortlisted ? "★" : "+ List"}
          </button>
        )}
        {canWatch && (
          <button
            onClick={() => !isWatched && onWatch(item)}
            title={isWatched ? "Watched" : "Mark as Watched"}
            style={{
              width: 28,
              background: isWatched ? "#0e1a0e" : "transparent",
              border: `1px solid ${isWatched ? "#4a7c4a40" : "rgba(245,241,234,0.06)"}`,
              color: isWatched ? "#6aaa6a" : "#3a3a3a",
              fontFamily: "var(--font-mono)", fontSize: 12,
              padding: "5px 0",
              cursor: isWatched ? "default" : "pointer",
              borderRadius: 2, transition: "all 0.15s",
            }}
          >
            {isWatched ? "✓" : "○"}
          </button>
        )}
        {canRemove && (
          <button
            onClick={() => onRemove(item)}
            title="Remove"
            style={{
              flex: canShortlist ? undefined : 1,
              width: canShortlist ? 28 : undefined,
              background: "transparent",
              border: "1px solid rgba(245,241,234,0.06)",
              color: "#3a3a3a",
              fontFamily: "var(--font-mono)", fontSize: 12,
              padding: "5px 0",
              cursor: "pointer", borderRadius: 2,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ListsPage() {
  const [active, setActive]               = useState<Tab>("shortlist");
  const [items, setItems]                 = useState<FilmCell[]>([]);
  const [loading, setLoading]             = useState(false);
  const [shortlisted, setShortlisted]     = useState<Set<string>>(new Set());
  const [watchedIds, setWatchedIds]       = useState<Set<string>>(new Set());
  const [watchedModal, setWatchedModal]   = useState<WatchedModalFilm | null>(null);
  const [modalFilm, setModalFilm]         = useState<ModalFilm | null>(null);
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addedIds, setAddedIds]           = useState<Set<number>>(new Set());
  const [searchOpen, setSearchOpen]       = useState(false);
  const [activeGenres, setActiveGenres]   = useState<Set<string>>(new Set());
  const [hideWatched, setHideWatched]     = useState(false);

  const userRef        = useRef<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase       = createClient();

  // Reset genre filters when switching tabs
  useEffect(() => { setActiveGenres(new Set()); }, [active]);

  // All unique genres in the current tab's films
  const availableGenres = useMemo(() => {
    const all = new Set<string>();
    for (const item of items) {
      for (const g of item.genres ?? []) all.add(g);
    }
    return Array.from(all).sort();
  }, [items]);

  // Items filtered by selected genres + hide-watched toggle
  const filteredItems = useMemo(() => {
    let result = items;
    if (active === "liked" && hideWatched) {
      result = result.filter(item => !watchedIds.has(item.id));
    }
    if (activeGenres.size === 0) return result;
    return result.filter(item =>
      (item.genres ?? []).some(g => activeGenres.has(g))
    );
  }, [items, activeGenres, active, hideWatched, watchedIds]);

  function toggleGenre(g: string) {
    setActiveGenres(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const { results } = await res.json();
      setSearchResults(
        (results ?? []).slice(0, 8).map((f: any) => ({
          id:        f.id,
          title:     f.title,
          year:      parseInt(f.release_date?.slice(0, 4) ?? "0") || 0,
          posterUrl: f.poster_path ? `https://image.tmdb.org/t/p/w185${f.poster_path}` : "",
          overview:  f.overview ?? "",
        }))
      );
    }
    setSearchLoading(false);
  }, []);

  function onSearchChange(q: string) {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => runSearch(q), 350);
  }

  async function addFilm(film: SearchResult, action: "like" | "shortlist") {
    const res = await fetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId: film.id,
        direction: action === "shortlist" ? "like" : action,
        source: "manual",
        film: { title: film.title, year: film.year, posterUrl: film.posterUrl, genres: [], plot: film.overview },
      }),
    });
    if (!res.ok) return;
    if (action === "shortlist") {
      await fetch("/api/shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: film.id, film: { title: film.title, year: film.year, posterUrl: film.posterUrl } }),
      });
    }
    setAddedIds(prev => new Set([...prev, film.id]));
    if ((action === "like" && active === "liked") || (action === "shortlist" && active === "shortlist")) {
      load(active);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userRef.current = user.id;
      const [{ data: slData }, { data: wData }] = await Promise.all([
        supabase.from("shortlist").select("imdb_id").eq("user_id", user.id),
        supabase.from("watched").select("imdb_id").eq("user_id", user.id),
      ]);
      setShortlisted(new Set((slData ?? []).map((r: any) => r.imdb_id)));
      setWatchedIds(new Set((wData ?? []).map((r: any) => r.imdb_id)));
    })();
  }, []);

  useEffect(() => { load(active); }, [active]);

  async function fetchMovies(ids: string[]) {
    if (!ids.length) return new Map<string, any>();
    const { data } = await supabase
      .from("movies")
      .select("tmdb_id, imdb_id, title, year, poster_url, director, runtime_minutes, genres, plot, tmdb_rating")
      .in("imdb_id", ids);
    return new Map((data ?? []).map((m: any) => [m.imdb_id, m]));
  }

  async function load(tab: Tab) {
    setLoading(true);
    setItems([]);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    userRef.current = user.id;

    function mapMovie(r: any, movies: Map<string, any>, dateKey: string): FilmCell {
      const m = movies.get(r.imdb_id);
      return {
        id:         r.imdb_id,
        tmdbId:     m?.tmdb_id,
        title:      m?.title ?? r.imdb_id,
        year:       m?.year ?? 0,
        posterUrl:  m?.poster_url ?? "",
        date:       r[dateKey],
        director:   m?.director,
        runtime:    m?.runtime_minutes,
        genres:     m?.genres,
        plot:       m?.plot,
        tmdbRating: m?.tmdb_rating,
      };
    }

    if (tab === "shortlist") {
      const { data: rows } = await supabase
        .from("shortlist").select("imdb_id, added_at").eq("user_id", user.id)
        .order("added_at", { ascending: false });
      const movies = await fetchMovies((rows ?? []).map((r: any) => r.imdb_id));
      setItems((rows ?? []).map((r: any) => mapMovie(r, movies, "added_at")));
    }

    if (tab === "liked" || tab === "passed") {
      const { data: rows } = await supabase
        .from("swipes").select("imdb_id, created_at")
        .eq("user_id", user.id).eq("direction", tab === "liked" ? "like" : "pass")
        .order("created_at", { ascending: false });
      const movies = await fetchMovies((rows ?? []).map((r: any) => r.imdb_id));
      setItems((rows ?? []).map((r: any) => mapMovie(r, movies, "created_at")));
    }

    if (tab === "matches") {
      const res = await fetch("/api/matches");
      if (res.ok) {
        const { matches: data } = await res.json();
        setItems((data ?? []).map((m: any) => ({
          id:         m.imdb_id,
          tmdbId:     m.tmdbId,
          title:      m.title,
          year:       m.year,
          posterUrl:  m.posterUrl,
          date:       m.matchedAt,
          extra:      `with @${m.friendName}`,
          genres:     m.genres,
          plot:       m.plot,
          tmdbRating: m.tmdbRating,
          director:   m.director,
          runtime:    m.runtime,
        })));
      }
    }

    if (tab === "watched") {
      const { data: rows } = await supabase
        .from("watched").select("imdb_id, watched_at").eq("user_id", user.id)
        .order("watched_at", { ascending: false });
      const movies = await fetchMovies((rows ?? []).map((r: any) => r.imdb_id));
      setItems((rows ?? []).map((r: any) => mapMovie(r, movies, "watched_at")));
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
    if (!item.tmdbId) return;
    const res = await fetch("/api/shortlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: item.tmdbId, film: { title: item.title, year: item.year, posterUrl: item.posterUrl } }),
    });
    if (res.ok) setShortlisted(prev => new Set([...prev, item.id]));
  }

  function openWatchedModal(item: FilmCell) {
    setWatchedModal({
      id:       item.id,
      tmdbId:   item.tmdbId,
      title:    item.title,
      year:     item.year,
      posterUrl: item.posterUrl,
    });
  }

  async function handleWatch(film: WatchedModalFilm, rating: number, review: string) {
    if (!userRef.current) return;
    await supabase.from("watched").upsert({
      user_id:    userRef.current,
      imdb_id:    film.id,
      watched_at: new Date().toISOString(),
      rating,
      review:     review || null,
    }, { onConflict: "user_id,imdb_id" });
    setWatchedIds(prev => new Set([...prev, film.id]));
    if (active === "watched") load("watched");
  }

  function openModal(item: FilmCell) {
    setModalFilm({
      tmdbId:    item.tmdbId,
      imdbId:    item.id.startsWith("tt") ? item.id : undefined,
      title:     item.title,
      year:      item.year,
      posterUrl: item.posterUrl,
      director:  item.director,
      runtime:   item.runtime,
      genres:    item.genres,
      plot:      item.plot,
      tmdbRating: item.tmdbRating,
    });
  }

  const canRemove    = active !== "matches";
  const canShortlist = active !== "shortlist";
  const canWatch     = active !== "watched";

  return (
    <div style={{
      position: "absolute", inset: 0, background: "#0A0A0A",
      display: "flex", flexDirection: "column",
      paddingBottom: "calc(70px + env(safe-area-inset-bottom, 0px))" as string,
    }}>
      <FilmModal film={modalFilm} onClose={() => setModalFilm(null)} />
      <WatchedModal
        film={watchedModal}
        onClose={() => setWatchedModal(null)}
        onSubmit={handleWatch}
      />

      {/* Header */}
      <div style={{ padding: "24px 24px 0", borderBottom: "1px solid rgba(245,241,234,0.06)", flexShrink: 0 }}>
        <h1 style={{
          fontFamily: "var(--font-serif)", fontSize: 32, fontStyle: "italic",
          fontWeight: 700, color: "#F5F1EA", marginBottom: 14,
        }}>
          Your Lists
        </h1>
        <div style={{
          display: "flex", overflowX: "auto", scrollbarWidth: "none", gap: 0, paddingBottom: 1,
        } as React.CSSProperties}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActive(tab.key)} style={{
              flexShrink: 0, background: "transparent", border: "none",
              borderBottom: `2px solid ${active === tab.key ? "#C9A961" : "transparent"}`,
              color: active === tab.key ? "#F5F1EA" : "#5A5550",
              fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em",
              textTransform: "uppercase", padding: "10px 16px 10px 0",
              cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search / Add films */}
      <div style={{ padding: "12px 24px 0", flexShrink: 0 }}>
        {!searchOpen ? (
          <button onClick={() => setSearchOpen(true)} style={{
            background: "none", border: "1px solid rgba(245,241,234,0.08)",
            color: "#5A5550", fontFamily: "var(--font-mono)", fontSize: 10,
            letterSpacing: "0.12em", textTransform: "uppercase",
            padding: "7px 14px", borderRadius: 2, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
          }}>
            + Add a film
          </button>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                autoFocus type="text" placeholder="Search films…"
                value={searchQuery} onChange={e => onSearchChange(e.target.value)}
                style={{
                  flex: 1, background: "#111",
                  border: "1px solid rgba(245,241,234,0.1)", borderRadius: 2,
                  color: "#F5F1EA", fontFamily: "var(--font-sans)", fontSize: 13,
                  padding: "9px 12px", outline: "none",
                }}
              />
              <button onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                style={{ background: "none", border: "none", color: "#5A5550", fontFamily: "var(--font-mono)", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>
                ×
              </button>
            </div>
            {searchLoading && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#3A3A3A", letterSpacing: "0.1em", marginTop: 8 }}>Searching…</div>
            )}
            {!searchLoading && searchResults.length > 0 && (
              <div style={{ marginTop: 4, border: "1px solid rgba(245,241,234,0.06)", borderRadius: 2, overflow: "hidden" }}>
                {searchResults.map(film => (
                  <div key={film.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", borderBottom: "1px solid rgba(245,241,234,0.04)",
                    background: "#0D0D0D",
                  }}>
                    {film.posterUrl && (
                      <img src={film.posterUrl} alt="" style={{ width: 28, height: 42, objectFit: "cover", borderRadius: 1, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#F5F1EA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{film.title}</div>
                      {film.year > 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#5A5550" }}>{film.year}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {addedIds.has(film.id) ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#C9A961", letterSpacing: "0.1em" }}>Added</span>
                      ) : (
                        <>
                          <button onClick={() => addFilm(film, "like")} style={{ background: "none", border: "1px solid rgba(245,241,234,0.08)", color: "#5A5550", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", padding: "4px 8px", borderRadius: 2, cursor: "pointer" }}>Like</button>
                          <button onClick={() => addFilm(film, "shortlist")} style={{ background: "none", border: "1px solid rgba(245,241,234,0.08)", color: "#C9A961", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", padding: "4px 8px", borderRadius: 2, cursor: "pointer" }}>+ List</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hide watched toggle — Liked tab only */}
      {active === "liked" && (
        <div style={{ padding: "0 24px 10px", flexShrink: 0 }}>
          <button
            onClick={() => setHideWatched(h => !h)}
            style={{
              background:   hideWatched ? "#0e1a0e" : "transparent",
              border:       `1px solid ${hideWatched ? "#4a7c4a40" : "#252525"}`,
              borderRadius: 2,
              padding:      "5px 12px",
              color:        hideWatched ? "#6aaa6a" : "#3a3a3a",
              fontFamily:   "var(--font-mono)",
              fontSize:     10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor:       "pointer",
              transition:   "all 0.15s ease",
              display:      "flex",
              alignItems:   "center",
              gap:          6,
            }}
          >
            <span>{hideWatched ? "✓" : "○"}</span>
            Hide Watched
          </button>
        </div>
      )}

      {/* Genre filter chips */}
      {availableGenres.length > 0 && (
        <div style={{
          display: "flex", gap: 6, overflowX: "auto", padding: "0 24px 12px",
          scrollbarWidth: "none", flexShrink: 0,
        } as React.CSSProperties}>
          {availableGenres.map(g => {
            const on = activeGenres.has(g);
            return (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                style={{
                  flexShrink: 0,
                  background:   on ? "#1c1308" : "transparent",
                  border:       `1px solid ${on ? "#C9A96155" : "#252525"}`,
                  borderRadius: 2,
                  padding:      "5px 12px",
                  color:        on ? "#C9A961" : "#3a3a3a",
                  fontFamily:   "var(--font-sans)",
                  fontSize:     11,
                  cursor:       "pointer",
                  letterSpacing: "0.03em",
                  whiteSpace:   "nowrap",
                  transition:   "all 0.15s ease",
                }}
              >
                {g}
              </button>
            );
          })}
        </div>
      )}

      {/* Count */}
      {!loading && filteredItems.length > 0 && (
        <div style={{ padding: "0 24px 10px", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3A3A3A", letterSpacing: "0.12em" }}>
            {filteredItems.length} {filteredItems.length === 1 ? "film" : "films"}
            {activeGenres.size > 0 ? " · filtered" : ""}
          </span>
        </div>
      )}

      {/* Scrollable grid */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        {loading && (
          <div style={{ padding: "32px 24px", fontFamily: "var(--font-mono)", fontSize: 12, color: "#3A3A3A", letterSpacing: "0.12em" }}>
            Loading…
          </div>
        )}

        {!loading && filteredItems.length === 0 && (
          <div style={{ textAlign: "center", padding: "56px 24px" }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", color: "#3A3A3A" }}>
              {activeGenres.size > 0 ? "No films match that genre." : active === "shortlist" ? "No films shortlisted yet." : "Nothing here yet."}
            </div>
            {active === "shortlist" && activeGenres.size === 0 && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#2a2a2a", letterSpacing: "0.1em", marginTop: 12 }}>
                Tap + on any film to add it here
              </div>
            )}
          </div>
        )}

        {filteredItems.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "20px 14px",
            padding: "4px 24px 32px",
          }}>
            {filteredItems.map(item => (
              <GridCard
                key={item.id}
                item={item}
                canShortlist={canShortlist}
                canRemove={canRemove}
                canWatch={canWatch}
                shortlisted={shortlisted}
                watchedIds={watchedIds}
                onOpen={openModal}
                onShortlist={addToShortlist}
                onRemove={remove}
                onWatch={openWatchedModal}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
