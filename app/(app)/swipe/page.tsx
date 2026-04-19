"use client";

import { useCallback, useEffect, useState } from "react";
import SwipeDeck from "@/components/SwipeDeck";
import MatchModal, { type MatchFilm } from "@/components/MatchModal";
import type { FilmData } from "@/components/SwipeCard";
import { MOODS, type Mood } from "@/lib/moods";

export default function SwipePage() {
  const [moods, setMoods]           = useState<Set<Mood>>(new Set());
  const [moodsReady, setMoodsReady] = useState(false);
  const [films, setFilms]           = useState<FilmData[]>([]);
  const [loading, setLoading]       = useState(false);
  const [page, setPage]             = useState(1);
  const [match, setMatch]           = useState<MatchFilm | null>(null);
  const [showHint, setShowHint]     = useState(false);

  // Show first-time hint
  useEffect(() => {
    if (!localStorage.getItem("reel_hinted")) {
      setShowHint(true);
      localStorage.setItem("reel_hinted", "1");
    }
  }, []);

  // Load session-stored moods on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("reel_moods");
    if (stored) {
      try { setMoods(new Set(JSON.parse(stored) as Mood[])); } catch { /* ignore */ }
    }
    setMoodsReady(true);
  }, []);

  // Load deck whenever moods or page change
  useEffect(() => {
    if (!moodsReady) return;
    setLoading(true);
    const arr = Array.from(moods);
    const params = new URLSearchParams({ page: String(page) });
    if (arr.length) params.set("moods", arr.join(","));
    fetch(`/api/deck?${params}`)
      .then(r => r.json())
      .then(data => {
        setFilms(prev => page === 1 ? (data.films ?? []) : [...prev, ...(data.films ?? [])]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [moods, moodsReady, page]);

  const handleUndo = useCallback(async (tmdbId: number) => {
    await fetch("/api/swipe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId }),
    });
  }, []);

  const handleSwipe = useCallback(async (tmdbId: number, direction: "like" | "pass", film: FilmData) => {
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

  function toggleMood(mood: Mood | "all") {
    if (mood === "all") {
      setPage(1);
      setFilms([]);
      setMoods(new Set());
      sessionStorage.removeItem("reel_moods");
      return;
    }
    setPage(1);
    setFilms([]);
    setMoods(prev => {
      const next = new Set(prev);
      next.has(mood) ? next.delete(mood) : next.add(mood);
      sessionStorage.setItem("reel_moods", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  const allSelected = moods.size === 0;

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#0A0A0A",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      paddingBottom: 70, // nav bar height
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

      {/* Mood bar — includes REEL logo in its padding */}
      <div style={{
        paddingTop: 12,
        paddingBottom: 8,
        borderBottom: "1px solid #141414",
        flexShrink: 0,
      }}>
        {/* Mood chips row */}
        <div style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingLeft: 16,
          paddingRight: 16,
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}>
          {/* All Films chip */}
          <button
            onClick={() => toggleMood("all")}
            style={{
              flexShrink: 0,
              background: allSelected ? "#1c1308" : "transparent",
              border: `1px solid ${allSelected ? "#C9A96155" : "#252525"}`,
              borderRadius: 2,
              padding: "6px 14px",
              color: allSelected ? "#C9A961" : "#3a3a3a",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              cursor: "pointer",
              letterSpacing: "0.03em",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            All Films
          </button>

          {MOODS.map(mood => {
            const on = moods.has(mood);
            return (
              <button
                key={mood}
                onClick={() => toggleMood(mood)}
                style={{
                  flexShrink: 0,
                  background: on ? "#1c1308" : "transparent",
                  border: `1px solid ${on ? "#C9A96155" : "#252525"}`,
                  borderRadius: 2,
                  padding: "6px 14px",
                  color: on ? "#C9A961" : "#3a3a3a",
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  cursor: "pointer",
                  letterSpacing: "0.03em",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                {mood}
              </button>
            );
          })}
        </div>
      </div>

      {/* Deck — flex:1 */}
      {loading && films.length === 0 ? (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "#3a3a3a",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}>
          Curating…
        </div>
      ) : (
        <SwipeDeck
          films={films}
          onSwipe={handleSwipe}
          onUndo={handleUndo}
          onEmpty={() => setPage(p => p + 1)}
        />
      )}
    </div>
  );
}
