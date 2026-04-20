"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const GENRE_LIST = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Fantasy", "History", "Horror",
  "Music", "Mystery", "Romance", "Science Fiction", "Thriller",
  "War", "Western",
];

// ── shared tab pill style ────────────────────────────────────────────────────
function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    background: "transparent",
    border: "none",
    borderBottom: `2px solid ${active ? "#F5F1EA" : "rgba(245,241,234,0.08)"}`,
    color: active ? "#F5F1EA" : "#5A5550",
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    padding: "0 0 10px",
    cursor: "pointer",
    transition: "color 0.15s, border-color 0.15s",
  };
}

// ── Friends sub-page ─────────────────────────────────────────────────────────
interface Friend {
  id:         string;
  username:   string;
  matchCount: number;
  status:     "accepted" | "pending_sent" | "pending_received";
}

function FriendsTab() {
  const supabase = createClient();
  const [friends, setFriends]           = useState<Friend[]>([]);
  const [search, setSearch]             = useState("");
  const [searchResult, setSearchResult] = useState<{ id: string; username: string } | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "notfound" | "self">("idle");
  const [loading, setLoading]           = useState(true);

  useEffect(() => { loadFriends(); }, []);

  async function loadFriends() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: fs }, matchRes] = await Promise.all([
      supabase.from("friendships").select("user_id, friend_id, status")
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`),
      fetch("/api/matches"),
    ]);

    if (!fs) { setLoading(false); return; }

    const allMatches: Array<{ friendId: string }> = matchRes.ok
      ? (await matchRes.json()).matches ?? []
      : [];

    const matchCountByFriend = new Map<string, number>();
    for (const m of allMatches) {
      matchCountByFriend.set(m.friendId, (matchCountByFriend.get(m.friendId) ?? 0) + 1);
    }

    const enriched = await Promise.all(fs.map(async f => {
      const otherId = f.user_id === user.id ? f.friend_id : f.user_id;
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", otherId).single();
      let status: Friend["status"] = "accepted";
      if (f.status === "pending") {
        status = f.user_id === user.id ? "pending_sent" : "pending_received";
      }
      return {
        id:         otherId,
        username:   profile?.username ?? "unknown",
        matchCount: matchCountByFriend.get(otherId) ?? 0,
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
    const { data } = await supabase.from("profiles").select("id, username")
      .ilike("username", search.trim()).maybeSingle();
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

  const accepted = friends.filter(f => f.status === "accepted");
  const incoming = friends.filter(f => f.status === "pending_received");
  const outgoing = friends.filter(f => f.status === "pending_sent");

  const inputStyle: React.CSSProperties = {
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
  };

  return (
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
            style={inputStyle}
          />
          <button
            onClick={doSearch}
            style={{
              background: "#8B2A2A", border: "none", color: "#F5F1EA",
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
              padding: "10px 16px", cursor: "pointer", borderRadius: 2,
            }}
          >
            Search
          </button>
        </div>
        {searchStatus === "notfound" && (
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#5A5550", marginTop: 8 }}>No user found.</p>
        )}
        {searchStatus === "self" && (
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#5A5550", marginTop: 8 }}>{"That's you."}</p>
        )}
        {searchResult && (
          <div style={{
            marginTop: 10, border: "1px solid rgba(245,241,234,0.08)",
            padding: "12px 14px", display: "flex", alignItems: "center",
            justifyContent: "space-between", borderRadius: 2,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#F5F1EA" }}>@{searchResult.username}</span>
            <button
              onClick={() => sendRequest(searchResult.id)}
              style={{
                background: "transparent", border: "1px solid rgba(139,42,42,0.4)",
                color: "#8B2A2A", fontFamily: "var(--font-mono)", fontSize: 9,
                letterSpacing: "0.12em", textTransform: "uppercase",
                padding: "6px 12px", cursor: "pointer", borderRadius: 2,
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
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 0", borderBottom: "1px solid rgba(245,241,234,0.05)",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#F5F1EA" }}>@{f.username}</span>
              <button
                onClick={() => acceptRequest(f.id)}
                style={{
                  background: "#8B2A2A", border: "none", color: "#F5F1EA",
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
                  textTransform: "uppercase", padding: "6px 14px", cursor: "pointer", borderRadius: 2,
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
            Friends · {accepted.length}
          </span>
          <div style={{ flex: 1, height: 1, background: "rgba(245,241,234,0.06)" }} />
        </div>

        {loading && <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#3A3A3A" }}>Loading…</p>}

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
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 0", borderBottom: "1px solid rgba(245,241,234,0.05)",
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
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 0", borderBottom: "1px solid rgba(245,241,234,0.05)", opacity: 0.5,
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#F5F1EA" }}>@{f.username}</div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550", letterSpacing: "0.1em" }}>PENDING</span>
          </div>
        ))}
      </section>
    </div>
  );
}

// ── Account Settings sub-page ────────────────────────────────────────────────
function AccountTab() {
  const supabase = createClient();
  const router   = useRouter();
  const [username, setUsername]   = useState("");
  const [email, setEmail]         = useState("");
  const [genres, setGenres]       = useState<Set<string>>(new Set());
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const [{ data: profile }, { data: prefs }] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", user.id).single(),
        supabase.from("user_preferences").select("preferred_genres").eq("user_id", user.id).maybeSingle(),
      ]);
      setUsername(profile?.username ?? "");
      setGenres(new Set(prefs?.preferred_genres ?? []));
    }
    load();
  }, []);

  function toggleGenre(g: string) {
    setGenres(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  async function savePrefs() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_preferences").upsert({
      user_id: user.id,
      preferred_genres: Array.from(genres),
    }, { onConflict: "user_id" });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const rowStyle: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 0", borderBottom: "1px solid rgba(245,241,234,0.06)",
  };

  return (
    <div style={{ padding: "24px", paddingBottom: 40 }}>

      {/* Profile info */}
      <div style={{ marginBottom: 32 }}>
        <div style={rowStyle}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "#5A5550", textTransform: "uppercase" }}>
            Username
          </span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#F5F1EA" }}>@{username}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "#5A5550", textTransform: "uppercase" }}>
            Email
          </span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#F5F1EA" }}>{email}</span>
        </div>
      </div>

      {/* Genre preferences */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "#5A5550", textTransform: "uppercase", marginBottom: 6 }}>
            Genre preferences
          </div>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#3A3A3A", lineHeight: 1.5 }}>
            Soft preferences — you'll still see everything, but these get boosted in your feed.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {GENRE_LIST.map(g => {
            const active = genres.has(g);
            return (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                style={{
                  background:   active ? "rgba(232,69,60,0.12)" : "transparent",
                  border:       `1.5px solid ${active ? "#E8453C" : "rgba(245,241,234,0.1)"}`,
                  color:        active ? "#F5F1EA" : "#5A5550",
                  fontFamily:   "var(--font-sans)",
                  fontSize:     12,
                  padding:      "7px 14px",
                  cursor:       "pointer",
                  borderRadius: 2,
                  transition:   "all 0.15s",
                }}
              >
                {g}
              </button>
            );
          })}
        </div>

        <button
          onClick={savePrefs}
          disabled={saving}
          style={{
            marginTop: 16,
            background: saved ? "transparent" : "#E8453C",
            border: saved ? "1px solid rgba(245,241,234,0.15)" : "none",
            color: saved ? "#5A5550" : "#fff",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "12px 24px",
            cursor: saving ? "not-allowed" : "pointer",
            borderRadius: 2,
            opacity: saving ? 0.6 : 1,
            transition: "all 0.3s",
          }}
        >
          {saved ? "Saved" : saving ? "Saving…" : "Save preferences"}
        </button>
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        style={{
          width: "100%",
          background: "transparent",
          border: "1px solid rgba(139,42,42,0.3)",
          color: "#8B2A2A",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          padding: "14px",
          cursor: "pointer",
          borderRadius: 2,
        }}
      >
        Sign out
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const [tab, setTab] = useState<"friends" | "account">("friends");

  return (
    <div style={{ position: "absolute", inset: 0, background: "#0A0A0A", overflowY: "auto", paddingBottom: 70 }}>
      <header style={{ padding: "24px 24px 0", borderBottom: "1px solid rgba(245,241,234,0.06)", paddingBottom: 0 }}>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 36,
          fontStyle: "italic",
          fontWeight: 700,
          color: "#F5F1EA",
          marginBottom: 20,
        }}>
          Account
        </h1>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          <button style={tabStyle(tab === "friends")} onClick={() => setTab("friends")}>Friends</button>
          <button style={tabStyle(tab === "account")} onClick={() => setTab("account")}>Settings</button>
        </div>
      </header>

      {tab === "friends" ? <FriendsTab /> : <AccountTab />}
    </div>
  );
}
