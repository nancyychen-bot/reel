"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SwipeCard, { type FilmData } from "./SwipeCard";

interface SwipeDeckProps {
  films:    FilmData[];
  onSwipe:  (tmdbId: number, direction: "like" | "pass") => void;
  onEmpty?: () => void;
}

export default function SwipeDeck({ films, onSwipe, onEmpty }: SwipeDeckProps) {
  const [index, setIndex] = useState(0);
  // Expose swipe trigger to button row via ref
  const triggerRef = useRef<((dir: "like" | "pass") => void) | null>(null);
  const triggerDetailsRef = useRef<(() => void) | null>(null);

  const handleSwipe = useCallback(
    (direction: "like" | "pass", film: FilmData) => {
      onSwipe(film.tmdbId, direction);
      setIndex(i => i + 1);
    },
    [onSwipe]
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

  // Notify parent when deck is empty
  useEffect(() => {
    if (index >= films.length && films.length > 0) onEmpty?.();
  }, [index, films.length, onEmpty]);

  const remaining = films.slice(index, index + 3);

  if (remaining.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 40,
      }}>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 32,
          color: "#3A3A3A",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          That's the deck.
        </div>
        <p style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "#2a2a2a",
          textAlign: "center",
          letterSpacing: "0.08em",
        }}>
          Come back tomorrow for a fresh batch.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 20,
      width: "100%",
    }}>
      {/* Card stack */}
      <div style={{ position: "relative", width: "100%", height: 500 }}>
        {remaining
          .slice()
          .reverse()
          .map((film, i) => {
            const stackIndex = remaining.length - 1 - i;
            const isTop = stackIndex === 0;
            return (
              <SwipeCard
                key={film.tmdbId}
                film={film}
                isTop={isTop}
                stackIndex={stackIndex}
                onSwipe={handleSwipe}
                triggerRef={isTop ? triggerRef : undefined}
                triggerDetailsRef={isTop ? triggerDetailsRef : undefined}
              />
            );
          })}
      </div>

      {/* Button row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}>
        {/* Pass */}
        <button
          onClick={() => triggerRef.current?.("pass")}
          aria-label="Pass"
          style={{
            width: 54,
            height: 54,
            borderRadius: "50%",
            background: "#141414",
            border: "1px solid #282828",
            color: "#6a6560",
            fontSize: 20,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3a3a3a"; (e.currentTarget as HTMLButtonElement).style.color = "#9a9590"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#282828"; (e.currentTarget as HTMLButtonElement).style.color = "#6a6560"; }}
        >
          ✕
        </button>

        {/* Details */}
        <button
          onClick={() => triggerDetailsRef.current?.()}
          aria-label="Details"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "#141414",
            border: "1px solid #282828",
            color: "#4a4545",
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3a3a3a"; (e.currentTarget as HTMLButtonElement).style.color = "#6a6560"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#282828"; (e.currentTarget as HTMLButtonElement).style.color = "#4a4545"; }}
        >
          ↓
        </button>

        {/* Like */}
        <button
          onClick={() => triggerRef.current?.("like")}
          aria-label="Like"
          style={{
            width: 54,
            height: 54,
            borderRadius: "50%",
            background: "#141414",
            border: "1px solid #282828",
            color: "#C9A961",
            fontSize: 20,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#C9A961"; (e.currentTarget as HTMLButtonElement).style.color = "#e8c870"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#282828"; (e.currentTarget as HTMLButtonElement).style.color = "#C9A961"; }}
        >
          ♥
        </button>
      </div>
    </div>
  );
}
