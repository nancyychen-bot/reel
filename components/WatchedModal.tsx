"use client";

import { useState } from "react";

export interface WatchedModalFilm {
  id:       string;   // imdb_id
  tmdbId?:  number;
  title:    string;
  year:     number;
  posterUrl: string;
}

interface WatchedModalProps {
  film:    WatchedModalFilm | null;
  onClose: () => void;
  onSubmit: (film: WatchedModalFilm, rating: number, review: string) => Promise<void>;
}

export default function WatchedModal({ film, onClose, onSubmit }: WatchedModalProps) {
  const [rating, setRating]   = useState(0);
  const [hovered, setHovered] = useState(0);
  const [review, setReview]   = useState("");
  const [saving, setSaving]   = useState(false);

  if (!film) return null;

  async function handleSubmit() {
    if (!rating) return;
    setSaving(true);
    await onSubmit(film!, rating, review);
    setSaving(false);
    setRating(0);
    setReview("");
    onClose();
  }

  function handleClose() {
    setRating(0);
    setReview("");
    onClose();
  }

  const active = hovered || rating;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(6px)",
        }}
      />

      {/* Sheet */}
      <div style={{
        position: "fixed",
        left: 0, right: 0, bottom: 0,
        zIndex: 301,
        background: "#0e0e0e",
        borderTop: "1px solid #1e1e1e",
        borderRadius: "12px 12px 0 0",
        padding: "24px 24px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}>
        {/* Drag handle */}
        <div style={{ width: 32, height: 3, borderRadius: 2, background: "#252525", margin: "0 auto" }} />

        {/* Film row */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {film.posterUrl && (
            <img
              src={film.posterUrl} alt={film.title}
              style={{ width: 52, height: 78, objectFit: "cover", borderRadius: 2, flexShrink: 0 }}
            />
          )}
          <div>
            <div style={{
              fontFamily: "var(--font-serif)", fontSize: 18,
              fontStyle: "italic", color: "#F5F1EA", lineHeight: 1.2, marginBottom: 4,
            }}>
              {film.title}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#5A5550" }}>
              {film.year}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: "#3a3a3a",
              letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 6,
            }}>
              Mark as watched
            </div>
          </div>
        </div>

        {/* Star rating */}
        <div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "#3a3a3a",
            letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10,
          }}>
            Your rating
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                style={{
                  background: "none", border: "none", padding: 0,
                  cursor: "pointer", fontSize: 30,
                  color: star <= active ? "#C9A961" : "#252525",
                  transition: "color 0.1s",
                  lineHeight: 1,
                }}
              >
                ★
              </button>
            ))}
          </div>
          {rating > 0 && (
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550",
              letterSpacing: "0.08em", marginTop: 6,
            }}>
              {["", "Poor", "Fair", "Good", "Great", "Excellent"][rating]}
            </div>
          )}
        </div>

        {/* Review */}
        <div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "#3a3a3a",
            letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10,
          }}>
            Review <span style={{ color: "#2a2a2a" }}>(optional)</span>
          </div>
          <textarea
            value={review}
            onChange={e => setReview(e.target.value)}
            placeholder="What did you think?"
            rows={3}
            style={{
              width: "100%",
              background: "#141414",
              border: "1px solid rgba(245,241,234,0.08)",
              borderRadius: 2,
              color: "#F5F1EA",
              caretColor: "#F5F1EA",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              lineHeight: 1.6,
              padding: "10px 12px",
              outline: "none",
              resize: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!rating || saving}
          style={{
            width: "100%",
            background: rating ? "#F5F1EA" : "#141414",
            border: `1px solid ${rating ? "#F5F1EA" : "rgba(245,241,234,0.08)"}`,
            color: rating ? "#0A0A0A" : "#3a3a3a",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            padding: "14px",
            borderRadius: 2,
            cursor: rating && !saving ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Add to Watched"}
        </button>
      </div>
    </>
  );
}
