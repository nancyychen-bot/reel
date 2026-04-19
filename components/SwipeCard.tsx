"use client";

import { MutableRefObject, useEffect, useRef, useState } from "react";

export interface FilmData {
  tmdbId:     number;
  imdbId?:    string;
  title:      string;
  year:       number;
  director:   string;
  runtime:    number;
  genres:     string[];
  plot:       string;
  tmdbRating: number;
  rtScore?:   number;
  country?:   string;
  language?:  string;
  awards?:    string;
  posterUrl:  string;
  // Visual identity — generated or from seed
  bg?:        string;
  glow?:      string;
  accent?:    string;
}

interface SwipeCardProps {
  film:               FilmData;
  isTop:              boolean;
  stackIndex:         number;
  onSwipe:            (direction: "like" | "pass", film: FilmData) => void;
  triggerRef?:        MutableRefObject<((dir: "like" | "pass") => void) | null>;
  triggerDetailsRef?: MutableRefObject<(() => void) | null>;
}

const THRESHOLD = 108;

// Derive a consistent accent color from the film title if not provided
function deriveAccent(title: string) {
  const palettes = [
    { bg: "radial-gradient(ellipse at 38% 40%, #2a4a22 0%, #0f2009 50%, #060d04 100%)", glow: "#3a6a2e", accent: "#7cc07a" },
    { bg: "radial-gradient(ellipse at 65% 30%, #2e0a45 0%, #180525 55%, #080210 100%)", glow: "#7030b8", accent: "#c080e8" },
    { bg: "radial-gradient(ellipse at 50% 22%, #0e2040 0%, #061020 55%, #020508 100%)", glow: "#1848a8", accent: "#5090d8" },
    { bg: "radial-gradient(ellipse at 42% 55%, #481008 0%, #2a0804 55%, #100302 100%)", glow: "#b03018", accent: "#d87050" },
    { bg: "radial-gradient(ellipse at 50% 45%, #0e1e2e 0%, #060e18 55%, #030508 100%)", glow: "#284860", accent: "#7090b0" },
    { bg: "radial-gradient(ellipse at 35% 45%, #0a2820 0%, #051510 55%, #020808 100%)", glow: "#188860", accent: "#48c898" },
    { bg: "radial-gradient(ellipse at 55% 38%, #3e1008 0%, #221008 55%, #0e0602 100%)", glow: "#b84010", accent: "#e07840" },
    { bg: "radial-gradient(ellipse at 48% 60%, #301808 0%, #180c02 55%, #090500 100%)", glow: "#986020", accent: "#c89040" },
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) & 0xffffffff;
  return palettes[Math.abs(hash) % palettes.length];
}

export default function SwipeCard({ film, isTop, stackIndex, onSwipe, triggerRef, triggerDetailsRef }: SwipeCardProps) {
  const [dragState, setDragState] = useState({ x: 0, y: 0 });
  const dragRef   = useRef({ x: 0, y: 0 });
  const startRef  = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting,  setExiting]  = useState<"left" | "right" | null>(null);
  const [details,  setDetails]  = useState(false);
  const [posterUrl, setPosterUrl]  = useState<string | null>(film.posterUrl || null);
  const [posterLoaded, setPosterLoaded] = useState(false);

  const visual = {
    bg:     film.bg     ?? deriveAccent(film.title).bg,
    glow:   film.glow   ?? deriveAccent(film.title).glow,
    accent: film.accent ?? deriveAccent(film.title).accent,
  };

  // Expose programmatic swipe + details toggle to parent (button row)
  useEffect(() => {
    if (triggerRef) {
      triggerRef.current = (dir: "like" | "pass") => {
        if (exiting) return;
        setExiting(dir === "like" ? "right" : "left");
        setTimeout(() => onSwipe(dir, film), 430);
      };
    }
    if (triggerDetailsRef) {
      triggerDetailsRef.current = () => setDetails(d => !d);
    }
    return () => {
      if (triggerRef) triggerRef.current = null;
      if (triggerDetailsRef) triggerDetailsRef.current = null;
    };
  });

  // Drag handlers
  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent | TouchEvent) => {
      const cx = (e as MouseEvent).clientX ?? (e as TouchEvent).touches?.[0]?.clientX;
      const cy = (e as MouseEvent).clientY ?? (e as TouchEvent).touches?.[0]?.clientY;
      if (cx == null) return;
      const dx = cx - startRef.current.x;
      const dy = cy - startRef.current.y;
      dragRef.current = { x: dx, y: dy };
      setDragState({ x: dx, y: dy });
    };
    const up = () => {
      setDragging(false);
      const { x } = dragRef.current;
      if (Math.abs(x) > THRESHOLD) {
        const dir = x > 0 ? "right" : "left";
        setExiting(dir);
        setTimeout(() => onSwipe(dir === "right" ? "like" : "pass", film), 430);
      } else {
        dragRef.current = { x: 0, y: 0 };
        setDragState({ x: 0, y: 0 });
      }
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
    };
  }, [dragging]);

  function onPointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (!isTop || exiting) return;
    const cx = (e as React.MouseEvent).clientX ?? (e as React.TouchEvent).touches?.[0]?.clientX;
    const cy = (e as React.MouseEvent).clientY ?? (e as React.TouchEvent).touches?.[0]?.clientY;
    startRef.current = { x: cx, y: cy };
    dragRef.current  = { x: 0, y: 0 };
    setDragging(true);
  }

  const sx = dragState.x;
  const sy = dragState.y;
  const rot = sx / 20;
  const likeOp = Math.max(0, Math.min(1,  sx / 90));
  const passOp = Math.max(0, Math.min(1, -sx / 90));
  const stackSc = 1 - stackIndex * 0.04;
  const stackTy = stackIndex * -16;

  let tf: string;
  if      (exiting === "right") tf = "translateX(135vw) rotate(22deg)";
  else if (exiting === "left")  tf = "translateX(-135vw) rotate(-22deg)";
  else if (!isTop)              tf = `scale(${stackSc}) translateY(${stackTy}px)`;
  else                          tf = `translateX(${sx}px) translateY(${sy * 0.12}px) rotate(${rot}deg)`;

  const trans = dragging ? "none" : "transform 0.48s cubic-bezier(0.25,0.46,0.45,0.94)";

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      transform: tf,
      transition: trans,
      zIndex: 10 - stackIndex,
      cursor: isTop ? (dragging ? "grabbing" : "grab") : "default",
      userSelect: "none",
    }}>
      <div
        style={{
          position: "absolute",
          inset: "0 14px",
          borderRadius: 5,
          overflow: "hidden",
          background: "#0c0c0c",
          boxShadow: "0 30px 70px rgba(0,0,0,0.75), 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
      >
        {/* Poster area */}
        <div style={{ position: "absolute", inset: "0 0 118px", overflow: "hidden" }}>

          {/* Abstract background — always rendered */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: visual.bg,
            opacity: posterLoaded ? 0 : 1,
            transition: "opacity 0.5s ease",
          }}>
            {/* Top film-leader strip */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 3,
              background: `linear-gradient(to right, transparent, ${visual.glow}80, transparent)`,
            }}/>
            {/* Index + year */}
            <div style={{
              position: "absolute", top: 22, left: 22,
              fontFamily: "var(--font-mono)", fontSize: 10,
              color: visual.accent, letterSpacing: "0.15em", opacity: 0.7,
            }}>
              {film.year}
            </div>
            {/* Director top right */}
            <div style={{
              position: "absolute", top: 22, right: 22,
              fontFamily: "var(--font-mono)", fontSize: 10,
              color: visual.accent, letterSpacing: "0.1em", opacity: 0.4,
              textTransform: "uppercase",
            }}>
              {film.director.split(" ").pop()}
            </div>
            {/* Glowing orb */}
            <div style={{
              position: "absolute", top: "28%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 180, height: 180, borderRadius: "50%",
              background: `radial-gradient(circle, ${visual.glow}55 0%, transparent 70%)`,
              filter: "blur(28px)",
            }}/>
            {/* Oversized title texture */}
            <div style={{
              position: "absolute", bottom: "25%", left: -6,
              fontFamily: "var(--font-display)",
              fontSize: film.title.length > 16 ? "13vw" : "17vw",
              color: visual.accent, opacity: 0.1,
              whiteSpace: "nowrap", lineHeight: 1,
              letterSpacing: "0em", textTransform: "uppercase",
              userSelect: "none", pointerEvents: "none",
            }}>
              {film.title}
            </div>
          </div>

          {/* Real poster */}
          {posterUrl && (
            <img
              src={posterUrl}
              alt={film.title}
              onLoad={() => setPosterLoaded(true)}
              onError={() => { setPosterUrl(null); }}
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover",
                opacity: posterLoaded ? 1 : 0,
                transition: "opacity 0.5s ease",
              }}
            />
          )}

          {/* Vignette */}
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at 50% 28%, transparent 28%, rgba(0,0,0,0.6) 100%)",
          }}/>
          {/* Bottom fade */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: "50%",
            background: "linear-gradient(to top, #0A0A0A 0%, transparent 100%)",
          }}/>
        </div>

        {/* LIKE stamp */}
        <div style={{
          position: "absolute", top: 38, left: 24,
          border: `2px solid ${visual.accent}`,
          color: visual.accent,
          fontFamily: "var(--font-display)",
          fontSize: 18, letterSpacing: "0.04em", padding: "3px 10px", borderRadius: 2,
          opacity: likeOp, transform: "rotate(-14deg)",
          transition: dragging ? "none" : "opacity 0.1s",
        }}>LIKE</div>

        {/* PASS stamp */}
        <div style={{
          position: "absolute", top: 38, right: 24,
          border: "2px solid #6a6560", color: "#6a6560",
          fontFamily: "var(--font-display)",
          fontSize: 18, letterSpacing: "0.04em", padding: "3px 10px", borderRadius: 2,
          opacity: passOp, transform: "rotate(14deg)",
          transition: dragging ? "none" : "opacity 0.1s",
        }}>PASS</div>

        {/* Info panel — always visible at bottom */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 118,
          background: "#0A0A0A", borderTop: "1px solid #181818",
          padding: "14px 20px 16px", zIndex: 5,
        }}>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 28, color: "#F5F1EA", lineHeight: 1.05,
            letterSpacing: "0em", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
            textTransform: "uppercase", marginBottom: 6,
          }}>
            {film.title}
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 12,
            color: "#5A5550", letterSpacing: "0.07em",
          }}>
            {film.director !== "Unknown" ? film.director : ""}
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: "#3a3a3a", letterSpacing: "0.07em", marginTop: 3,
          }}>
            {film.country ? `${film.country} · ` : ""}{film.year}
          </div>
        </div>

        {/* Detail panel — slides up */}
        <div
          style={{
            position: "absolute", left: 0, right: 0,
            bottom: details ? 0 : -500,
            height: 500,
            backdropFilter: "blur(24px) brightness(0.7)",
            backgroundColor: "rgba(8,8,8,0.94)",
            transition: "bottom 0.38s cubic-bezier(0.25,0.46,0.45,0.94)",
            padding: "50px 22px 24px",
            zIndex: 10,
            overflowY: "auto",
          }}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          <p style={{
            fontFamily: "var(--font-sans)", fontSize: 15,
            color: "#9A9590", lineHeight: 1.7, marginBottom: 20,
          }}>
            {film.plot}
          </p>

          {/* Ratings */}
          <div style={{ display: "flex", gap: 24, marginBottom: 18 }}>
            {film.tmdbRating > 0 && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#3a3a3a", letterSpacing: "0.12em", marginBottom: 3 }}>TMDB RATING</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, color: visual.accent }}>{film.tmdbRating.toFixed(1)}</div>
              </div>
            )}
            {film.rtScore != null && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#3a3a3a", letterSpacing: "0.12em", marginBottom: 3 }}>ROTTEN TOMATOES</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, color: visual.accent }}>{film.rtScore}%</div>
              </div>
            )}
          </div>

          {/* Meta */}
          <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
            {[["RUNTIME", film.runtime ? `${film.runtime} min` : ""], ["LANGUAGE", film.language ?? ""]].filter(([,v]) => v).map(([k, v]) => (
              <div key={k}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#3a3a3a", letterSpacing: "0.1em", marginBottom: 3 }}>{k}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#8A8580" }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Genre chips */}
          {film.genres.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
              {film.genres.map(g => (
                <span key={g} style={{
                  fontFamily: "var(--font-sans)", fontSize: 11, color: "#4a4a4a",
                  border: "1px solid #222", borderRadius: 2, padding: "3px 10px",
                  letterSpacing: "0.05em", textTransform: "uppercase",
                }}>{g}</span>
              ))}
            </div>
          )}

          {/* Awards */}
          {film.awards && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#3a3a3a", letterSpacing: "0.12em", marginBottom: 6 }}>AWARDS & RECOGNITION</div>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "#6a6560", lineHeight: 1.6 }}>{film.awards}</p>
            </div>
          )}
        </div>

        {/* Detail toggle */}
        {isTop && (
          <button
            onClick={() => setDetails(d => !d)}
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: details ? 510 : 120,
              left: "50%", transform: "translateX(-50%)",
              background: "transparent", border: "none",
              color: visual.accent,
              cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: 10,
              letterSpacing: "0.18em", padding: "10px 20px",
              transition: "bottom 0.38s cubic-bezier(0.25,0.46,0.45,0.94)",
              zIndex: 15,
              opacity: 0.8,
            }}
          >
            {details ? "▲  LESS" : "▼  MORE"}
          </button>
        )}
      </div>
    </div>
  );
}
