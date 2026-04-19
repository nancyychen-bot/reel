"use client";

import { useCallback, useEffect, useState } from "react";
import SwipeDeck from "@/components/SwipeDeck";
import MoodSelector from "@/components/MoodSelector";
import MatchModal, { type MatchFilm } from "@/components/MatchModal";
import type { FilmData } from "@/components/SwipeCard";
import type { Mood } from "@/lib/moods";

export default function SwipePage() {
  const [moods, setMoods] = useState<Set<Mood>>(new Set());
  const [moodsReady, setMoodsReady] = useState(false);
  const [films, setFilms] = useState<FilmData[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [match, setMatch] = useState<MatchFilm | null>(null);

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

  const handleSwipe = useCallback(async (tmdbId: number, direction: "like" | "pass") => {
    const res = await fetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId, direction }),
    });
    const data = await res.json();
    if (data.match) setMatch(data.match);
  }, []);

  function toggleMood(mood: Mood) {
    setPage(1);
    setFilms([]);
    setMoods(prev => {
      const next = new Set(prev);
      next.has(mood) ? next.delete(mood) : next.add(mood);
      sessionStorage.setItem("reel_moods", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#0A0A0A",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Match toast — rendered at the top, outside of scroll */}
      <MatchModal film={match} onDone={() => setMatch(null)} />

      {/* Header */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px 12px",
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          color: "#F5F1EA",
          letterSpacing: "0.01em",
          textTransform: "uppercase",
          lineHeight: 1,
        }}>
          Reel
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "#3a3a3a",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}>
          {moods.size > 0 ? `${moods.size} mood${moods.size > 1 ? "s" : ""}` : "All films"}
        </div>
      </header>

      {/* Mood bar */}
      <div style={{ flexShrink: 0, paddingBottom: 12 }}>
        <MoodSelector selected={moods} onToggle={toggleMood} />
      </div>

      {/* Deck area */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 0 8px",
        overflow: "hidden",
      }}>
        {loading ? (
          <div style={{
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
            onEmpty={() => setPage(p => p + 1)}
          />
        )}
      </div>
    </div>
  );
}
