"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SwipeDeck from "@/components/SwipeDeck";
import MoodSelector from "@/components/MoodSelector";
import MatchModal, { type MatchFilm } from "@/components/MatchModal";
import type { FilmData } from "@/components/SwipeCard";
import type { Mood } from "@/lib/moods";

interface Room {
  id:        string;
  code:      string;
  host_id:   string;
  status:    "waiting" | "active" | "ended";
  mood_tags: string[];
}

export default function LiveRoomPage() {
  const { code } = useParams<{ code: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [films, setFilms] = useState<FilmData[]>([]);
  const [moodsSet, setMoodsSet] = useState(false);
  const [pendingMoods, setPendingMoods] = useState<Set<Mood>>(new Set());
  const [waiting, setWaiting] = useState(true);
  const [match, setMatch] = useState<MatchFilm | null>(null);
  const [copied, setCopied] = useState(false);
  const [partnerName, setPartnerName] = useState("");

  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Track per-card: did we like it?
  const myLikes = useRef<Set<number>>(new Set());
  const partnerLikes = useRef<Set<number>>(new Set());

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: r } = await supabase.from("rooms").select("*").eq("code", code.toUpperCase()).single();
      if (!r) return;
      setRoom(r);

      // Join room
      await supabase.from("room_participants").upsert({ room_id: r.id, user_id: user.id });

      // Count participants
      const { count } = await supabase
        .from("room_participants")
        .select("user_id", { count: "exact", head: true })
        .eq("room_id", r.id);

      if (count && count >= 2) {
        setWaiting(false);
        loadQueue(r.id);
      }

      // Subscribe to room changes
      const channel = supabase.channel(`room:${r.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${r.id}` }, payload => {
          const updated = payload.new as Room;
          setRoom(updated);
          if (updated.status === "active") {
            setWaiting(false);
            loadQueue(r.id);
          }
        })
        .on("broadcast", { event: "swipe" }, ({ payload }) => {
          if (payload.user_id === user.id) return;
          if (payload.direction === "like") {
            partnerLikes.current.add(payload.tmdb_id);
            checkMatch(payload.tmdb_id, payload.partner_name);
          }
        })
        .subscribe();

      channelRef.current = channel;

      // Get partner name if 2 people
      const { data: participants } = await supabase
        .from("room_participants")
        .select("user_id, profiles(username)")
        .eq("room_id", r.id)
        .neq("user_id", user.id)
        .limit(1);
      if (participants?.[0]) {
        setPartnerName((participants[0] as any).profiles?.username ?? "friend");
      }
    }

    init();
    return () => { channelRef.current?.unsubscribe(); };
  }, [code]);

  async function loadQueue(roomId: string) {
    const res = await fetch(`/api/rooms/${code}/queue`);
    const data = await res.json();
    setFilms(data.films ?? []);
  }

  function checkMatch(tmdbId: number, pName: string) {
    if (myLikes.current.has(tmdbId) && partnerLikes.current.has(tmdbId)) {
      const film = films.find(f => f.tmdbId === tmdbId);
      if (film) {
        setMatch({
          title:      film.title,
          year:       film.year,
          director:   film.director,
          posterUrl:  film.posterUrl,
          friendName: partnerName || pName,
        });
      }
    }
  }

  const handleSwipe = useCallback(async (tmdbId: number, direction: "like" | "pass") => {
    if (direction === "like") {
      myLikes.current.add(tmdbId);
      checkMatch(tmdbId, partnerName);
    }

    channelRef.current?.send({
      type: "broadcast",
      event: "swipe",
      payload: { tmdb_id: tmdbId, direction, user_id: userId },
    });

    await fetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId, direction, source: room?.id }),
    });
  }, [films, partnerName, room, userId]);

  async function confirmMoods() {
    if (!room) return;
    const arr = Array.from(pendingMoods);
    await supabase.from("rooms")
      .update({ mood_tags: arr, status: "active" })
      .eq("id", room.id);
    setMoodsSet(true);
  }

  function copyLink() {
    navigator.clipboard.writeText(`${location.origin}/room/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!room) return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", color: "#5A5550" }}>Loading…</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ padding: "20px 24px 16px", borderBottom: "1px solid rgba(245,241,234,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550", letterSpacing: "0.12em", marginBottom: 4 }}>
              Room
            </p>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 20,
              color: "#F5F1EA",
              letterSpacing: "0.1em",
            }}>
              {code}
            </span>
          </div>
          <button
            onClick={copyLink}
            style={{
              background: "transparent",
              border: "1px solid rgba(245,241,234,0.1)",
              color: copied ? "#C9A961" : "#8A8580",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "8px 12px",
              cursor: "pointer",
              borderRadius: 2,
            }}
          >
            {copied ? "Copied!" : "Share link"}
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        gap: 24,
      }}>
        {waiting ? (
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontFamily: "var(--font-serif)",
              fontSize: 28,
              fontStyle: "italic",
              color: "#F5F1EA",
              marginBottom: 12,
            }}>
              Waiting for your friend…
            </div>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#5A5550", marginBottom: 24, lineHeight: 1.7 }}>
              Send them this link to start swiping together.
            </p>
            <button
              onClick={copyLink}
              style={{
                background: "#8B2A2A",
                border: "none",
                color: "#F5F1EA",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "14px 28px",
                cursor: "pointer",
                borderRadius: 2,
              }}
            >
              {copied ? "Copied!" : `Copy link — /room/${code}`}
            </button>
          </div>
        ) : films.length > 0 ? (
          <>
            {partnerName && (
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#5A5550", letterSpacing: "0.12em" }}>
                Swiping with <span style={{ color: "#F5F1EA" }}>@{partnerName}</span>
              </p>
            )}
            <SwipeDeck films={films} onSwipe={handleSwipe} />
          </>
        ) : (
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", color: "#5A5550" }}>
            Building your queue…
          </div>
        )}
      </div>

      {/* Mood selector (host only, sets moods for room) */}
      {!moodsSet && !waiting && room.status !== "active" && userId === room.host_id && (
        <div style={{ padding: "12px 0" }}>
          <MoodSelector selected={pendingMoods} onToggle={mood => {
            setPendingMoods(prev => {
              const next = new Set(prev);
              next.has(mood) ? next.delete(mood) : next.add(mood);
              return next;
            });
          }} />
          <div style={{ padding: "10px 24px 0" }}>
            <button
              onClick={confirmMoods}
              style={{
                width: "100%",
                background: "#141414",
                border: "1px solid rgba(245,241,234,0.12)",
                color: "#F5F1EA",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "12px",
                cursor: "pointer",
                borderRadius: 2,
              }}
            >
              {pendingMoods.size === 0 ? "Start — show everything" : "Start swiping"}
            </button>
          </div>
        </div>
      )}

      <MatchModal film={match} onDone={() => setMatch(null)} />
    </div>
  );
}
