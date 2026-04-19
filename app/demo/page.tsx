"use client";

import { useRef } from "react";
import SwipeCard, { FilmData } from "@/components/SwipeCard";

const DEMO_FILM: FilmData = {
  tmdbId: 843,
  title: "In the Mood for Love",
  year: 2000,
  director: "Wong Kar-wai",
  runtime: 98,
  genres: ["Drama", "Romance"],
  plot:
    "Two neighbors in 1962 Hong Kong form a bond after each suspects the other's spouse of adultery. A slow, aching portrait of repressed longing and missed connection.",
  tmdbRating: 8.1,
  country: "Hong Kong",
  language: "Cantonese",
  posterUrl:
    "https://image.tmdb.org/t/p/w500/7IMfNKSdYULDpJ9gADVMBMNxWcS.jpg",
};

export default function DemoPage() {
  const triggerRef = useRef<((dir: "like" | "pass") => void) | null>(null);
  const triggerDetailsRef = useRef<(() => void) | null>(null);

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#0A0A0A",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ paddingTop: 32, paddingBottom: 20, textAlign: "center" }}>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 48,
          color: "#F5F1EA",
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          lineHeight: 1,
        }}>
          Reel
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.22em",
          color: "#3a3a3a",
          textTransform: "uppercase",
          marginTop: 8,
        }}>
          Preview
        </div>
      </div>

      {/* Card */}
      <div style={{ position: "relative", width: "100%", flex: 1 }}>
        <SwipeCard
          film={DEMO_FILM}
          isTop={true}
          stackIndex={0}
          onSwipe={() => {}}
          triggerRef={triggerRef}
          triggerDetailsRef={triggerDetailsRef}
        />
      </div>

      {/* Button row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: "20px 0 32px",
        flexShrink: 0,
      }}>
        <button
          onClick={() => triggerRef.current?.("pass")}
          style={btnStyle("#6a6560", "#141414", "#282828")}
        >✕</button>
        <button
          onClick={() => triggerDetailsRef.current?.()}
          style={{ ...btnStyle("#4a4545", "#141414", "#282828"), width: 44, height: 44, fontSize: 14 }}
        >↓</button>
        <button
          onClick={() => triggerRef.current?.("like")}
          style={btnStyle("#C9A961", "#141414", "#282828")}
        >♥</button>
      </div>
    </div>
  );
}

function btnStyle(color: string, bg: string, border: string): React.CSSProperties {
  return {
    width: 54, height: 54,
    borderRadius: "50%",
    background: bg,
    border: `1px solid ${border}`,
    color,
    fontSize: 20,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
