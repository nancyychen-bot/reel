"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/swipe` },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
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
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div style={{ display: "inline-block", transform: "scaleX(0.62)", transformOrigin: "center" }}>
          <span style={{
            fontFamily: "var(--font-serif)",
            fontSize: 72,
            fontWeight: 900,
            color: "#F5F1EA",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>Reel</span>
        </div>
        <div style={{ width: 20, height: 1.5, background: "#8B2A2A", margin: "10px auto 0" }} />
      </div>

      <div style={{
        width: "100%",
        maxWidth: 360,
        border: "1px solid rgba(245,241,234,0.08)",
        padding: "40px 32px",
        borderRadius: 2,
      }}>
        {sent ? (
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontFamily: "var(--font-serif)",
              fontSize: 28,
              fontStyle: "italic",
              color: "#F5F1EA",
              marginBottom: 12,
            }}>
              Check your inbox.
            </div>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#8A8580", lineHeight: 1.7 }}>
              We sent a magic link to <strong style={{ color: "#F5F1EA" }}>{email}</strong>.
              Click it to sign in — no password needed.
            </p>
          </div>
        ) : (
          <>
            <h1 style={{
              fontFamily: "var(--font-serif)",
              fontSize: 28,
              fontStyle: "italic",
              fontWeight: 700,
              color: "#F5F1EA",
              marginBottom: 8,
            }}>
              Sign in
            </h1>
            <p style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "#5A5550",
              marginBottom: 32,
            }}>
              No password. We'll email you a magic link.
            </p>

            {/* Email */}
            <form onSubmit={handleMagicLink}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={{
                  width: "100%",
                  background: "#141414",
                  border: "1px solid rgba(245,241,234,0.1)",
                  color: "#F5F1EA",
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  padding: "12px 14px",
                  borderRadius: 2,
                  marginBottom: 12,
                  outline: "none",
                }}
              />
              {error && (
                <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#8B2A2A", marginBottom: 10 }}>
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
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
                  cursor: loading ? "not-allowed" : "pointer",
                  borderRadius: 2,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Sending…" : "Send magic link"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
