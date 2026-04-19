# Build: Reel — a "Tinder for movies" app for couples & friends

## Overview

Build a web app that solves "what should we watch tonight?" Users swipe through curated films; when a friend they're connected with also likes one, it's a match. Two modes: **async** (swipe whenever, matches appear over time with friends) and **live rooms** (two people swipe the same queue in real time, instant match modal the moment both right-swipe).

Think Letterboxd taste meets Tinder mechanics meets Criterion Collection aesthetics.

---

## Stack

- **Next.js 14** (App Router, TypeScript, Server Components where sensible)
- **Tailwind CSS** for styling
- **Supabase** for auth (email magic link + Google OAuth), Postgres database, Row-Level Security, and Realtime channels for live rooms
- **OMDB API** for movie metadata (posters, plot, ratings, runtime, year) — store API key in `.env.local` as `OMDB_API_KEY`
- **Framer Motion** for swipe animations
- **react-tinder-card** or custom swipe gestures (your call — custom gives more control over the feel)
- Deploy target: Vercel

---

## Design direction — moody/cinematic

This is the defining feature of the app. Do not default to generic SaaS styling.

**Palette**
- Background: near-black `#0A0A0A` with subtle film-grain overlay (SVG noise, ~3% opacity)
- Surface: `#141414` to `#1C1C1C`
- Text primary: warm off-white `#F5F1EA`
- Text secondary: `#8A8580`
- Accent: deep desaturated red `#8B2A2A` (think Criterion spine red, not Tinder pink) — used sparingly for the match moment and CTAs
- Success/like: muted amber `#C9A961`
- Pass/skip: cool graphite `#3A3A3A`

**Typography**
- Headings: a serif like **Cormorant Garamond** or **EB Garamond** (Google Fonts), slightly letter-spaced on display sizes
- Body: **Inter** or **Söhne**-alternative (e.g., `Figtree`) at 15–16px
- Numbers/metadata: a small monospaced accent (`JetBrains Mono`) for years, runtimes, ratings — gives the Criterion index feeling

**Texture**
- Apply a subtle grain overlay globally (pointer-events-none fixed div with SVG noise)
- Posters: slight vignette on hover, grayscale-to-color transition on active card
- Avoid rounded-2xl everywhere — prefer `rounded-sm` (2–4px) for a more editorial, filmic look
- Drop shadows should be soft and long, not punchy

**Motion**
- Swipes: weighted, slightly slow — the card should feel like a physical photograph, not a notification
- Match modal: fade in with a slow scale from 0.96, accompanied by a subtle grain flicker
- No confetti, no bounces, no emoji celebration. This is a film club, not a dating app.

---

## Data model (Supabase)

```sql
-- Users come from auth.users; extend with profile
profiles (
  id uuid primary key references auth.users,
  username text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
)

-- Onboarding answers
user_preferences (
  user_id uuid primary key references profiles,
  favorite_film_imdb_ids text[] not null,  -- the 5 films they seeded
  preferred_genres text[] not null,
  updated_at timestamptz default now()
)

-- Cached movie metadata from OMDB
movies (
  imdb_id text primary key,
  title text not null,
  year int,
  runtime_minutes int,
  genres text[],
  director text,
  plot text,
  poster_url text,
  imdb_rating numeric,
  rotten_tomatoes int,
  metacritic int,
  streaming_providers jsonb,  -- optional, populate later
  fetched_at timestamptz default now()
)

-- Letterboxd-sourced curated lists, cached
curated_lists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,            -- e.g. "a24-essentials"
  name text not null,
  source_url text,
  last_scraped_at timestamptz
)

curated_list_items (
  list_id uuid references curated_lists on delete cascade,
  imdb_id text references movies,
  position int,
  primary key (list_id, imdb_id)
)

-- Swipe history
swipes (
  id bigserial primary key,
  user_id uuid references profiles not null,
  imdb_id text references movies not null,
  direction text check (direction in ('like','pass')) not null,
  source text,                          -- 'async' or room_id
  created_at timestamptz default now(),
  unique (user_id, imdb_id)
)

-- Friendships (mutual)
friendships (
  user_id uuid references profiles,
  friend_id uuid references profiles,
  status text check (status in ('pending','accepted')) not null,
  created_at timestamptz default now(),
  primary key (user_id, friend_id)
)

-- Async matches (computed when both friends have liked same film)
matches (
  id bigserial primary key,
  user_a uuid references profiles not null,
  user_b uuid references profiles not null,
  imdb_id text references movies not null,
  context text,                         -- 'async' or room_id
  matched_at timestamptz default now(),
  dismissed_by_a boolean default false,
  dismissed_by_b boolean default false,
  unique (user_a, user_b, imdb_id)
)
-- Enforce user_a < user_b at insert time via trigger so pairs are canonical.

-- Live rooms
rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,            -- short shareable code like "DUNE-42X"
  host_id uuid references profiles not null,
  status text check (status in ('waiting','active','ended')) default 'waiting',
  mood_tags text[],
  queue_imdb_ids text[],                -- pre-computed shared queue
  created_at timestamptz default now()
)

room_participants (
  room_id uuid references rooms on delete cascade,
  user_id uuid references profiles,
  joined_at timestamptz default now(),
  current_index int default 0,
  primary key (room_id, user_id)
)

-- Watched list (separate from matches — user can mark anything watched)
watched (
  user_id uuid references profiles,
  imdb_id text references movies,
  watched_at timestamptz default now(),
  primary key (user_id, imdb_id)
)
```

RLS: every table should have policies. Users can only see their own swipes, preferences, watched list. Matches visible only to `user_a` and `user_b`. Room data visible only to participants.

---

## Core flows

### 1. Onboarding (first login)

1. Magic link or Google auth
2. Pick a username
3. "Tell us about your taste" — search OMDB and pick **5 films you love**
4. Multi-select genre chips (drawn from a static list of ~20 genres)
5. Land on the home feed

### 2. Home / Swipe feed (async mode)

- Top: mood selector appears as a modal on first entry per session. Moods are multi-select chips: `Cozy`, `Intense`, `Weird`, `Funny`, `Romantic`, `Cerebral`, `Beautiful`, `Short (<100min)`, `Epic`, `Foreign`, `Classic`, `Recent`
- The selected moods filter the deck
- Deck is generated by the **recommendation engine** (see below)
- Card shows: poster (large, dominant), title, year below in monospaced type
- Swipe up / scroll down reveals: IMDb rating, RT score, Metacritic, runtime, genres, director, plot synopsis
- Swipe right = like, swipe left = pass
- Also support keyboard: `→` like, `←` pass, `↓` details
- Tap buttons at bottom as alternative (large circular like/pass)
- After each like, check in the background: does any accepted friend also have this film liked? If yes, create a `matches` row and show a match modal on the next frame

### 3. Friends

- Friends tab: search by username → send request → accepted mutual
- For each friend, show a count: "You have 7 matches with Alex"
- Tap into a friend view to see the full match list with posters

### 4. Live rooms

- "Start a watch night" button on home
- Creates a room, returns a shareable code + link (`/room/DUNE-42X`)
- Host picks moods first
- Server pre-computes a shared queue of ~50 films filtered by both participants' preferences + room moods
- When second person joins, status flips to `active` and both start swiping the **same queue in the same order**
- Use Supabase Realtime: on every swipe, broadcast `{user_id, imdb_id, direction}` to the room channel
- Server (or client logic) checks: did both users like this film? If yes → match → both clients show the match modal simultaneously
- Match modal: full-width poster, serif headline "You both liked this.", title + year, director, "Where to watch" link (use a JustWatch search URL as fallback: `https://www.justwatch.com/us/search?q={title}`), and two buttons: "Keep swiping" / "Watch it"

### 5. Lists tab

Four sub-tabs:
- **Liked** — every film user swiped right on
- **Passed** — every pass (allow un-pass to re-enter deck)
- **Matches** — grouped by friend, newest first
- **Watched** — user-marked, with optional rating

Each film cell: small poster thumbnail, title, year, date.

---

## Recommendation engine

This is what makes the app feel curated, not random.

### Curated list scraping (run as a scheduled job / seed script)

Write a Node script `scripts/scrape-letterboxd.ts` that:
1. Takes an array of Letterboxd list URLs (seed ~15 lists initially — e.g., `/crew/list/a24-official-ranking/`, `/dave/list/official-top-250-narrative-feature-films/`, `/lucafilm/list/sight-and-sound-top-250-films-of-all-time/`, curated staff picks, "slow cinema essentials", "best of Criterion Channel", etc.)
2. For each list, parses the HTML (use `cheerio`) to extract film titles + years
3. Looks each up via OMDB to get an `imdb_id` and full metadata
4. Upserts into `movies` + `curated_lists` + `curated_list_items`

Respect robots.txt, cache aggressively, only re-scrape weekly.

Put the seed list URLs in `scripts/seed-lists.ts` as a constant so they're easy to edit.

### Deck generation for a user

When generating a swipe deck (size: 30 films per session):

1. Start with the union of films from curated lists
2. Filter out films the user has already swiped (liked or passed) or marked watched
3. Filter by selected mood tags — use a simple mapping table (e.g., `Cozy` → genres like Romance, Comedy, Family and runtime 80–120min; `Weird` → genres like Horror, Sci-Fi, Fantasy + directors like Lynch, Jodorowsky, etc.)
4. Score each film:
   - +3 if its genres overlap with user's `preferred_genres`
   - +2 if it shares a director or genre with any of the user's 5 seed films
   - +1 for high IMDb rating (>7.5)
   - +1 if appears in multiple curated lists
5. Sort by score, shuffle top 60, take 30

For **rooms**, do the same but intersect both users' preferences and score films that match both profiles higher.

Keep the engine in `lib/recommender.ts` as a single pure function that takes user prefs + swipe history + mood tags and returns an ordered list of `imdb_id`s.

---

## Page structure

```
app/
  layout.tsx                   — global grain overlay, fonts, theme
  page.tsx                     — marketing landing (simple: hero + "Start" CTA)
  (auth)/
    login/page.tsx
    onboarding/page.tsx        — 5 films + genres
  (app)/
    swipe/page.tsx             — main async swipe feed
    friends/page.tsx
    friends/[id]/page.tsx      — matches with one friend
    rooms/page.tsx             — create / join
    room/[code]/page.tsx       — live room
    lists/page.tsx             — tabbed liked/passed/matches/watched
    settings/page.tsx
  api/
    omdb/search/route.ts       — proxy OMDB search (hides API key)
    omdb/[imdbId]/route.ts     — proxy + cache to movies table
    deck/route.ts              — returns next 30 imdb_ids for user
    swipe/route.ts             — records swipe, checks matches
    rooms/create/route.ts
    rooms/[code]/queue/route.ts
components/
  SwipeCard.tsx
  SwipeDeck.tsx
  MatchModal.tsx
  MoodSelector.tsx
  GrainOverlay.tsx
  FilmPoster.tsx
  NavBar.tsx
lib/
  supabase/client.ts
  supabase/server.ts
  omdb.ts
  recommender.ts
  moods.ts                     — mood → filter mapping
scripts/
  scrape-letterboxd.ts
  seed-lists.ts
```

---

## Specific component notes

**SwipeCard**: draggable, with rotation proportional to drag distance (max ~15°), opacity of like/pass labels proportional to drag direction. Release past threshold (~120px) commits the swipe; otherwise snap back with a slight overshoot. Scroll/swipe up reveals a details panel that slides over the bottom 60% of the card with plot, ratings row, director, genres as small tags.

**MatchModal**: full-screen overlay, dark with grain, centered poster at max 320px wide, serif headline "You both liked this." in Cormorant, subhead with title + year in mono, "Where to watch" link styled as understated underlined text, two buttons at bottom (ghost style, not filled). Dismiss closes; "Watch it" opens JustWatch in new tab.

**MoodSelector**: modal that appears when entering `/swipe` if no moods set for this session (session storage). Grid of chip buttons, multi-select, "Start swiping" CTA at bottom.

**GrainOverlay**: a fixed `pointer-events-none` div with an inline SVG noise filter, opacity 0.03, `mix-blend-mode: overlay`.

---

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server-only, for scraper & admin ops
OMDB_API_KEY=
```

---

## Build order

1. Scaffold Next.js + Tailwind + Supabase client, set up fonts and the grain overlay — get the *visual feel* right before anything else. Build a static demo of one SwipeCard styled correctly.
2. Supabase schema + RLS policies + auth flow + onboarding
3. OMDB proxy routes + movie caching
4. Letterboxd scraper + seed data (run it, make sure `movies` has ~500 films)
5. Recommender + async swipe flow + likes/passes persistence
6. Friends system + async match detection + Matches list
7. Live rooms with Supabase Realtime
8. MatchModal + JustWatch integration
9. Lists tab polish, watched toggle
10. Landing page + deploy

---

## Things I care about

- **The feel of a single swipe.** It should be tactile and slightly weighty. Spend time on the physics.
- **The match modal is the payoff.** Don't make it cheesy. It should feel like finding a shared secret.
- **Curation over completeness.** Showing 30 great films beats showing 3,000 mediocre ones.
- **No dark patterns.** No streaks, no notifications begging users back, no "you're missing out" nudges.
- **Typography does a lot of heavy lifting.** Serif + mono combination is the signature.

Do not add features I didn't ask for (no ratings-after-watching flow, no social feed, no comments). Ship the core loop beautifully.

---

## Start with

Set up the project, install dependencies, configure Tailwind with the custom palette and fonts, create the `GrainOverlay`, and build a single statically-styled `SwipeCard` at `/demo` so I can see and approve the visual direction before you continue. Then pause and wait for my feedback.
