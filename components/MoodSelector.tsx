"use client";

import { MOODS, type Mood } from "@/lib/moods";

interface MoodSelectorProps {
  selected:  Set<Mood>;
  onToggle:  (mood: Mood) => void;
}

export default function MoodSelector({ selected, onToggle }: MoodSelectorProps) {
  return (
    <div style={{
      width: "100%",
      overflowX: "auto",
      paddingBottom: 1,
      // Hide scrollbar
      scrollbarWidth: "none",
      msOverflowStyle: "none",
    }}>
      <div style={{
        display: "flex",
        gap: 6,
        padding: "0 24px",
        // Ensure chips don't wrap
        width: "max-content",
      }}>
        {MOODS.map(mood => {
          const active = selected.has(mood);
          return (
            <button
              key={mood}
              onClick={() => onToggle(mood)}
              style={{
                background: active ? "rgba(201,169,97,0.12)" : "transparent",
                border: `1px solid ${active ? "#C9A961" : "rgba(245,241,234,0.10)"}`,
                color: active ? "#C9A961" : "#5A5550",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "5px 10px",
                cursor: "pointer",
                borderRadius: 2,
                whiteSpace: "nowrap",
                transition: "border-color 0.15s, color 0.15s, background 0.15s",
              }}
            >
              {mood}
            </button>
          );
        })}
      </div>
    </div>
  );
}
