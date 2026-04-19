"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Fantasy", "History", "Horror",
  "Music", "Mystery", "Romance", "Science Fiction", "Thriller",
  "War", "Western", "Foreign", "Classic", "Experimental",
];

interface TMDBResult {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<"username" | "films" | "genres">("username");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TMDBResult[]>([]);
  const [selected, setSelected] = useState<TMDBResult[]>([]);
  const [genres, setGenres] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  async function checkUsername(e: React.FormEvent) {
    e.preventDefault();
    setUsernameError("");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      setUsernameError("3–20 chars, lowercase letters, numbers, underscores only.");
      return;
    }
    const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
    if (data) { setUsernameError("Username taken."); return; }
    setStep("films");
  }

  async function searchFilms(q: string) {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data.results ?? []);
  }

  function toggleFilm(film: TMDBResult) {
    setSelected(prev => {
      const exists = prev.find(f => f.id === film.id);
      if (exists) return prev.filter(f => f.id !== film.id);
      if (prev.length >= 5) return prev;
      return [...prev, film];
    });
  }

  function toggleGenre(g: string) {
    setGenres(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  async function finish() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("profiles").upsert({
      id: user.id,
      username,
      display_name: username,
    });

    await supabase.from("user_preferences").upsert({
      user_id: user.id,
      favorite_film_tmdb_ids: selected.map(f => f.id),
      preferred_genres: Array.from(genres),
    });

    router.push("/swipe");
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "#0A0A0A",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
    }}>
      {/* Wordmark */}
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <div style={{ display: "inline-block", transform: "scaleX(0.62)", transformOrigin: "center" }}>
          <span style={{
            fontFamily: "var(--font-serif)",
            fontSize: 56,
            fontWeight: 900,
            color: "#F5F1EA",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>Reel</span>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: "flex", gap: 6, marginBottom: 36 }}>
        {["username", "films", "genres"].map((s, i) => (
          <div key={s} style={{
            width: 24,
            height: 2,
            background: step === s ? "#8B2A2A" : "rgba(245,241,234,0.12)",
            borderRadius: 1,
            transition: "background 0.3s",
          }} />
        ))}
      </div>

      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Step 1: Username */}
        {step === "username" && (
          <form onSubmit={checkUsername}>
            <h1 style={{
              fontFamily: "var(--font-serif)",
              fontSize: 32,
              fontStyle: "italic",
              fontWeight: 700,
              color: "#F5F1EA",
              marginBottom: 8,
            }}>
              Choose a username
            </h1>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#5A5550", marginBottom: 28 }}>
              Friends will find you by this name.
            </p>
            <input
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase())}
              placeholder="yourname"
              style={{
                width: "100%",
                background: "#141414",
                border: "1px solid rgba(245,241,234,0.1)",
                color: "#F5F1EA",
                fontFamily: "var(--font-mono)",
                fontSize: 16,
                padding: "14px 16px",
                borderRadius: 2,
                outline: "none",
                marginBottom: 8,
                letterSpacing: "0.04em",
              }}
            />
            {usernameError && (
              <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#8B2A2A", marginBottom: 12 }}>
                {usernameError}
              </p>
            )}
            <button
              type="submit"
              style={{
                width: "100%",
                background: "#8B2A2A",
                border: "none",
                color: "#F5F1EA",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "14px",
                cursor: "pointer",
                borderRadius: 2,
                marginTop: 8,
              }}
            >
              Continue →
            </button>
          </form>
        )}

        {/* Step 2: 5 seed films */}
        {step === "films" && (
          <div>
            <h1 style={{
              fontFamily: "var(--font-serif)",
              fontSize: 32,
              fontStyle: "italic",
              fontWeight: 700,
              color: "#F5F1EA",
              marginBottom: 8,
            }}>
              Pick 5 films you love
            </h1>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#5A5550", marginBottom: 24 }}>
              We'll use these to calibrate your feed.
            </p>

            {/* Selected */}
            {selected.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                {selected.map(f => (
                  <button
                    key={f.id}
                    onClick={() => toggleFilm(f)}
                    style={{
                      background: "rgba(139,42,42,0.15)",
                      border: "1px solid rgba(139,42,42,0.4)",
                      color: "#F5F1EA",
                      fontFamily: "var(--font-sans)",
                      fontSize: 11,
                      padding: "5px 10px",
                      borderRadius: 2,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {f.title} <span style={{ color: "#8B2A2A" }}>×</span>
                  </button>
                ))}
              </div>
            )}

            <input
              value={query}
              onChange={e => searchFilms(e.target.value)}
              placeholder="Search any film…"
              style={{
                width: "100%",
                background: "#141414",
                border: "1px solid rgba(245,241,234,0.1)",
                color: "#F5F1EA",
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                padding: "12px 14px",
                borderRadius: 2,
                outline: "none",
                marginBottom: 12,
              }}
            />

            {results.length > 0 && (
              <div style={{
                border: "1px solid rgba(245,241,234,0.08)",
                borderRadius: 2,
                overflow: "hidden",
                marginBottom: 24,
                maxHeight: 280,
                overflowY: "auto",
              }}>
                {results.slice(0, 8).map(film => {
                  const isSelected = selected.some(f => f.id === film.id);
                  return (
                    <button
                      key={film.id}
                      onClick={() => toggleFilm(film)}
                      style={{
                        width: "100%",
                        background: isSelected ? "rgba(139,42,42,0.12)" : "transparent",
                        border: "none",
                        borderBottom: "1px solid rgba(245,241,234,0.06)",
                        color: "#F5F1EA",
                        fontFamily: "var(--font-sans)",
                        fontSize: 13,
                        padding: "12px 14px",
                        cursor: selected.length >= 5 && !isSelected ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        textAlign: "left",
                        opacity: selected.length >= 5 && !isSelected ? 0.4 : 1,
                      }}
                    >
                      {film.poster_path && (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${film.poster_path}`}
                          alt=""
                          style={{ width: 32, height: 48, objectFit: "cover", borderRadius: 1, flexShrink: 0 }}
                        />
                      )}
                      <div>
                        <div style={{ fontWeight: 500 }}>{film.title}</div>
                        <div style={{ color: "#5A5550", fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                          {film.release_date?.slice(0, 4) ?? "—"}
                        </div>
                      </div>
                      {isSelected && (
                        <span style={{ marginLeft: "auto", color: "#8B2A2A", fontSize: 16 }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setStep("genres")}
              disabled={selected.length < 3}
              style={{
                width: "100%",
                background: selected.length >= 3 ? "#8B2A2A" : "transparent",
                border: "1px solid rgba(245,241,234,0.1)",
                color: selected.length >= 3 ? "#F5F1EA" : "#5A5550",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "14px",
                cursor: selected.length >= 3 ? "pointer" : "not-allowed",
                borderRadius: 2,
              }}
            >
              {selected.length >= 3 ? `Continue with ${selected.length} films →` : `Pick at least 3 films (${selected.length}/5)`}
            </button>
          </div>
        )}

        {/* Step 3: Genres */}
        {step === "genres" && (
          <div>
            <h1 style={{
              fontFamily: "var(--font-serif)",
              fontSize: 32,
              fontStyle: "italic",
              fontWeight: 700,
              color: "#F5F1EA",
              marginBottom: 8,
            }}>
              What genres do you love?
            </h1>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#5A5550", marginBottom: 24 }}>
              Pick as many as you like.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 }}>
              {GENRES.map(g => {
                const active = genres.has(g);
                return (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    style={{
                      background: "transparent",
                      border: `1.5px solid ${active ? "#8B2A2A" : "rgba(245,241,234,0.1)"}`,
                      color: active ? "#F5F1EA" : "#8A8580",
                      fontFamily: "var(--font-sans)",
                      fontSize: 12,
                      padding: "7px 14px",
                      cursor: "pointer",
                      borderRadius: 2,
                      transition: "all 0.15s",
                    }}
                  >
                    {g}
                  </button>
                );
              })}
            </div>

            <button
              onClick={finish}
              disabled={saving}
              style={{
                width: "100%",
                background: "#8B2A2A",
                border: "none",
                color: "#F5F1EA",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "14px",
                cursor: saving ? "not-allowed" : "pointer",
                borderRadius: 2,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Setting up your feed…" : "Start watching →"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
