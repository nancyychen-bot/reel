"use client";

import { MutableRefObject, useEffect, useRef, useState } from "react";

export interface FilmData {
  tmdbId:     number;
  imdbId?:    string;   // real tt-prefixed IMDb ID when available from deck
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
  onShortlist?:       (film: FilmData) => void;
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

export default function SwipeCard({ film, isTop, stackIndex, onSwipe, onShortlist, triggerRef, triggerDetailsRef }: SwipeCardProps) {
  const [dragState, setDragState] = useState({ x: 0, y: 0 });
  const dragRef   = useRef({ x: 0, y: 0 });
  const startRef  = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting,  setExiting]  = useState<"left" | "right" | null>(null);
  const [details,  setDetails]  = useState(false);
  const [posterUrl, setPosterUrl]  = useState<string | null>(film.posterUrl || null);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [enriched, setEnriched] = useState<{
    imdbId?:            string;
    imdbRating?:        number;
    rtScore?:           number;
    awards?:            string;
    festivalWins?:      string[];
    festivalNoms?:      string[];
    director?:          string;
    runtime?:           number;
    language?:          string;
    country?:           string;
    trailerKey?:        string;
    streamingProviders?: Array<{ id: number; name: string }>;
  } | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);

  const visual = {
    bg:     film.bg     ?? deriveAccent(film.title).bg,
    glow:   film.glow   ?? deriveAccent(film.title).glow,
    accent: film.accent ?? deriveAccent(film.title).accent,
  };

  // Prefetch OMDB enrichment for the top 5 cards so data is ready before the user gets there.
  // Pass imdbId when available to skip the TMDB lookup on the server (fast path).
  useEffect(() => {
    if (stackIndex >= 5 || enriched !== null) return;
    const url = film.imdbId?.startsWith("tt")
      ? `/api/omdb/${film.tmdbId}?imdbId=${film.imdbId}`
      : `/api/omdb/${film.tmdbId}`;
    fetch(url)
      .then(r => r.json())
      .then(data => setEnriched(data))
      .catch(() => setEnriched({}));
  }, [stackIndex, film.tmdbId, film.imdbId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      e.preventDefault(); // stop iOS from scrolling while dragging
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
      const { x, y } = dragRef.current;
      const absX = Math.abs(x);
      const absY = Math.abs(y);
      if (absX > THRESHOLD && absX >= absY) {
        // Horizontal swipe — always works, collapses panel first
        setDetails(false);
        const dir = x > 0 ? "right" : "left";
        setExiting(dir);
        setTimeout(() => onSwipe(dir === "right" ? "like" : "pass", film), 430);
      } else if (!details && y > 50 && absY > absX) {
        // Swipe down (panel closed) — open panel
        setDetails(true);
        dragRef.current = { x: 0, y: 0 };
        setDragState({ x: 0, y: 0 });
      } else {
        dragRef.current = { x: 0, y: 0 };
        setDragState({ x: 0, y: 0 });
      }
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.addEventListener("touchmove", move, { passive: false });
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
  // Suppress horizontal motion when drag is primarily vertical
  const isVertical = Math.abs(sy) > Math.abs(sx) && Math.abs(sy) > 20;
  const rot    = isVertical ? 0 : sx / 20;
  const dispSx = isVertical ? 0 : sx;
  const likeOp = Math.max(0, Math.min(1,  dispSx / 90));
  const passOp = Math.max(0, Math.min(1, -dispSx / 90));
  const stackSc = 1 - stackIndex * 0.04;
  const stackTy = stackIndex * -16;

  let tf: string;
  if      (exiting === "right") tf = "translateX(135vw) rotate(22deg)";
  else if (exiting === "left")  tf = "translateX(-135vw) rotate(-22deg)";
  else if (!isTop)              tf = `scale(${stackSc}) translateY(${stackTy}px)`;
  else                          tf = `translateX(${dispSx}px) translateY(${isVertical ? sy * 0.15 : sy * 0.12}px) rotate(${rot}deg)`;

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
          touchAction: "none", // tell iOS not to scroll — must be set before touchstart fires
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
          {/* Badges row — festival wins + streaming providers */}
          {(enriched?.festivalWins?.length || enriched?.streamingProviders?.length) ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, flexWrap: "wrap" }}>
              {enriched?.festivalWins && enriched.festivalWins.length > 0 && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "rgba(201,169,97,0.10)",
                  border: "1px solid rgba(201,169,97,0.30)",
                  borderRadius: 2, padding: "2px 7px",
                }}>
                  <span style={{ fontSize: 9, color: "#C9A961" }}>★</span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: "#C9A961", letterSpacing: "0.12em", textTransform: "uppercase",
                  }}>
                    {enriched.festivalWins.slice(0, 2).join(" · ")}
                  </span>
                </div>
              )}
              {enriched?.streamingProviders?.slice(0, 3).map(p => (
                <div key={p.id} style={{
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  letterSpacing: "0.10em", textTransform: "uppercase",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 2, padding: "2px 7px",
                  color: "#888",
                  whiteSpace: "nowrap",
                }}>
                  {p.name}
                </div>
              ))}
            </div>
          ) : null}
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
            fontFamily: "var(--font-mono)", fontSize: 13,
            color: "#5A5550", letterSpacing: "0.05em",
          }}>
            {(enriched?.director ?? film.director) !== "Unknown" ? (enriched?.director ?? film.director) : ""}
          </div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: 3,
          }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 12,
              color: "#3a3a3a", letterSpacing: "0.06em",
            }}>
              {(enriched?.country ?? film.country) ? `${enriched?.country ?? film.country} · ` : ""}{film.year}
            </div>
            {isTop && onShortlist && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onClick={() => {
                  onShortlist(film);
                  if (!exiting) {
                    setExiting("right");
                    setTimeout(() => onSwipe("like", film), 430);
                  }
                }}
                style={{
                  background: "#C9A961",
                  border: "none",
                  borderRadius: 2,
                  padding: "5px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#0A0A0A",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                + Shortlist
              </button>
            )}
          </div>
        </div>

        {/* Detail panel — slides up */}
        <div
          style={{
            position: "absolute", left: 0, right: 0,
            top: details ? 0 : "100%",
            bottom: 0,
            backdropFilter: "blur(24px) brightness(0.7)",
            backgroundColor: "rgba(8,8,8,0.94)",
            transition: "top 0.38s cubic-bezier(0.25,0.46,0.45,0.94)",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Header: drag handle + LESS button */}
          <div style={{
            flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
            padding: "12px 22px 4px",
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "#2a2a2a" }} />
            <button
              onClick={() => setDetails(false)}
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: "absolute", right: 16,
                background: "transparent", border: "none",
                color: visual.accent, cursor: "pointer",
                fontFamily: "var(--font-mono)", fontSize: 10,
                letterSpacing: "0.18em", padding: "10px",
                opacity: 0.8,
              }}
            >▲ LESS</button>
          </div>

          {/* Scrollable content */}
          <div data-scroll style={{ flex: 1, overflowY: "auto", padding: "8px 22px 32px", touchAction: "pan-y" }}>

          {/* Film header — title, year, director */}
          <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #1a1a1a" }}>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: 20, color: "#F5F1EA",
              textTransform: "uppercase", letterSpacing: "0.01em",
              lineHeight: 1.05, marginBottom: 5,
            }}>
              {film.title}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: "#5A5550", letterSpacing: "0.08em",
            }}>
              {film.year}
              {(enriched?.director ?? film.director) && (enriched?.director ?? film.director) !== "Unknown"
                ? ` · ${enriched?.director ?? film.director}`
                : ""}
            </div>
          </div>

          <p style={{
            fontFamily: "var(--font-sans)", fontSize: 15,
            color: "#9A9590", lineHeight: 1.7, marginBottom: 16,
          }}>
            {film.plot}
          </p>

          {/* Action buttons — Trailer + Letterboxd */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {enriched?.trailerKey && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => setTrailerOpen(true)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#C9A961",
                  background: "rgba(201,169,97,0.08)",
                  border: "1px solid rgba(201,169,97,0.25)",
                  borderRadius: 2,
                  padding: "7px 14px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ▶ Trailer
              </button>
            )}
            <a
              href={`https://letterboxd.com/tmdb/${film.tmdbId}`}
              target="_blank"
              rel="noopener noreferrer"
              onMouseDown={e => e.stopPropagation()}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#5A5550",
                border: "1px solid #222",
                borderRadius: 2,
                padding: "7px 14px",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Letterboxd ↗
            </a>
          </div>

          {/* Ratings */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 24, marginBottom: 4 }}>
              {enriched?.imdbRating != null && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#3a3a3a", letterSpacing: "0.12em" }}>IMDb</div>
              )}
              {enriched?.rtScore != null && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#3a3a3a", letterSpacing: "0.12em" }}>Rotten Tomatoes</div>
              )}
              {enriched === null && isTop && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#2a2a2a", letterSpacing: "0.12em" }}>
                  Loading ratings…
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 24 }}>
              {enriched?.imdbRating != null && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, color: visual.accent }}>{enriched.imdbRating.toFixed(1)}</div>
              )}
              {enriched?.rtScore != null && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, color: visual.accent }}>{enriched.rtScore}%</div>
              )}
            </div>
          </div>

          {/* Festival awards — wins and nominations */}
          {(enriched?.festivalWins?.length || enriched?.festivalNoms?.length) ? (
            <div style={{ marginBottom: 18 }}>
              {enriched?.festivalWins && enriched.festivalWins.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#C9A961", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Won —{" "}
                  </span>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#C9A961" }}>
                    {enriched.festivalWins.join(", ")}
                  </span>
                </div>
              )}
              {enriched?.festivalNoms && enriched.festivalNoms.length > 0 && (
                <div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Nom. —{" "}
                  </span>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#6a6560" }}>
                    {enriched.festivalNoms.join(", ")}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {/* Meta */}
          <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              ["RUNTIME",  (enriched?.runtime ?? film.runtime) ? `${enriched?.runtime ?? film.runtime} min` : ""],
              ["LANGUAGE", enriched?.language ?? film.language ?? ""],
              ["COUNTRY",  enriched?.country  ?? film.country  ?? ""],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#3a3a3a", letterSpacing: "0.1em", marginBottom: 3 }}>{k}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#8A8580" }}>{v}</div>
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

          {/* Awards summary — show concise wins/noms count if no specific festivals parsed */}
          {!(enriched?.festivalWins?.length || enriched?.festivalNoms?.length) && (enriched?.awards ?? film.awards) && (
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#4a4a4a", lineHeight: 1.6 }}>
              {enriched?.awards ?? film.awards}
            </div>
          )}

          </div>{/* end scrollable content */}
        </div>{/* end detail panel */}

        {/* MORE button — only visible when panel is closed */}
        {isTop && !details && (
          <button
            onClick={() => setDetails(true)}
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: 120,
              left: "50%", transform: "translateX(-50%)",
              background: "transparent", border: "none",
              color: visual.accent,
              cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: 10,
              letterSpacing: "0.18em", padding: "10px 20px",
              zIndex: 15,
              opacity: 0.8,
            }}
          >
            ▼  MORE
          </button>
        )}

        {/* Trailer modal — fixed fullscreen, rotated to landscape */}
        {trailerOpen && enriched?.trailerKey && (
          <div
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onClick={() => setTrailerOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "#000",
              overflow: "hidden",
            }}
          >
            {/* Rotated container fills the screen in landscape */}
            <div
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "100vh",
                height: "100vw",
                transform: "translate(-50%, -50%) rotate(90deg)",
              }}
            >
              <iframe
                src={`https://www.youtube.com/embed/${enriched.trailerKey}?autoplay=1&rel=0&modestbranding=1`}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                style={{ width: "100%", height: "100%", border: "none" }}
              />
            </div>
            {/* Close button — bottom-right in portrait = top-right in landscape, rotated to match */}
            <button
              onClick={() => setTrailerOpen(false)}
              style={{
                position: "absolute",
                bottom: 16,
                right: 16,
                zIndex: 10000,
                background: "rgba(0,0,0,0.6)",
                border: "1px solid #444",
                borderRadius: 2,
                color: "#888",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "6px 14px",
                cursor: "pointer",
                transform: "rotate(90deg)",
                transformOrigin: "center center",
              }}
            >
              ✕ Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
