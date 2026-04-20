"use client";

import { useEffect, useState } from "react";

export interface ModalFilm {
  tmdbId?:     number;
  imdbId?:     string;
  title:       string;
  year:        number;
  director?:   string;
  runtime?:    number;
  genres?:     string[];
  plot?:       string;
  tmdbRating?: number;
  posterUrl:   string;
}

interface Enriched {
  imdbRating?:   number;
  rtScore?:      number;
  awards?:       string;
  festivalWins?: string[];
  festivalNoms?: string[];
  director?:     string;
  runtime?:      number;
  language?:     string;
  country?:      string;
}

const ACCENT = "#C9A961";

export default function FilmModal({ film, onClose }: { film: ModalFilm | null; onClose: () => void }) {
  const [enriched, setEnriched] = useState<Enriched | null>(null);

  useEffect(() => {
    if (!film) { setEnriched(null); return; }
    setEnriched(null);
    if (!film.tmdbId) return;
    const url = film.imdbId?.startsWith("tt")
      ? `/api/omdb/${film.tmdbId}?imdbId=${film.imdbId}`
      : `/api/omdb/${film.tmdbId}`;
    fetch(url)
      .then(r => r.json())
      .then(data => setEnriched(data))
      .catch(() => setEnriched({}));
  }, [film?.tmdbId, film?.imdbId]);

  if (!film) return null;

  const director  = enriched?.director ?? film.director ?? "";
  const runtime   = enriched?.runtime  ?? film.runtime  ?? 0;
  const country   = enriched?.country  ?? "";
  const language  = enriched?.language ?? "";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.72)",
          zIndex: 200,
        }}
      />

      {/* Sheet */}
      <div style={{
        position: "fixed",
        left: 0, right: 0,
        bottom: "calc(70px + env(safe-area-inset-bottom, 0px))" as string,
        maxHeight: "82vh",
        zIndex: 201,
        background: "#0e0e0e",
        borderTop: "1px solid #1e1e1e",
        borderRadius: "12px 12px 0 0",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Drag handle */}
        <div style={{
          width: 32, height: 3, borderRadius: 2,
          background: "#252525",
          margin: "14px auto 0",
          flexShrink: 0,
        }} />

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 12, right: 16,
            background: "none", border: "none",
            color: "#5A5550", fontSize: 20, cursor: "pointer", lineHeight: 1,
          }}
        >
          ×
        </button>

        {/* Scrollable content */}
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px 32px" }}>

          {/* Top: poster + title block side by side */}
          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            {/* Poster */}
            <div style={{
              flexShrink: 0,
              width: 90,
              aspectRatio: "2/3",
              background: "#141414",
              border: "1px solid rgba(245,241,234,0.07)",
              borderRadius: 3,
              overflow: "hidden",
            }}>
              {film.posterUrl && (
                <img src={film.posterUrl} alt={film.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </div>

            {/* Title block */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                color: "#F5F1EA",
                textTransform: "uppercase",
                letterSpacing: "0.01em",
                lineHeight: 1.0,
                marginBottom: 6,
              }}>
                {film.title}
              </div>
              {director && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#5A5550", letterSpacing: "0.05em", marginBottom: 4 }}>
                  {director}
                </div>
              )}
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#3A3A3A", letterSpacing: "0.06em" }}>
                {[country, film.year].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>

          {/* Ratings */}
          {(enriched?.imdbRating != null || enriched?.rtScore != null) && (
            <div style={{ display: "flex", gap: 24, marginBottom: 18, flexWrap: "wrap" }}>
              {enriched?.imdbRating != null && (
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3a3a3a", letterSpacing: "0.12em", marginBottom: 3 }}>IMDb</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, color: ACCENT }}>{enriched.imdbRating.toFixed(1)}</div>
                </div>
              )}
              {enriched?.rtScore != null && (
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3a3a3a", letterSpacing: "0.12em", marginBottom: 3 }}>Rotten Tomatoes</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, color: ACCENT }}>{enriched.rtScore}%</div>
                </div>
              )}
            </div>
          )}
          {enriched === null && film.tmdbId && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#2a2a2a", letterSpacing: "0.12em", marginBottom: 18 }}>
              Loading ratings…
            </div>
          )}

          {/* Plot */}
          {film.plot && (
            <p style={{
              fontFamily: "var(--font-sans)", fontSize: 14,
              color: "#7A7570", lineHeight: 1.7, marginBottom: 18,
            }}>
              {film.plot}
            </p>
          )}

          {/* Festival awards */}
          {(enriched?.festivalWins?.length || enriched?.festivalNoms?.length) ? (
            <div style={{ marginBottom: 18 }}>
              {enriched?.festivalWins && enriched.festivalWins.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: ACCENT, letterSpacing: "0.12em", textTransform: "uppercase" }}>Won — </span>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: ACCENT }}>{enriched.festivalWins.join(", ")}</span>
                </div>
              )}
              {enriched?.festivalNoms && enriched.festivalNoms.length > 0 && (
                <div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550", letterSpacing: "0.12em", textTransform: "uppercase" }}>Nom. — </span>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#6a6560" }}>{enriched.festivalNoms.join(", ")}</span>
                </div>
              )}
            </div>
          ) : null}

          {/* Awards fallback */}
          {!(enriched?.festivalWins?.length || enriched?.festivalNoms?.length) && enriched?.awards && (
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#4a4a4a", lineHeight: 1.6, marginBottom: 18 }}>
              {enriched.awards}
            </div>
          )}

          {/* Meta row */}
          <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              ["RUNTIME",  runtime ? `${runtime} min` : ""],
              ["LANGUAGE", language],
              ["COUNTRY",  country],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3a3a3a", letterSpacing: "0.1em", marginBottom: 3 }}>{k}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#8A8580" }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Genre chips */}
          {(film.genres?.length ?? 0) > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
              {film.genres!.map(g => (
                <span key={g} style={{
                  fontFamily: "var(--font-sans)", fontSize: 10, color: "#4a4a4a",
                  border: "1px solid #1e1e1e", borderRadius: 2, padding: "3px 10px",
                  letterSpacing: "0.05em", textTransform: "uppercase",
                }}>{g}</span>
              ))}
            </div>
          )}

          {/* Learn More */}
          <a
            href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(film.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#5A5550",
              border: "1px solid #222",
              borderRadius: 2,
              padding: "7px 14px",
              textDecoration: "none",
            }}
          >
            Learn More ↗
          </a>
        </div>
      </div>
    </>
  );
}
