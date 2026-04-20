"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SwipeDeck from "@/components/SwipeDeck";
import MatchModal, { type MatchFilm } from "@/components/MatchModal";
import FilterPanel from "@/components/FilterPanel";
import type { FilmData } from "@/components/SwipeCard";
import { type Genre, type Special } from "@/lib/filters";

export default function SwipePage() {
  const [genres,  setGenres]  = useState<Set<Genre>>(new Set());
  const [special, setSpecial] = useState<Set<Special>>(new Set());
  const [filtersReady, setFiltersReady] = useState(false);
  const [filterOpen, setFilterOpen]     = useState(false);
  const [films, setFilms]   = useState<FilmData[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage]       = useState(1);
  const [match, setMatch]     = useState<MatchFilm | null>(null);
  const [showHint, setShowHint] = useState(false);

  // Client-side record of every tmdbId swiped this session — used to
  // deduplicate incoming batches before DB swipes are fully committed.
  const swipedIds = useRef(new Set<number>());

  // Show first-time hint
  useEffect(() => {
    if (!localStorage.getItem("reel_hinted")) {
      setShowHint(true);
      localStorage.setItem("reel_hinted", "1");
    }
  }, []);

  // Load session-stored filters on mount
  useEffect(() => {
    try {
      const g = sessionStorage.getItem("reel_genres");
      const s = sessionStorage.getItem("reel_special");
      if (g) setGenres(new Set(JSON.parse(g) as Genre[]));
      if (s) setSpecial(new Set(JSON.parse(s) as Special[]));
    } catch { /* ignore */ }
    setFiltersReady(true);
  }, []);

  // Load deck whenever filters or page change
  useEffect(() => {
    if (!filtersReady) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    const g = Array.from(genres);
    const s = Array.from(special);
    if (g.length) params.set("genres",  g.join(","));
    if (s.length) params.set("special", s.join(","));
    fetch(`/api/deck?${params}`)
      .then(r => r.json())
      .then(data => {
        const incoming = (data.films ?? []).filter((f: FilmData) => !swipedIds.current.has(f.tmdbId));
        setFilms(prev => page === 1 ? incoming : [...prev, ...incoming]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [genres, special, filtersReady, page]);

  const handleShortlist = useCallback(async (tmdbId: number, film: FilmData) => {
    await fetch("/api/shortlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId,
        film: {
          title:      film.title,
          year:       film.year,
          posterUrl:  film.posterUrl,
          genres:     film.genres,
          plot:       film.plot,
          tmdbRating: film.tmdbRating,
          director:   film.director,
        },
      }),
    });
  }, []);

  const handleUndo = useCallback(async (tmdbId: number) => {
    await fetch("/api/swipe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId }),
    });
  }, []);

  const handleSwipe = useCallback(async (tmdbId: number, direction: "like" | "pass", film: FilmData) => {
    swipedIds.current.add(tmdbId);
    const res = await fetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId,
        direction,
        film: {
          title:      film.title,
          year:       film.year,
          posterUrl:  film.posterUrl,
          genres:     film.genres,
          plot:       film.plot,
          tmdbRating: film.tmdbRating,
          director:   film.director,
        },
      }),
    });
    const data = await res.json();
    if (data.match) setMatch(data.match);
  }, []);

  function toggleGenre(g: Genre) {
    setPage(1); setFilms([]); swipedIds.current.clear();
    setGenres(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      sessionStorage.setItem("reel_genres", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function toggleSpecial(s: Special) {
    setPage(1); setFilms([]); swipedIds.current.clear();
    setSpecial(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      sessionStorage.setItem("reel_special", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function clearFilters() {
    setPage(1); setFilms([]); swipedIds.current.clear();
    setGenres(new Set()); setSpecial(new Set());
    sessionStorage.removeItem("reel_genres");
    sessionStorage.removeItem("reel_special");
  }

  const totalFilters = genres.size + special.size;

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#0A0A0A",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      paddingBottom: "calc(70px + env(safe-area-inset-bottom, 0px))" as string, // nav bar height
    }}>
      {/* Match toast */}
      <MatchModal film={match} onDone={() => setMatch(null)} />

      {/* First-time hint */}
      {showHint && (
        <div
          onClick={() => setShowHint(false)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 200,
            background: "rgba(4,4,4,0.88)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 36px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: 11,
              color: "#C9A961",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}>
              How it works
            </div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: 36,
              color: "#F5F1EA",
              textTransform: "uppercase",
              lineHeight: 1.05,
              letterSpacing: "0.01em",
              marginBottom: 16,
            }}>
              Swipe right for films you like or want to see
            </div>
            <div style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "#5A5550",
              lineHeight: 1.7,
              marginBottom: 36,
            }}>
              Match with friends who picked the same film. Tonight is sorted.
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 32 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, color: "#5A5550", marginBottom: 6 }}>✕</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3a3a3a", letterSpacing: "0.12em" }}>PASS</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 32, color: "#C9A961", marginBottom: 6 }}>♥</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3a3a3a", letterSpacing: "0.12em" }}>LIKE</div>
              </div>
            </div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "#2a2a2a",
              letterSpacing: "0.16em",
              marginTop: 36,
              textTransform: "uppercase",
            }}>
              Tap anywhere to continue
            </div>
          </div>
        </div>
      )}

      {/* Slim filter bar */}
      <div style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "10px 18px 8px",
        borderBottom: "1px solid #141414",
        flexShrink: 0,
      }}>
        <button
          onClick={() => setFilterOpen(o => !o)}
          style={{
            background: totalFilters > 0 ? "#1c1308" : "transparent",
            border: `1px solid ${totalFilters > 0 ? "#C9A96155" : "#252525"}`,
            borderRadius: 2,
            padding: "5px 12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 7,
            transition: "all 0.15s ease",
          }}
        >
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: totalFilters > 0 ? "#C9A961" : "#3a3a3a",
          }}>
            Filters
          </span>
          {totalFilters > 0 && (
            <span style={{
              background: "#C9A961",
              color: "#0A0A0A",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              borderRadius: 10,
              padding: "1px 6px",
              letterSpacing: "0.04em",
              lineHeight: 1.6,
            }}>
              {totalFilters}
            </span>
          )}
        </button>
      </div>

      <FilterPanel
        open={filterOpen}
        genres={genres}
        special={special}
        onToggleGenre={toggleGenre}
        onToggleSpecial={toggleSpecial}
        onClear={clearFilters}
        onClose={() => setFilterOpen(false)}
      />

      {/* Deck — flex:1 */}
      {loading && films.length === 0 ? (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "#3a3a3a",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}>
          Curating…
        </div>
      ) : (
        <SwipeDeck
          films={films}
          onSwipe={handleSwipe}
          onShortlist={handleShortlist}
          onUndo={handleUndo}
          onEmpty={() => setPage(p => p + 1)}
        />
      )}
    </div>
  );
}
