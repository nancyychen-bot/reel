"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SwipeCard, { type FilmData } from "./SwipeCard";

interface SwipeDeckProps {
  films:    FilmData[];
  onSwipe:  (tmdbId: number, direction: "like" | "pass", film: FilmData) => void;
  onEmpty?: () => void;
}

export default function SwipeDeck({ films, onSwipe, onEmpty }: SwipeDeckProps) {
  // Internal queue — append incoming films, remove swiped ones
  const [queue, setQueue] = useState<FilmData[]>([]);
  const triggerRef        = useRef<((dir: "like" | "pass") => void) | null>(null);
  const triggerDetailsRef = useRef<(() => void) | null>(null);

  // Append new films without duplicates
  useEffect(() => {
    setQueue(prev => {
      const seen = new Set(prev.map(f => f.tmdbId));
      const toAdd = films.filter(f => !seen.has(f.tmdbId));
      return toAdd.length ? [...prev, ...toAdd] : prev;
    });
  }, [films]);

  const handleSwipe = useCallback(
    (direction: "like" | "pass", film: FilmData) => {
      onSwipe(film.tmdbId, direction, film);
      setQueue(prev => {
        const next = prev.filter(f => f.tmdbId !== film.tmdbId);
        // Load more when running low
        if (next.length <= 5) onEmpty?.();
        return next;
      });
    },
    [onSwipe, onEmpty]
  );

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") triggerRef.current?.("like");
      if (e.key === "ArrowLeft")  triggerRef.current?.("pass");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (queue.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          color: "#F5F1EA",
          letterSpacing: "0.01em",
          textTransform: "uppercase",
        }}>
          That's the queue.
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "#3a3a3a",
          letterSpacing: "0.1em",
        }}>
          Loading more…
        </div>
      </div>
    );
  }

  const visible = queue.slice(0, 3);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Card stack */}
      <div style={{ flex: 1, position: "relative", margin: "8px 0 4px" }}>
        {visible.map((film, i) => (
          <SwipeCard
            key={film.tmdbId}
            film={film}
            isTop={i === 0}
            stackIndex={i}
            onSwipe={handleSwipe}
            triggerRef={i === 0 ? triggerRef : undefined}
            triggerDetailsRef={i === 0 ? triggerDetailsRef : undefined}
          />
        ))}
      </div>

      {/* Buttons — ✕ and ♥ only */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "10px 0 18px",
        flexShrink: 0,
      }}>
        <Btn onClick={() => triggerRef.current?.("pass")}
          size={56} color="#5A5550" bg="#111" border="#202020">✕</Btn>
        <Btn onClick={() => triggerRef.current?.("like")}
          size={66} color="#C9A961" bg="#14100a" border="#C9A96140"
          shadow="0 0 24px #C9A96118">♥</Btn>
      </div>
    </div>
  );
}

function Btn({ children, onClick, size, color, bg, border, shadow }: {
  children: React.ReactNode;
  onClick?: () => void;
  size: number;
  color: string;
  bg: string;
  border: string;
  shadow?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: size, height: size,
        borderRadius: "50%",
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: size > 60 ? 26 : 22,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: shadow ?? "none",
        flexShrink: 0,
        transition: "transform 0.1s ease",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.06)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}
