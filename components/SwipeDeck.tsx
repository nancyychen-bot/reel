"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SwipeCard, { type FilmData } from "./SwipeCard";

interface SwipeDeckProps {
  films:       FilmData[];
  onSwipe:     (tmdbId: number, direction: "like" | "pass", film: FilmData) => void;
  onShortlist?: (tmdbId: number, film: FilmData) => void;
  onUndo?:     (tmdbId: number) => void;
  onEmpty?:    () => void;
}

export default function SwipeDeck({ films, onSwipe, onShortlist, onUndo, onEmpty }: SwipeDeckProps) {
  // Internal queue — append incoming films, remove swiped ones
  const [queue, setQueue]           = useState<FilmData[]>([]);
  const [lastSwiped, setLastSwiped] = useState<FilmData | null>(null);
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
      setLastSwiped(film);
      setQueue(prev => {
        const next = prev.filter(f => f.tmdbId !== film.tmdbId);
        if (next.length <= 5) onEmpty?.();
        return next;
      });
    },
    [onSwipe, onEmpty]
  );

  const handleUndo = useCallback(() => {
    if (!lastSwiped) return;
    onUndo?.(lastSwiped.tmdbId);
    setQueue(prev => [lastSwiped, ...prev.filter(f => f.tmdbId !== lastSwiped.tmdbId)]);
    setLastSwiped(null);
  }, [lastSwiped, onUndo]);

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
            onShortlist={i === 0 && onShortlist ? (f) => onShortlist(f.tmdbId, f) : undefined}
            triggerRef={i === 0 ? triggerRef : undefined}
            triggerDetailsRef={i === 0 ? triggerDetailsRef : undefined}
          />
        ))}

        {/* Undo — top-right of card stack, Hinge-style */}
        <button
          onClick={handleUndo}
          disabled={!lastSwiped}
          style={{
            position: "absolute",
            top: 10,
            right: 22,
            zIndex: 20,
            background: "none",
            border: "none",
            padding: "6px 4px",
            cursor: lastSwiped ? "pointer" : "default",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            opacity: lastSwiped ? 1 : 0.22,
            transition: "opacity 0.2s ease",
          }}
        >
          {/* SVG arc-back arrow, styled to match the app */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M4 8 C4 4.5 7 2 11 2 C15 2 18 5 18 9 C18 13 15 16 11 16 C8.5 16 6.4 14.8 5.2 13"
              stroke="#C9A961"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
            <polyline points="2,6 4,9 7,7" stroke="#C9A961" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            letterSpacing: "0.14em",
            color: "#5a5050",
            textTransform: "uppercase",
          }}>
            Undo
          </span>
        </button>
      </div>

      {/* Buttons — ✕ and ♥ */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "6px 0 18px",
        flexShrink: 0,
      }}>
        <Btn onClick={() => triggerRef.current?.("pass")}
          size={56} color="#5A5550" bg="#111" border="#202020">✕</Btn>
        <Btn onClick={() => triggerRef.current?.("like")}
          size={66} color="#8B2A2A" bg="#120808" border="#8B2A2A40"
          shadow="0 0 24px #8B2A2A18">♥</Btn>
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
