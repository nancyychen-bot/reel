"use client";

import { GENRES, SPECIAL, type Genre, type Special } from "@/lib/filters";

interface FilterPanelProps {
  open:            boolean;
  genres:          Set<Genre>;
  special:         Set<Special>;
  onToggleGenre:   (g: Genre) => void;
  onToggleSpecial: (s: Special) => void;
  onClear:         () => void;
  onClose:         () => void;
}

const SPECIAL_LABELS: Record<Special, string> = {
  Short:        "Short  (<100 min)",
  Epic:         "Epic  (150+ min)",
  Classic:      "Classic  (pre-1980)",
  Recent:       "Recent  (last 3 yrs)",
  "Art House":  "Art House",
};

export default function FilterPanel({
  open, genres, special, onToggleGenre, onToggleSpecial, onClear, onClose,
}: FilterPanelProps) {
  const totalActive = genres.size + special.size;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "rgba(0,0,0,0.55)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Bottom sheet */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: "calc(70px + env(safe-area-inset-bottom, 0px))" as string,
          zIndex: 101,
          background: "#0e0e0e",
          borderTop: "1px solid #1e1e1e",
          borderRadius: "10px 10px 0 0",
          padding: "16px 20px 32px",
          transform: open ? "translateY(0)" : "translateY(200%)",
          transition: "transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: 32, height: 3, borderRadius: 2,
          background: "#252525",
          margin: "0 auto 18px",
        }} />

        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 20,
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            letterSpacing: "0.18em", color: "#5A5550",
            textTransform: "uppercase",
          }}>
            Filters
          </div>
          <button
            onClick={onClear}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: 9,
              color: totalActive > 0 ? "#C9A961" : "#2a2a2a",
              letterSpacing: "0.12em", textTransform: "uppercase",
              padding: 0, transition: "color 0.15s",
            }}
          >
            Clear all
          </button>
        </div>

        {/* Special filters */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            color: "#2e2e2e", letterSpacing: "0.14em",
            textTransform: "uppercase", marginBottom: 10,
          }}>
            Type
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SPECIAL.map(s => {
              const on = special.has(s);
              return (
                <button
                  key={s}
                  onClick={() => onToggleSpecial(s)}
                  style={{
                    background: on ? "#1c1308" : "transparent",
                    border: `1px solid ${on ? "#C9A96155" : "#252525"}`,
                    borderRadius: 2,
                    padding: "6px 13px",
                    color: on ? "#C9A961" : "#3a3a3a",
                    fontFamily: "var(--font-sans)",
                    fontSize: 11,
                    cursor: "pointer",
                    letterSpacing: "0.03em",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                >
                  {SPECIAL_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Genre filters */}
        <div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9,
            color: "#2e2e2e", letterSpacing: "0.14em",
            textTransform: "uppercase", marginBottom: 10,
          }}>
            Genre
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {GENRES.map(g => {
              const on = genres.has(g);
              return (
                <button
                  key={g}
                  onClick={() => onToggleGenre(g)}
                  style={{
                    background: on ? "#1c1308" : "transparent",
                    border: `1px solid ${on ? "#C9A96155" : "#252525"}`,
                    borderRadius: 2,
                    padding: "6px 13px",
                    color: on ? "#C9A961" : "#3a3a3a",
                    fontFamily: "var(--font-sans)",
                    fontSize: 11,
                    cursor: "pointer",
                    letterSpacing: "0.03em",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
