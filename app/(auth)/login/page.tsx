"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const input: React.CSSProperties = {
  width: "100%",
  background: "#141414",
  border: "1px solid rgba(245,241,234,0.1)",
  color: "#F5F1EA",
  caretColor: "#F5F1EA",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  padding: "12px 14px",
  borderRadius: 2,
  marginBottom: 10,
  outline: "none",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [mode, setMode]       = useState<"signin" | "signup">(
    searchParams.get("signup") === "1" ? "signup" : "signin"
  );
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) { setError(error.message); return; }
      router.push(next || "/swipe");
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) { setError(error.message); return; }
      // If coming from a room invite, skip onboarding and go straight to the room.
      // They can set up their profile later via account settings.
      if (next.startsWith("/room/")) {
        router.push(next);
      } else {
        router.push("/onboarding");
      }
    }
  }

  return (
    <>
      {/* Tab toggle */}
      <div style={{ display: "flex", marginBottom: 28, gap: 0 }}>
        {(["signin", "signup"] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(""); }}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${mode === m ? "#F5F1EA" : "rgba(245,241,234,0.08)"}`,
              color: mode === m ? "#F5F1EA" : "#5A5550",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              padding: "0 0 10px",
              cursor: "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          required
          style={input}
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          required
          minLength={6}
          style={{ ...input, marginBottom: error ? 8 : 16 }}
        />

        {error && (
          <p style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            color: "#E8453C",
            marginBottom: 12,
            lineHeight: 1.5,
          }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
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
            cursor: loading ? "not-allowed" : "pointer",
            borderRadius: 2,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#0A0A0A",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
    }}>
      {/* Wordmark */}
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 64,
          color: "#F5F1EA",
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          lineHeight: 1,
        }}>
          Reel
        </div>
        <div style={{ width: 20, height: 1.5, background: "#E8453C", margin: "10px auto 0" }} />
      </div>

      <div style={{
        width: "100%",
        maxWidth: 340,
        border: "1px solid rgba(245,241,234,0.08)",
        padding: "36px 28px",
        borderRadius: 3,
      }}>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
