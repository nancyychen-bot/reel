"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SwipeDeck from "@/components/SwipeDeck";
import MatchModal, { type MatchFilm } from "@/components/MatchModal";
import type { FilmData } from "@/components/SwipeCard";

interface Room {
  id:      string;
  code:    string;
  host_id: string;
  status:  "waiting" | "active" | "ended";
}

export default function LiveRoomPage() {
  const { code } = useParams<{ code: string }>();
  const [room, setRoom]           = useState<Room | null>(null);
  const [userId, setUserId]       = useState<string | null>(null);
  const [films, setFilms]         = useState<FilmData[]>([]);
  const [waiting, setWaiting]     = useState(true);
  const [match, setMatch]         = useState<MatchFilm | null>(null);
  const [copied, setCopied]       = useState(false);
  const [partnerName, setPartnerName] = useState("");

  const supabase    = createClient();
  const channelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const myLikes     = useRef<Set<number>>(new Set());
  const partnerLikes = useRef<Set<number>>(new Set());
  const filmsRef    = useRef<FilmData[]>([]);

  // Keep filmsRef in sync so checkMatch can read latest without stale closure
  useEffect(() => { filmsRef.current = films; }, [films]);

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

      // Get partner name
      const { data: participants } = await supabase
        .from("room_participants")
        .select("user_id")
        .eq("room_id", r.id)
        .neq("user_id", user.id)
        .limit(1);

      if (participants?.[0]) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", participants[0].user_id)
          .single();
        setPartnerName(profile?.username ?? "friend");
      }

      // Count participants — if already 2, start immediately
      const { count } = await supabase
        .from("room_participants")
        .select("user_id", { count: "exact", head: true })
        .eq("room_id", r.id);

      if (count && count >= 2) {
        setWaiting(false);
        loadQueue(code.toUpperCase());
        // Mark room active
        await supabase.from("rooms").update({ status: "active" }).eq("id", r.id).eq("status", "waiting");
      }

      // Subscribe to participant joins + swipe broadcasts
      const channel = supabase.channel(`room:${r.id}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "room_participants",
          filter: `room_id=eq.${r.id}`,
        }, async () => {
          const { count: c } = await supabase
            .from("room_participants")
            .select("user_id", { count: "exact", head: true })
            .eq("room_id", r.id);
          if (c && c >= 2) {
            // Get partner name now that they've joined
            const { data: pts } = await supabase
              .from("room_participants")
              .select("user_id")
              .eq("room_id", r.id)
              .neq("user_id", user.id)
              .limit(1);
            if (pts?.[0]) {
              const { data: prof } = await supabase
                .from("profiles").select("username").eq("id", pts[0].user_id).single();
              setPartnerName(prof?.username ?? "friend");
            }
            setWaiting(false);
            loadQueue(code.toUpperCase());
            await supabase.from("rooms").update({ status: "active" }).eq("id", r.id).eq("status", "waiting");
          }
        })
        .on("broadcast", { event: "swipe" }, ({ payload }) => {
          if (payload.user_id === user.id) return;
          if (payload.direction === "like") {
            partnerLikes.current.add(payload.tmdb_id);
            checkMatch(payload.tmdb_id);
          }
        })
        .subscribe();

      channelRef.current = channel;
    }

    init();
    return () => { channelRef.current?.unsubscribe(); };
  }, [code]);

  async function loadQueue(roomCode: string) {
    const res = await fetch(`/api/rooms/${roomCode}/queue`);
    const data = await res.json();
    setFilms(data.films ?? []);
  }

  function checkMatch(tmdbId: number) {
    if (myLikes.current.has(tmdbId) && partnerLikes.current.has(tmdbId)) {
      const film = filmsRef.current.find(f => f.tmdbId === tmdbId);
      if (film) {
        setMatch({
          title:      film.title,
          year:       film.year,
          director:   film.director,
          posterUrl:  film.posterUrl,
          friendName: partnerName || "friend",
        });
      }
    }
  }

  const handleSwipe = useCallback(async (tmdbId: number, direction: "like" | "pass", film: FilmData) => {
    if (direction === "like") {
      myLikes.current.add(tmdbId);
      checkMatch(tmdbId);
    }

    channelRef.current?.send({
      type: "broadcast",
      event: "swipe",
      payload: { tmdb_id: tmdbId, direction, user_id: userId },
    });

    await fetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId,
        direction,
        source: room?.id,
        film: {
          title:      film.title,
          year:       film.year,
          posterUrl:  film.posterUrl,
          genres:     film.genres,
          plot:       film.plot,
          tmdbRating: film.tmdbRating,
          director:   film.director,
        },
      }),
    });
  }, [userId, room, partnerName]);

  function copyLink() {
    navigator.clipboard.writeText(`${location.origin}/room/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (!room) return (
    <div style={{
      position: "absolute", inset: 0,
      background: "#0A0A0A",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", color: "#5A5550" }}>
        Loading…
      </span>
    </div>
  );

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#0A0A0A",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      paddingBottom: 70,
    }}>
      <MatchModal film={match} onDone={() => setMatch(null)} />

      {/* Header */}
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 20px 12px",
        borderBottom: "1px solid #141414",
        flexShrink: 0,
      }}>
        <div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#3A3A3A", letterSpacing: "0.14em", marginBottom: 2 }}>
            Room
          </p>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "#F5F1EA", letterSpacing: "0.1em" }}>
            {code}
          </span>
        </div>
        <button
          onClick={copyLink}
          style={{
            background: "transparent",
            border: `1px solid ${copied ? "#C9A96155" : "rgba(245,241,234,0.1)"}`,
            color: copied ? "#C9A961" : "#5A5550",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "7px 12px",
            cursor: "pointer",
            borderRadius: 2,
            transition: "all 0.2s ease",
          }}
        >
          {copied ? "Copied!" : "Share link"}
        </button>
      </header>

      {/* Partner indicator */}
      {partnerName && !waiting && (
        <div style={{
          textAlign: "center",
          padding: "6px 0 2px",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "#3A3A3A",
          letterSpacing: "0.12em",
          flexShrink: 0,
        }}>
          Swiping with <span style={{ color: "#5A5550" }}>@{partnerName}</span>
        </div>
      )}

      {/* Body */}
      {waiting ? (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
          gap: 20,
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 28,
            fontStyle: "italic",
            color: "#F5F1EA",
          }}>
            Waiting for your friend…
          </div>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#5A5550", lineHeight: 1.7 }}>
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
            {copied ? "Copied!" : `Copy link  ·  /room/${code}`}
          </button>
        </div>
      ) : films.length === 0 ? (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "#3a3a3a",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}>
          Curating…
        </div>
      ) : (
        <SwipeDeck
          films={films}
          onSwipe={handleSwipe}
          onEmpty={() => {/* room queue is fixed */}}
        />
      )}
    </div>
  );
}
