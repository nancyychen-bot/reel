"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SwipeDeck from "@/components/SwipeDeck";
import MatchModal, { type MatchFilm } from "@/components/MatchModal";
import type { FilmData } from "@/components/SwipeCard";
import { GENRES, SPECIAL, type Genre, type Special } from "@/lib/filters";
import { STREAMING_PROVIDERS } from "@/lib/providers";

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
  Short:        "Short  <100 min",
  Epic:         "Epic  150+ min",
  Classic:      "Classic  pre-1980",
  Recent:       "Recent  last 3 yrs",
  "Art House":  "Art House",
  Popular:      "Popular",
};

export default function LiveRoomPage() {
  const { code } = useParams<{ code: string }>();
  const [phase, setPhase]         = useState<Phase>("loading");
  const [room, setRoom]           = useState<Room | null>(null);
  const [userId, setUserId]       = useState<string | null>(null);
  const [isHost, setIsHost]       = useState(false);
  const [films, setFilms]         = useState<FilmData[]>([]);
  const [match, setMatch]             = useState<MatchFilm | null>(null);
  const [matchedFilms, setMatchedFilms] = useState<MatchFilm[]>([]);
  const [showMatchList, setShowMatchList] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [partnerId, setPartnerId]     = useState<string | null>(null);
  const [starting, setStarting]   = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedGenres,    setSelectedGenres]    = useState<Set<Genre>>(new Set());
  const [selectedSpecial,   setSelectedSpecial]   = useState<Set<Special>>(new Set());
  const [selectedProviders, setSelectedProviders] = useState<Set<number>>(new Set());

  const supabase          = createClient();
  const channelRef        = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Per-user like sets — keyed by user_id. A match fires only when ALL participants liked the film.
  const allLikes          = useRef<Map<string, Set<number>>>(new Map());
  const participantCount  = useRef<number>(0);
  const filmsRef          = useRef<FilmData[]>([]);
  const roomRef           = useRef<Room | null>(null);

  useEffect(() => { filmsRef.current = films; }, [films]);
  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // middleware already redirected; this is a fallback
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

      // Seed an empty like-set for the current user
      allLikes.current.set(user.id, new Set());

      // Count current participants
      const { count } = await supabase
        .from("room_participants")
        .select("user_id", { count: "exact", head: true })
        .eq("room_id", r.id);
      participantCount.current = count ?? 1;

      // Determine starting phase
      if (r.status === "active" && r.queue_imdb_ids?.length) {
        // Room already has a queue — load it and go straight to swiping
        await loadFilmsFromRoom(r);
      } else if (host || (count ?? 0) >= 2) {
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
          participantCount.current = c ?? participantCount.current;
          if ((c ?? 0) >= 2) setPhase(prev => prev === "waiting" ? "selecting" : prev);
        })
        .on("postgres_changes", {
          event: "UPDATE", schema: "public",
          table: "rooms", filter: `id=eq.${r.id}`,
        }, async () => {
          // Re-fetch the full room row — postgres_changes payload may be incomplete
          // if REPLICA IDENTITY FULL is not set on the table.
          const { data: updated } = await supabase
            .from("rooms").select("*").eq("id", r.id).single();
          if (!updated) return;
          setRoom(updated);
          roomRef.current = updated;
          if (!host && updated.status === "active" && updated.queue_imdb_ids?.length) {
            await loadFilmsFromRoom(updated);
          }
        })
        .on("broadcast", { event: "start" }, async () => {
          // Primary trigger: host broadcasts "start" once the queue is ready.
          // Non-host calls the queue API which returns the cached queue immediately.
          if (host) return;
          const res = await fetch(`/api/rooms/${code}/queue`);
          if (!res.ok) return;
          const data = await res.json();
          setFilms(data.films ?? []);
          setPhase("swiping");
          const pid = partnerId ?? await refreshPartnerName(r.id, user.id);
          if (pid) loadExistingMatches(pid);
        })
        .on("broadcast", { event: "swipe" }, ({ payload }) => {
          if (payload.user_id === user.id) return;
          if (payload.direction === "like") {
            if (!allLikes.current.has(payload.user_id)) {
              allLikes.current.set(payload.user_id, new Set());
            }
            allLikes.current.get(payload.user_id)!.add(payload.tmdb_id);
            checkMatch(payload.tmdb_id);
          }
        })
        .subscribe();

      channelRef.current = channel;
    }

    init();
    return () => { channelRef.current?.unsubscribe(); };
  }, [code]);

  async function refreshPartnerName(roomId: string, myId: string): Promise<string | null> {
    const { data: pts } = await supabase
      .from("room_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .neq("user_id", myId)
      .limit(1);
    if (pts?.[0]) {
      const pid = pts[0].user_id;
      setPartnerId(pid);
      const { data: prof } = await supabase
        .from("profiles").select("username").eq("id", pid).single();
      if (prof?.username) setPartnerName(prof.username);
      return pid;
    }
    return null;
  }

  async function loadExistingMatches(pid: string) {
    const res = await fetch(`/api/matches/${pid}`);
    if (!res.ok) return;
    const { matches } = await res.json();
    if (!matches?.length) return;
    setMatchedFilms(matches.map((m: any) => ({
      title:      m.title,
      year:       m.year,
      director:   "",
      posterUrl:  m.posterUrl,
      friendName: partnerName || "friend",
    })));
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
        imdbId:     f.imdb_id || undefined,
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

    // Load any pre-existing matches between the two users
    const pid = partnerId ?? await refreshPartnerName(r.id, (await supabase.auth.getUser()).data.user?.id ?? "");
    if (pid) loadExistingMatches(pid);
  }

  async function startSwiping(reset = false) {
    if (!room || !isHost) return;
    setStarting(true);

    // Save genre/special/provider tags to room
    const tags = [
      ...Array.from(selectedGenres),
      ...Array.from(selectedSpecial),
      ...Array.from(selectedProviders).map(id => `provider:${id}`),
    ];
    await supabase.from("rooms").update({ mood_tags: tags }).eq("id", room.id);

    // Host generates the queue — stored on the room row so non-host can fetch it.
    // Pass ?reset=1 when rebuilding mid-session to bypass the cached queue.
    const res = await fetch(`/api/rooms/${code}/queue${reset ? "?reset=1" : ""}`);
    const data = await res.json();
    setFilms(data.films ?? []);
    setPhase("swiping");
    setShowFilters(false);
    setStarting(false);

    // Broadcast "start" so the non-host knows to load the queue immediately
    // (more reliable than waiting for the postgres_changes UPDATE payload).
    channelRef.current?.send({ type: "broadcast", event: "start", payload: {} });

    if (partnerId) loadExistingMatches(partnerId);
  }

  function checkMatch(tmdbId: number) {
    const total = participantCount.current;
    if (total < 2) return;

    // Count how many participants have liked this film
    let likedBy = 0;
    for (const likes of allLikes.current.values()) {
      if (likes.has(tmdbId)) likedBy++;
    }

    // Match only when every participant in the room has liked it
    if (likedBy < total) return;

    const film = filmsRef.current.find(f => f.tmdbId === tmdbId);
    if (film) {
      const matchFilm: MatchFilm = {
        title:      film.title,
        year:       film.year,
        director:   film.director,
        posterUrl:  film.posterUrl,
        friendName: partnerName || "friend",
      };
      setMatch(matchFilm);
      setMatchedFilms(prev => {
        if (prev.some(m => m.title === matchFilm.title && m.year === matchFilm.year)) return prev;
        return [matchFilm, ...prev];
      });
    }
  }

  const handleSwipe = useCallback(async (tmdbId: number, direction: "like" | "pass", film: FilmData) => {
    if (direction === "like" && userId) {
      if (!allLikes.current.has(userId)) allLikes.current.set(userId, new Set());
      allLikes.current.get(userId)!.add(tmdbId);
      checkMatch(tmdbId);
    }
    channelRef.current?.send({
      type: "broadcast", event: "swipe",
      payload: { tmdb_id: tmdbId, direction, user_id: userId },
    });
    const res = await fetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId, direction, source: "room",
        film: {
          title: film.title, year: film.year, posterUrl: film.posterUrl,
          genres: film.genres, plot: film.plot, tmdbRating: film.tmdbRating, director: film.director,
        },
      }),
    });
    if (!res.ok) console.error("room swipe failed:", res.status, await res.text().catch(() => ""));
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
  function toggleProvider(id: number) {
    setSelectedProviders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
      paddingBottom: "calc(70px + env(safe-area-inset-bottom, 0px))" as string,
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
              <div style={{ marginBottom: 24 }}>
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

              {/* Streaming filters */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#2e2e2e", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Streaming</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {STREAMING_PROVIDERS.map(p => {
                    const on = selectedProviders.has(p.id);
                    return (
                      <button key={p.id} onClick={() => toggleProvider(p.id)} style={{
                        background: on ? `${p.color}22` : "transparent",
                        border: `1px solid ${on ? `${p.color}88` : "#252525"}`,
                        borderRadius: 2, padding: "7px 13px",
                        color: on ? p.color : "#3a3a3a",
                        fontFamily: "var(--font-sans)", fontSize: 11,
                        cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s ease",
                      }}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Start button */}
              <button
                onClick={() => startSwiping(false)}
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
          {/* Sub-header: partner name + Filters (host) + See Matches */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 16px 2px", flexShrink: 0, gap: 6,
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3A3A3A", letterSpacing: "0.12em", flex: 1 }}>
              {partnerName ? <>Swiping with <span style={{ color: "#5A5550" }}>@{partnerName}</span></> : ""}
            </div>
            {isHost && (
              <button
                onClick={() => setShowFilters(true)}
                style={{
                  background: (selectedGenres.size + selectedSpecial.size) > 0 ? "#1a1408" : "transparent",
                  border: `1px solid ${(selectedGenres.size + selectedSpecial.size) > 0 ? "#C9A96140" : "rgba(245,241,234,0.08)"}`,
                  borderRadius: 2,
                  color: (selectedGenres.size + selectedSpecial.size) > 0 ? "#C9A961" : "#3A3A3A",
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  padding: "5px 10px", cursor: "pointer",
                }}
              >
                Filters{(selectedGenres.size + selectedSpecial.size) > 0 ? ` · ${selectedGenres.size + selectedSpecial.size}` : ""}
              </button>
            )}
            <button
              onClick={() => setShowMatchList(true)}
              style={{
                background: matchedFilms.length > 0 ? "#1a1408" : "transparent",
                border: `1px solid ${matchedFilms.length > 0 ? "#C9A96140" : "rgba(245,241,234,0.08)"}`,
                borderRadius: 2,
                color: matchedFilms.length > 0 ? "#C9A961" : "#3A3A3A",
                fontFamily: "var(--font-mono)", fontSize: 9,
                letterSpacing: "0.12em", textTransform: "uppercase",
                padding: "5px 10px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              ♥ {matchedFilms.length} {matchedFilms.length === 1 ? "Match" : "Matches"}
            </button>
          </div>

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

      {/* ── Filter overlay (host only, during swiping) ── */}
      {showFilters && (
        <div
          onClick={() => setShowFilters(false)}
          style={{
            position: "absolute", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(8px)",
            display: "flex", flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0E0E0E",
              border: "1px solid rgba(245,241,234,0.08)",
              borderRadius: "4px 4px 0 0",
              maxHeight: "80vh",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 20px 14px",
              borderBottom: "1px solid rgba(245,241,234,0.06)",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#5A5550", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3 }}>
                  Change filters
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontStyle: "italic", color: "#F5F1EA" }}>
                  Rebuild the queue
                </div>
              </div>
              <button
                onClick={() => setShowFilters(false)}
                style={{ background: "none", border: "none", color: "#5A5550", fontSize: 22, cursor: "pointer", padding: "4px 6px", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Filter body */}
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "20px 20px 0" } as React.CSSProperties}>
              <div style={{ marginBottom: 18 }}>
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
              <div style={{ marginBottom: 18 }}>
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
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#2e2e2e", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Streaming</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {STREAMING_PROVIDERS.map(p => {
                    const on = selectedProviders.has(p.id);
                    return (
                      <button key={p.id} onClick={() => toggleProvider(p.id)} style={{
                        background: on ? `${p.color}22` : "transparent",
                        border: `1px solid ${on ? `${p.color}88` : "#252525"}`,
                        borderRadius: 2, padding: "7px 13px",
                        color: on ? p.color : "#3a3a3a",
                        fontFamily: "var(--font-sans)", fontSize: 11,
                        cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s ease",
                      }}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Apply button */}
            <div style={{ padding: "16px 20px 28px", flexShrink: 0 }}>
              <button
                onClick={() => startSwiping(true)}
                disabled={starting}
                style={{
                  width: "100%",
                  background: "#8B2A2A", border: "none", color: "#F5F1EA",
                  fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.18em",
                  textTransform: "uppercase", padding: "16px",
                  cursor: starting ? "not-allowed" : "pointer",
                  borderRadius: 2, opacity: starting ? 0.6 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {starting ? "Building queue…" : "Apply & rebuild queue →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Match list modal ── */}
      {showMatchList && (
        <div
          onClick={() => setShowMatchList(false)}
          style={{
            position: "absolute", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(8px)",
            display: "flex", flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0E0E0E",
              border: "1px solid rgba(245,241,234,0.08)",
              borderRadius: "4px 4px 0 0",
              maxHeight: "80vh",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 20px 14px",
              borderBottom: "1px solid rgba(245,241,234,0.06)",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#5A5550", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3 }}>
                  Room matches
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", color: "#F5F1EA" }}>
                  {matchedFilms.length} {matchedFilms.length === 1 ? "film" : "films"} you both liked
                </div>
              </div>
              <button
                onClick={() => setShowMatchList(false)}
                style={{
                  background: "none", border: "none", color: "#5A5550",
                  fontSize: 22, cursor: "pointer", padding: "4px 6px", lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Scrollable film list */}
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "8px 0 24px" } as React.CSSProperties}>
              {matchedFilms.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", gap: 14, alignItems: "center",
                    padding: "12px 20px",
                    borderBottom: "1px solid rgba(245,241,234,0.04)",
                  }}
                >
                  {m.posterUrl && (
                    <div style={{ width: 42, height: 62, flexShrink: 0, borderRadius: 2, overflow: "hidden", background: "#141414" }}>
                      <img src={m.posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-sans)", fontSize: 14, color: "#F5F1EA",
                      fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {m.title}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#5A5550", marginTop: 3 }}>
                      {m.year}{m.director && m.director !== "Unknown" ? ` · ${m.director}` : ""}
                    </div>
                  </div>
                  <div style={{ color: "#C9A961", fontSize: 16, flexShrink: 0 }}>♥</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
