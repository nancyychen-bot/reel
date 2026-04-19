"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SwipeDeck from "@/components/SwipeDeck";
import MatchModal, { type MatchFilm } from "@/components/MatchModal";
import type { FilmData } from "@/components/SwipeCard";
import { GENRES, SPECIAL, type Genre, type Special } from "@/lib/filters";

type Phase = "loading" | "waiting" | "selecting" | "swiping";

interface Room {
  id:             string;
  code:           string;
  host_id:        string;
  status:         "waiting" | "active" | "ended";
  mood_tags:      string[];
  queue_imdb_ids: string[] | null;
}

const SPECIAL_LABELS: Record<Special, string> = {
  Short:   "Short  <100 min",
  Epic:    "Epic  150+ min",
  Classic: "Classic  pre-1980",
  Recent:  "Recent  last 3 yrs",
};

export default function LiveRoomPage() {
  const { code } = useParams<{ code: string }>();
  const [phase, setPhase]         = useState<Phase>("loading");
  const [room, setRoom]           = useState<Room | null>(null);
  const [userId, setUserId]       = useState<string | null>(null);
  const [isHost, setIsHost]       = useState(false);
  const [films, setFilms]         = useState<FilmData[]>([]);
  const [match, setMatch]         = useState<MatchFilm | null>(null);
  const [copied, setCopied]       = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [starting, setStarting]   = useState(false);
  const [selectedGenres,  setSelectedGenres]  = useState<Set<Genre>>(new Set());
  const [selectedSpecial, setSelectedSpecial] = useState<Set<Special>>(new Set());

  const supabase     = createClient();
  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const myLikes      = useRef<Set<number>>(new Set());
  const partnerLikes = useRef<Set<number>>(new Set());
  const filmsRef     = useRef<FilmData[]>([]);
  const roomRef      = useRef<Room | null>(null);

  useEffect(() => { filmsRef.current = films; }, [films]);
  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: r } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .single();
      if (!r) return;
      setRoom(r);
      roomRef.current = r;

      const host = r.host_id === user.id;
      setIsHost(host);

      // Join as participant
      await supabase.from("room_participants").upsert({ room_id: r.id, user_id: user.id });

      // Fetch partner name
      await refreshPartnerName(r.id, user.id);

      // Count current participants
      const { count } = await supabase
        .from("room_participants")
        .select("user_id", { count: "exact", head: true })
        .eq("room_id", r.id);

      // Determine starting phase
      if (r.status === "active" && r.queue_imdb_ids?.length) {
        // Room already has a queue — load it and go straight to swiping
        await loadFilmsFromRoom(r);
      } else if ((count ?? 0) >= 2) {
        setPhase("selecting");
      } else {
        setPhase("waiting");
      }

      // Subscribe to participant joins + room updates + swipe broadcasts
      const channel = supabase.channel(`room:${r.id}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public",
          table: "room_participants", filter: `room_id=eq.${r.id}`,
        }, async () => {
          await refreshPartnerName(r.id, user.id);
          const { count: c } = await supabase
            .from("room_participants")
            .select("user_id", { count: "exact", head: true })
            .eq("room_id", r.id);
          if ((c ?? 0) >= 2) setPhase(prev => prev === "waiting" ? "selecting" : prev);
        })
        .on("postgres_changes", {
          event: "UPDATE", schema: "public",
          table: "rooms", filter: `id=eq.${r.id}`,
        }, async (payload) => {
          const updated = payload.new as Room;
          setRoom(updated);
          roomRef.current = updated;
          // Non-host: when host starts, load the queue from the room row
          if (!host && updated.status === "active" && updated.queue_imdb_ids?.length) {
            await loadFilmsFromRoom(updated);
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

  async function refreshPartnerName(roomId: string, myId: string) {
    const { data: pts } = await supabase
      .from("room_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .neq("user_id", myId)
      .limit(1);
    if (pts?.[0]) {
      const { data: prof } = await supabase
        .from("profiles").select("username").eq("id", pts[0].user_id).single();
      if (prof?.username) setPartnerName(prof.username);
    }
  }

  async function loadFilmsFromRoom(r: Room) {
    if (!r.queue_imdb_ids?.length) return;
    const { data: movies } = await supabase
      .from("movies")
      .select("tmdb_id, imdb_id, title, year, runtime_minutes, genres, director, plot, poster_url, tmdb_rating")
      .in("imdb_id", r.queue_imdb_ids);

    // Preserve stored order
    const movieMap = new Map((movies ?? []).map((m: any) => [m.imdb_id, m]));
    const ordered = r.queue_imdb_ids
      .map(id => movieMap.get(id))
      .filter(Boolean)
      .map((f: any): FilmData => ({
        tmdbId:     f.tmdb_id,
        title:      f.title,
        year:       f.year,
        director:   f.director || "Unknown",
        runtime:    f.runtime_minutes ?? 0,
        genres:     f.genres ?? [],
        plot:       f.plot ?? "",
        tmdbRating: f.tmdb_rating ?? 0,
        posterUrl:  f.poster_url ?? "",
      }));

    setFilms(ordered);
    setPhase("swiping");
  }

  async function startSwiping() {
    if (!room || !isHost) return;
    setStarting(true);

    // Save genre/special tags to room
    const tags = [...Array.from(selectedGenres), ...Array.from(selectedSpecial)];
    await supabase.from("rooms").update({ mood_tags: tags }).eq("id", room.id);

    // Host generates the queue (stored on room row, which triggers non-host via realtime)
    const res = await fetch(`/api/rooms/${code}/queue`);
    const data = await res.json();
    setFilms(data.films ?? []);
    setPhase("swiping");
    setStarting(false);
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
      type: "broadcast", event: "swipe",
      payload: { tmdb_id: tmdbId, direction, user_id: userId },
    });
    await fetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId, direction, source: room?.id,
        film: {
          title: film.title, year: film.year, posterUrl: film.posterUrl,
          genres: film.genres, plot: film.plot, tmdbRating: film.tmdbRating, director: film.director,
        },
      }),
    });
  }, [userId, room, partnerName]);

  function copyLink() {
    navigator.clipboard.writeText(`${location.origin}/room/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function toggleGenre(g: Genre) {
    setSelectedGenres(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }
  function toggleSpecial(s: Special) {
    setSelectedSpecial(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }

  // ── Render ─────────────────────────────────────────────────

  if (phase === "loading") return (
    <div style={{ position: "absolute", inset: 0, background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", color: "#5A5550" }}>Loading…</span>
    </div>
  );

  const headerBar = (
    <header style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "14px 20px 12px",
      borderBottom: "1px solid #141414",
      flexShrink: 0,
    }}>
      <div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#3A3A3A", letterSpacing: "0.14em", marginBottom: 2 }}>Room</p>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "#F5F1EA", letterSpacing: "0.1em" }}>{code}</span>
      </div>
      <button onClick={copyLink} style={{
        background: "transparent",
        border: `1px solid ${copied ? "#C9A96155" : "rgba(245,241,234,0.1)"}`,
        color: copied ? "#C9A961" : "#5A5550",
        fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
        textTransform: "uppercase", padding: "7px 12px",
        cursor: "pointer", borderRadius: 2, transition: "all 0.2s ease",
      }}>
        {copied ? "Copied!" : "Share link"}
      </button>
    </header>
  );

  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "#0A0A0A",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      paddingBottom: 70,
    }}>
      <MatchModal film={match} onDone={() => setMatch(null)} />

      {headerBar}

      {/* ── Waiting for friend ── */}
      {phase === "waiting" && (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "32px 24px", gap: 20, textAlign: "center",
        }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontStyle: "italic", color: "#F5F1EA" }}>
            Waiting for your friend…
          </div>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#5A5550", lineHeight: 1.7 }}>
            Send them this link to start swiping together.
          </p>
          <button onClick={copyLink} style={{
            background: "#8B2A2A", border: "none", color: "#F5F1EA",
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
            textTransform: "uppercase", padding: "14px 28px",
            cursor: "pointer", borderRadius: 2,
          }}>
            {copied ? "Copied!" : `Copy link  ·  /room/${code}`}
          </button>
        </div>
      )}

      {/* ── Genre selection ── */}
      {phase === "selecting" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px 24px" }}>

          {isHost ? (
            <>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "#F5F1EA", textTransform: "uppercase", letterSpacing: "0.02em", lineHeight: 1.1 }}>
                  What's the vibe?
                </div>
                {partnerName && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3A3A3A", letterSpacing: "0.12em", marginTop: 6 }}>
                    @{partnerName} is waiting
                  </div>
                )}
              </div>

              {/* Special filters */}
              <div style={{ marginTop: 24, marginBottom: 20 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#2e2e2e", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Type</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {SPECIAL.map(s => {
                    const on = selectedSpecial.has(s);
                    return (
                      <button key={s} onClick={() => toggleSpecial(s)} style={{
                        background: on ? "#1c1308" : "transparent",
                        border: `1px solid ${on ? "#C9A96155" : "#252525"}`,
                        borderRadius: 2, padding: "7px 13px",
                        color: on ? "#C9A961" : "#3a3a3a",
                        fontFamily: "var(--font-sans)", fontSize: 11,
                        cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s ease",
                      }}>
                        {SPECIAL_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Genre filters */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#2e2e2e", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Genre</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {GENRES.map(g => {
                    const on = selectedGenres.has(g);
                    return (
                      <button key={g} onClick={() => toggleGenre(g)} style={{
                        background: on ? "#1c1308" : "transparent",
                        border: `1px solid ${on ? "#C9A96155" : "#252525"}`,
                        borderRadius: 2, padding: "7px 13px",
                        color: on ? "#C9A961" : "#3a3a3a",
                        fontFamily: "var(--font-sans)", fontSize: 11,
                        cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s ease",
                      }}>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Start button */}
              <button
                onClick={startSwiping}
                disabled={starting}
                style={{
                  width: "100%",
                  background: "#8B2A2A", border: "none", color: "#F5F1EA",
                  fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.18em",
                  textTransform: "uppercase", padding: "18px",
                  cursor: starting ? "not-allowed" : "pointer",
                  borderRadius: 2, opacity: starting ? 0.6 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {starting
                  ? "Building queue…"
                  : (selectedGenres.size + selectedSpecial.size) === 0
                    ? "Start — show everything →"
                    : "Start swiping →"}
              </button>
            </>
          ) : (
            // Non-host waiting view
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              minHeight: "60vh", textAlign: "center", gap: 12,
            }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontStyle: "italic", color: "#F5F1EA" }}>
                {partnerName ? `@${partnerName}` : "Your friend"} is choosing the vibe…
              </div>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#5A5550", lineHeight: 1.7 }}>
                Sit tight. The queue will start as soon as they're ready.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Swiping ── */}
      {phase === "swiping" && (
        <>
          {partnerName && (
            <div style={{
              textAlign: "center", padding: "6px 0 2px", flexShrink: 0,
              fontFamily: "var(--font-mono)", fontSize: 9, color: "#3A3A3A", letterSpacing: "0.12em",
            }}>
              Swiping with <span style={{ color: "#5A5550" }}>@{partnerName}</span>
            </div>
          )}
          {films.length === 0 ? (
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-mono)", fontSize: 10, color: "#3a3a3a",
              letterSpacing: "0.16em", textTransform: "uppercase",
            }}>
              Curating…
            </div>
          ) : (
            <SwipeDeck
              films={films}
              onSwipe={handleSwipe}
              onEmpty={() => {}}
            />
          )}
        </>
      )}
    </div>
  );
}
