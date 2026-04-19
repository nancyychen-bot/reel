"use client";

import { useCallback, useEffect, useRef } from "react";
import SwipeCard, { type FilmData } from "./SwipeCard";

interface SwipeDeckProps {
  films:    FilmData[];
  onSwipe:  (tmdbId: number, direction: "like" | "pass") => void;
  onEmpty?: () => void;
}

export default function SwipeDeck({ films, onSwipe, onEmpty }: SwipeDeckProps) {
  const triggerRef        = useRef<((dir: "like" | "pass") => void) | null>(null);
  const triggerDetailsRef = useRef<(() => void) | null>(null);
  // track index via ref so keyboard handler is stable
  const indexRef = useRef(0);
  const filmsRef = useRef(films);
  filmsRef.current = films;

  const handleSwipe = useCallback(
    (direction: "like" | "pass", film: FilmData) => {
      onSwipe(film.tmdbId, direction);
      indexRef.current += 1;
      if (indexRef.current >= filmsRef.current.length) onEmpty?.();
    },
    [onSwipe, onEmpty]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") triggerRef.current?.("like");
      if (e.key === "ArrowLeft")  triggerRef.current?.("pass");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (films.length === 0) {
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
          fontSize: 30,
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

  const visible = films.slice(0, 3);

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

      {/* Buttons — only ✕ and ♥ */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "10px 0 18px",
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
        fontSize: size > 60 ? 24 : 20,
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
