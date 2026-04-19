"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RoomsPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  async function createRoom() {
    setCreating(true);
    setError("");
    const res = await fetch("/api/rooms/create", { method: "POST" });
    if (!res.ok) { setError("Failed to create room."); setCreating(false); return; }
    const { code } = await res.json();
    setCreatedCode(code);
    setCreating(false);
  }

  async function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    const { data } = await supabase.from("rooms").select("id, status").eq("code", code).maybeSingle();
    if (!data) { setError("Room not found."); return; }
    if (data.status === "ended") { setError("This room has ended."); return; }
    router.push(`/room/${code}`);
  }

  function copyLink(code: string) {
    navigator.clipboard.writeText(`${location.origin}/room/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // — Room created state —
  if (createdCode) {
    return (
      <div style={{
        position: "absolute", inset: 0,
        background: "#0A0A0A",
        display: "flex", flexDirection: "column",
        paddingBottom: 70,
      }}>
        <header style={{ padding: "24px 24px 20px", borderBottom: "1px solid rgba(245,241,234,0.06)" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550", letterSpacing: "0.12em", marginBottom: 4 }}>
            Room created
          </p>
          <h1 style={{
            fontFamily: "var(--font-mono)",
            fontSize: 36,
            color: "#F5F1EA",
            letterSpacing: "0.12em",
          }}>
            {createdCode}
          </h1>
        </header>

        <div style={{ padding: "36px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "#5A5550", lineHeight: 1.7 }}>
            Share this code or link with a friend. Once they join, you'll both swipe the same deck at the same time.
          </p>

          {/* Share link button */}
          <button
            onClick={() => copyLink(createdCode)}
            style={{
              background: "transparent",
              border: `1px solid ${copied ? "#C9A96155" : "rgba(245,241,234,0.12)"}`,
              color: copied ? "#C9A961" : "#8A8580",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "14px",
              cursor: "pointer",
              borderRadius: 2,
              transition: "all 0.2s ease",
            }}
          >
            {copied ? "Link copied!" : `Copy link  ·  /room/${createdCode}`}
          </button>

          {/* Enter room button */}
          <button
            onClick={() => router.push(`/room/${createdCode}`)}
            style={{
              background: "#8B2A2A",
              border: "none",
              color: "#F5F1EA",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              padding: "18px",
              cursor: "pointer",
              borderRadius: 2,
              marginTop: 8,
            }}
          >
            Enter room →
          </button>
        </div>
      </div>
    );
  }

  // — Default state —
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "#0A0A0A",
      overflowY: "auto",
      paddingBottom: 70,
    }}>
      <header style={{ padding: "24px 24px 20px", borderBottom: "1px solid rgba(245,241,234,0.06)" }}>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 36,
          fontStyle: "italic",
          fontWeight: 700,
          color: "#F5F1EA",
          marginBottom: 4,
        }}>
          Watch Night
        </h1>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#5A5550" }}>
          Swipe the same queue live with a friend.
        </p>
      </header>

      <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column", gap: 40 }}>

        {/* Create */}
        <div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "#5A5550", textTransform: "uppercase", marginBottom: 16 }}>
            Start a new room
          </p>
          <button
            onClick={createRoom}
            disabled={creating}
            style={{
              width: "100%",
              background: "#8B2A2A",
              border: "none",
              color: "#F5F1EA",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              padding: "18px",
              cursor: creating ? "not-allowed" : "pointer",
              borderRadius: 2,
              opacity: creating ? 0.6 : 1,
            }}
          >
            {creating ? "Creating…" : "Create room →"}
          </button>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#3A3A3A", marginTop: 10, lineHeight: 1.6 }}>
            You'll get a shareable code. Send it to a friend — once they join, you both swipe the same deck simultaneously.
          </p>
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(245,241,234,0.06)" }} />
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path d="M12,2 L13.5,10 L21,8 L15,14 L19,21 L12,17 L5,21 L9,14 L3,8 L10.5,10 Z"
              fill="none" stroke="rgba(245,241,234,0.15)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <div style={{ flex: 1, height: 1, background: "rgba(245,241,234,0.06)" }} />
        </div>

        {/* Join */}
        <div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "#5A5550", textTransform: "uppercase", marginBottom: 16 }}>
            Join with a code
          </p>
          <form onSubmit={joinRoom} style={{ display: "flex", gap: 8 }}>
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="LENS-84Y"
              maxLength={10}
              style={{
                flex: 1,
                background: "#141414",
                border: "1px solid rgba(245,241,234,0.1)",
                color: "#F5F1EA",
                fontFamily: "var(--font-mono)",
                fontSize: 16,
                padding: "12px 14px",
                borderRadius: 2,
                outline: "none",
                letterSpacing: "0.1em",
              }}
            />
            <button
              type="submit"
              style={{
                background: "transparent",
                border: "1px solid rgba(245,241,234,0.12)",
                color: "#F5F1EA",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                padding: "12px 18px",
                cursor: "pointer",
                borderRadius: 2,
              }}
            >
              Join
            </button>
          </form>
          {error && (
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#8B2A2A", marginTop: 8 }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
