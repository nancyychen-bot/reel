"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Fantasy", "History", "Horror",
  "Music", "Mystery", "Romance", "Science Fiction", "Thriller",
  "War", "Western", "Foreign", "Classic", "Experimental",
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#141414",
  border: "1px solid rgba(245,241,234,0.1)",
  color: "#F5F1EA",
  caretColor: "#F5F1EA",
  fontFamily: "var(--font-mono)",
  fontSize: 16,
  padding: "14px 16px",
  borderRadius: 2,
  outline: "none",
  letterSpacing: "0.04em",
};

interface TopFilm {
  id:          number;
  title:       string;
  year:        string;
  poster_path: string;
  rating:      number;
}

const MIN_PICKS = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep]               = useState<"username" | "films" | "genres">("username");
  const [username, setUsername]       = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [topFilms, setTopFilms]       = useState<TopFilm[]>([]);
  const [filmsLoading, setFilmsLoading] = useState(false);
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [genres, setGenres]           = useState<Set<string>>(new Set());
  const [saving, setSaving]           = useState(false);

  const supabase = createClient();

  // Pre-load top films in background as soon as page mounts
  useEffect(() => {
    setFilmsLoading(true);
    fetch("/api/films/top")
      .then(r => r.json())
      .then(d => { setTopFilms(d.films ?? []); setFilmsLoading(false); })
      .catch(() => setFilmsLoading(false));
  }, []);

  async function checkUsername(e: React.FormEvent) {
    e.preventDefault();
    setUsernameError("");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      setUsernameError("3–20 chars, lowercase letters, numbers, underscores only.");
      return;
    }
    const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
    if (data) { setUsernameError("That username is taken."); return; }
    setStep("films");
  }

  function toggleFilm(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
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
      favorite_film_tmdb_ids: Array.from(selected),
      preferred_genres: Array.from(genres),
    });

    router.push("/swipe");
  }

  // ── Shared header ───────────────────────────────────────────
  const steps = ["username", "films", "genres"];
  const stepIndex = steps.indexOf(step);

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#0A0A0A",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px 16px",
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          color: "#F5F1EA",
          textTransform: "uppercase",
          letterSpacing: "0.01em",
        }}>
          Reel
        </div>

        {/* Step dots */}
        <div style={{ display: "flex", gap: 6 }}>
          {steps.map((s, i) => (
            <div key={s} style={{
              width: i === stepIndex ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: i === stepIndex ? "#E8453C" : i < stepIndex ? "rgba(245,241,234,0.3)" : "rgba(245,241,234,0.1)",
              transition: "width 0.3s, background 0.3s",
            }} />
          ))}
        </div>
      </div>

      {/* ── Step 1: Username ───────────────────────────────── */}
      {step === "username" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 24px 48px",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.2em",
            color: "#E8453C",
            textTransform: "uppercase",
            marginBottom: 12,
          }}>
            Step 1 of 3
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: 40,
            color: "#F5F1EA",
            textTransform: "uppercase",
            letterSpacing: "0.01em",
            lineHeight: 1,
            marginBottom: 8,
          }}>
            Pick a username
          </h1>
          <p style={{
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            color: "#5A5550",
            marginBottom: 32,
            lineHeight: 1.6,
          }}>
            Friends will find you by this name.
          </p>

          <form onSubmit={checkUsername}>
            <input
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="yourname"
              autoFocus
              style={inputStyle}
            />
            {usernameError && (
              <p style={{
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                color: "#E8453C",
                margin: "8px 0 0",
                lineHeight: 1.5,
              }}>
                {usernameError}
              </p>
            )}
            <button
              type="submit"
              style={{
                width: "100%",
                background: "#E8453C",
                border: "none",
                color: "#fff",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "14px",
                cursor: "pointer",
                borderRadius: 2,
                marginTop: 16,
              }}
            >
              Continue
            </button>
          </form>
        </div>
      )}

      {/* ── Step 2: Film grid ──────────────────────────────── */}
      {step === "films" && (
        <>
          {/* Fixed header */}
          <div style={{ padding: "0 24px 16px", flexShrink: 0 }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "#E8453C",
              textTransform: "uppercase",
              marginBottom: 8,
            }}>
              Step 2 of 3
            </div>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: 36,
              color: "#F5F1EA",
              textTransform: "uppercase",
              letterSpacing: "0.01em",
              lineHeight: 1,
              marginBottom: 4,
            }}>
              Films you love
            </h1>
            <p style={{
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              color: "#5A5550",
              lineHeight: 1.5,
            }}>
              Tap to pick at least {MIN_PICKS}. We'll calibrate your feed.
            </p>
          </div>

          {/* Scrollable poster grid */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 12px",
          }}>
            {filmsLoading ? (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "#3a3a3a",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}>
                Loading…
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 6,
                paddingBottom: 100,
              }}>
                {topFilms.map(film => {
                  const picked = selected.has(film.id);
                  return (
                    <button
                      key={film.id}
                      onClick={() => toggleFilm(film.id)}
                      style={{
                        position: "relative",
                        aspectRatio: "2/3",
                        borderRadius: 3,
                        overflow: "hidden",
                        border: picked ? "2px solid #E8453C" : "2px solid transparent",
                        cursor: "pointer",
                        background: "#141414",
                        padding: 0,
                        transition: "border-color 0.15s",
                      }}
                    >
                      <img
                        src={`https://image.tmdb.org/t/p/w185${film.poster_path}`}
                        alt={film.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        loading="lazy"
                      />
                      {/* Overlay when selected */}
                      {picked && (
                        <div style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(232,69,60,0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "#E8453C",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            color: "#fff",
                          }}>
                            ✓
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sticky footer CTA */}
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "12px 24px 28px",
            background: "linear-gradient(to top, #0A0A0A 70%, transparent)",
          }}>
            <button
              onClick={() => setStep("genres")}
              disabled={selected.size < MIN_PICKS}
              style={{
                width: "100%",
                background: selected.size >= MIN_PICKS ? "#E8453C" : "#141414",
                border: `1px solid ${selected.size >= MIN_PICKS ? "#E8453C" : "rgba(245,241,234,0.1)"}`,
                color: selected.size >= MIN_PICKS ? "#fff" : "#3a3a3a",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "14px",
                cursor: selected.size >= MIN_PICKS ? "pointer" : "not-allowed",
                borderRadius: 2,
                transition: "background 0.2s, color 0.2s",
              }}
            >
              {selected.size >= MIN_PICKS
                ? `Continue — ${selected.size} film${selected.size !== 1 ? "s" : ""} selected`
                : `Pick at least ${MIN_PICKS} (${selected.size} so far)`}
            </button>
          </div>
        </>
      )}

      {/* ── Step 3: Genres ─────────────────────────────────── */}
      {step === "genres" && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{ padding: "0 24px 20px", flexShrink: 0 }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "#E8453C",
              textTransform: "uppercase",
              marginBottom: 8,
            }}>
              Step 3 of 3
            </div>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: 36,
              color: "#F5F1EA",
              textTransform: "uppercase",
              letterSpacing: "0.01em",
              lineHeight: 1,
              marginBottom: 4,
            }}>
              Your genres
            </h1>
            <p style={{
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              color: "#5A5550",
            }}>
              Pick as many as you like.
            </p>
          </div>

          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 24px",
          }}>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              paddingBottom: 100,
            }}>
              {GENRES.map(g => {
                const active = genres.has(g);
                return (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    style={{
                      background: active ? "rgba(232,69,60,0.12)" : "transparent",
                      border: `1.5px solid ${active ? "#E8453C" : "rgba(245,241,234,0.1)"}`,
                      color: active ? "#F5F1EA" : "#8A8580",
                      fontFamily: "var(--font-sans)",
                      fontSize: 13,
                      padding: "9px 16px",
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
          </div>

          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "12px 24px 28px",
            background: "linear-gradient(to top, #0A0A0A 70%, transparent)",
          }}>
            <button
              onClick={finish}
              disabled={saving}
              style={{
                width: "100%",
                background: "#E8453C",
                border: "none",
                color: "#fff",
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
              {saving ? "Setting up your feed…" : "Start swiping"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
