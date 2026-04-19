"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Friend {
  id:         string;
  username:   string;
  matchCount: number;
  status:     "accepted" | "pending_sent" | "pending_received";
}

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<{ id: string; username: string } | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "notfound" | "self">("idle");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadFriends();
  }, []);

  async function loadFriends() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get friendships + match counts
    const { data: fs } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status")
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

    if (!fs) { setLoading(false); return; }

    const enriched = await Promise.all(fs.map(async f => {
      const otherId = f.user_id === user.id ? f.friend_id : f.user_id;
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", otherId).single();
      const { count } = await supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .or(`user_a.eq.${otherId},user_b.eq.${otherId}`);

      let status: Friend["status"] = "accepted";
      if (f.status === "pending") {
        status = f.user_id === user.id ? "pending_sent" : "pending_received";
      }

      return {
        id:         otherId,
        username:   profile?.username ?? "unknown",
        matchCount: count ?? 0,
        status,
      };
    }));

    setFriends(enriched);
    setLoading(false);
  }

  async function doSearch() {
    setSearchResult(null);
    setSearchStatus("idle");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("id, username").eq("username", search.trim()).maybeSingle();
    if (!data) { setSearchStatus("notfound"); return; }
    if (data.id === user.id) { setSearchStatus("self"); return; }
    setSearchResult(data);
  }

  async function sendRequest(toId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("friendships").insert({ user_id: user.id, friend_id: toId, status: "pending" });
    setSearchResult(null);
    setSearch("");
    loadFriends();
  }

  async function acceptRequest(fromId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("friendships")
      .update({ status: "accepted" })
      .eq("user_id", fromId)
      .eq("friend_id", user.id);
    loadFriends();
  }

  const accepted  = friends.filter(f => f.status === "accepted");
  const incoming  = friends.filter(f => f.status === "pending_received");
  const outgoing  = friends.filter(f => f.status === "pending_sent");

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A" }}>
      {/* Header */}
      <header style={{ padding: "24px 24px 0", borderBottom: "1px solid rgba(245,241,234,0.06)", paddingBottom: 20 }}>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 36,
          fontStyle: "italic",
          fontWeight: 700,
          color: "#F5F1EA",
          marginBottom: 4,
        }}>Friends</h1>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3A3A3A", letterSpacing: "0.12em" }}>
          {accepted.length} {accepted.length === 1 ? "friend" : "friends"}
        </p>
      </header>

      <div style={{ padding: "24px" }}>

        {/* Search */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "#5A5550", textTransform: "uppercase", marginBottom: 10 }}>
            Add by username
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doSearch()}
              placeholder="username"
              style={{
                flex: 1,
                background: "#141414",
                border: "1px solid rgba(245,241,234,0.1)",
                color: "#F5F1EA",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                padding: "10px 12px",
                borderRadius: 2,
                outline: "none",
                letterSpacing: "0.04em",
              }}
            />
            <button
              onClick={doSearch}
              style={{
                background: "#8B2A2A",
                border: "none",
                color: "#F5F1EA",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                padding: "10px 16px",
                cursor: "pointer",
                borderRadius: 2,
              }}
            >
              Search
            </button>
          </div>

          {searchStatus === "notfound" && (
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#5A5550", marginTop: 8 }}>No user found.</p>
          )}
          {searchStatus === "self" && (
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#5A5550", marginTop: 8 }}>That's you.</p>
          )}
          {searchResult && (
            <div style={{
              marginTop: 10,
              border: "1px solid rgba(245,241,234,0.08)",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderRadius: 2,
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#F5F1EA" }}>@{searchResult.username}</span>
              <button
                onClick={() => sendRequest(searchResult.id)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(139,42,42,0.4)",
                  color: "#8B2A2A",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "6px 12px",
                  cursor: "pointer",
                  borderRadius: 2,
                }}
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Incoming requests */}
        {incoming.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "#8B2A2A", textTransform: "uppercase" }}>
                Requests · {incoming.length}
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(245,241,234,0.06)" }} />
            </div>
            {incoming.map(f => (
              <div key={f.id} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 0",
                borderBottom: "1px solid rgba(245,241,234,0.05)",
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#F5F1EA" }}>@{f.username}</span>
                <button
                  onClick={() => acceptRequest(f.id)}
                  style={{
                    background: "#8B2A2A",
                    border: "none",
                    color: "#F5F1EA",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    padding: "6px 14px",
                    cursor: "pointer",
                    borderRadius: 2,
                  }}
                >
                  Accept
                </button>
              </div>
            ))}
          </section>
        )}

        {/* Friends list */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "#5A5550", textTransform: "uppercase" }}>
              Friends
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(245,241,234,0.06)" }} />
          </div>

          {loading && (
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#3A3A3A" }}>Loading…</p>
          )}

          {!loading && accepted.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", color: "#3A3A3A" }}>No friends yet.</div>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#2A2A2A", marginTop: 8 }}>
                Add someone by username to start matching.
              </p>
            </div>
          )}

          {accepted.map(f => (
            <Link
              key={f.id}
              href={`/friends/${f.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 0",
                borderBottom: "1px solid rgba(245,241,234,0.05)",
                textDecoration: "none",
              }}
            >
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#F5F1EA" }}>@{f.username}</div>
                {f.matchCount > 0 && (
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#8B2A2A", marginTop: 3 }}>
                    {f.matchCount} {f.matchCount === 1 ? "match" : "matches"}
                  </div>
                )}
              </div>
              <span style={{ color: "#3A3A3A", fontSize: 16 }}>→</span>
            </Link>
          ))}

          {outgoing.map(f => (
            <div key={f.id} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 0",
              borderBottom: "1px solid rgba(245,241,234,0.05)",
              opacity: 0.5,
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#F5F1EA" }}>@{f.username}</div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550", letterSpacing: "0.1em" }}>PENDING</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
