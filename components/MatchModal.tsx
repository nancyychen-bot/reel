"use client";

import { useEffect, useRef, useState } from "react";

export interface MatchFilm {
  title:      string;
  year:       number;
  director:   string;
  posterUrl:  string;
  friendName: string;
}

interface MatchModalProps {
  film:   MatchFilm | null;
  onDone: () => void;
}

const DURATION = 2200; // ms

export default function MatchModal({ film, onDone }: MatchModalProps) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(1); // 1 → 0
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef   = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!film) { setVisible(false); return; }

    setVisible(true);
    setProgress(1);
    startRef.current = performance.now();

    // Animate drain bar
    function tick(now: number) {
      const elapsed = now - startRef.current;
      const p = Math.max(0, 1 - elapsed / DURATION);
      setProgress(p);
      if (p > 0) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300); // after fade-out
    }, DURATION);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current)   cancelAnimationFrame(rafRef.current);
    };
  }, [film]);

  if (!film) return null;

  return (
    <div
      onClick={() => { setVisible(false); setTimeout(onDone, 200); }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 300,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-12px)",
        transition: "opacity 0.25s, transform 0.25s",
        pointerEvents: visible ? "auto" : "none",
        cursor: "pointer",
      }}
    >
      {/* Toast body */}
      <div style={{
        margin: "10px 16px 0",
        background: "#141414",
        border: "1px solid rgba(245,241,234,0.10)",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      }}>
        {/* Content row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
        }}>
          {/* Poster thumbnail */}
          {film.posterUrl && (
            <div style={{
              width: 38,
              height: 54,
              flexShrink: 0,
              borderRadius: 2,
              overflow: "hidden",
              background: "#0a0a0a",
            }}>
              <img
                src={film.posterUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              letterSpacing: "0.18em",
              color: "#C9A961",
              textTransform: "uppercase",
              marginBottom: 4,
            }}>
              Match with {film.friendName}
            </div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              color: "#F5F1EA",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              lineHeight: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {film.title}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "#5A5550",
              marginTop: 3,
              letterSpacing: "0.05em",
            }}>
              {film.year} · {film.director}
            </div>
          </div>

          {/* Heart */}
          <div style={{
            fontSize: 20,
            color: "#C9A961",
            flexShrink: 0,
          }}>
            ♥
          </div>
        </div>

        {/* Drain progress bar */}
        <div style={{
          height: 2,
          background: "rgba(201,169,97,0.15)",
        }}>
          <div style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: "#C9A961",
            transition: "width 0.05s linear",
          }} />
        </div>
      </div>
    </div>
  );
}
