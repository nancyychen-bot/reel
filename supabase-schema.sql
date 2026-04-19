-- ═══════════════════════════════════════════════════════════
--  Reel — Supabase Schema
--  Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════

-- ── Profiles ──────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     text unique not null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, username)
  values (new.id, split_part(new.email, '@', 1))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── User preferences ──────────────────────────────────────
create table if not exists user_preferences (
  user_id                  uuid primary key references profiles on delete cascade,
  favorite_film_tmdb_ids   int[]   not null default '{}',
  preferred_genres         text[]  not null default '{}',
  updated_at               timestamptz default now()
);

-- ── Movies (TMDB cache) ───────────────────────────────────
create table if not exists movies (
  tmdb_id         int  primary key,
  imdb_id         text unique,
  title           text not null,
  year            int,
  runtime_minutes int,
  genres          text[],
  director        text,
  plot            text,
  poster_url      text,
  tmdb_rating     numeric,
  fetched_at      timestamptz default now()
);

-- ── Curated lists (Letterboxd) ────────────────────────────
create table if not exists curated_lists (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  name           text not null,
  source_url     text,
  last_scraped_at timestamptz
);

create table if not exists curated_list_items (
  list_id  uuid references curated_lists on delete cascade,
  imdb_id  text,
  tmdb_id  int references movies,
  position int,
  primary key (list_id, tmdb_id)
);

-- Helper RPC: count list appearances per film
create or replace function film_list_counts()
returns table(tmdb_id int, count bigint) language sql as $$
  select tmdb_id, count(*) as count
  from curated_list_items
  where tmdb_id is not null
  group by tmdb_id;
$$;

-- ── Swipes ────────────────────────────────────────────────
create table if not exists swipes (
  id         bigserial primary key,
  user_id    uuid references profiles not null,
  imdb_id    text not null,
  direction  text check (direction in ('like','pass')) not null,
  source     text,
  created_at timestamptz default now(),
  unique (user_id, imdb_id)
);

-- ── Friendships ───────────────────────────────────────────
create table if not exists friendships (
  user_id    uuid references profiles,
  friend_id  uuid references profiles,
  status     text check (status in ('pending','accepted')) not null,
  created_at timestamptz default now(),
  primary key (user_id, friend_id)
);

-- ── Matches ───────────────────────────────────────────────
create table if not exists matches (
  id              bigserial primary key,
  user_a          uuid references profiles not null,
  user_b          uuid references profiles not null,
  imdb_id         text not null,
  context         text,
  matched_at      timestamptz default now(),
  dismissed_by_a  boolean default false,
  dismissed_by_b  boolean default false,
  unique (user_a, user_b, imdb_id),
  check (user_a < user_b)  -- canonical ordering
);

-- ── Rooms ────────────────────────────────────────────────
create table if not exists rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,
  host_id         uuid references profiles not null,
  status          text check (status in ('waiting','active','ended')) default 'waiting',
  mood_tags       text[],
  queue_imdb_ids  text[],
  created_at      timestamptz default now()
);

create table if not exists room_participants (
  room_id       uuid references rooms on delete cascade,
  user_id       uuid references profiles,
  joined_at     timestamptz default now(),
  current_index int default 0,
  primary key (room_id, user_id)
);

-- ── Watched ──────────────────────────────────────────────
create table if not exists watched (
  user_id    uuid references profiles,
  imdb_id    text,
  watched_at timestamptz default now(),
  primary key (user_id, imdb_id)
);

-- ═══════════════════════════════════════════════════════════
--  Row Level Security
-- ═══════════════════════════════════════════════════════════

alter table profiles         enable row level security;
alter table user_preferences enable row level security;
alter table swipes           enable row level security;
alter table friendships      enable row level security;
alter table matches          enable row level security;
alter table rooms            enable row level security;
alter table room_participants enable row level security;
alter table watched          enable row level security;
-- movies + curated lists are public reads
alter table movies           enable row level security;
alter table curated_lists    enable row level security;
alter table curated_list_items enable row level security;

-- Profiles: anyone can read, only owner can write
create policy "profiles: public read"   on profiles for select using (true);
create policy "profiles: owner write"   on profiles for all    using (auth.uid() = id);

-- Preferences: owner only
create policy "prefs: owner"            on user_preferences for all using (auth.uid() = user_id);

-- Movies + lists: public read (service role writes via scraper)
create policy "movies: public read"     on movies             for select using (true);
create policy "lists: public read"      on curated_lists      for select using (true);
create policy "list_items: public read" on curated_list_items for select using (true);

-- Swipes: owner only
create policy "swipes: owner"           on swipes for all     using (auth.uid() = user_id);

-- Friendships: visible to both parties
create policy "friendships: parties"    on friendships for all
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Matches: visible to user_a and user_b
create policy "matches: parties"        on matches for all
  using (auth.uid() = user_a or auth.uid() = user_b);

-- Rooms: visible to participants
create policy "rooms: public read"      on rooms for select using (true);
create policy "rooms: host write"       on rooms for update using (auth.uid() = host_id);
create policy "rooms: create"           on rooms for insert with check (auth.uid() = host_id);

create policy "room_participants: own"  on room_participants for all
  using (auth.uid() = user_id);
create policy "room_participants: read" on room_participants for select using (true);

-- Watched: owner only
create policy "watched: owner"          on watched for all    using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
--  Realtime
-- ═══════════════════════════════════════════════════════════
-- Enable realtime on rooms so the live room page can react to status changes
-- Supabase Dashboard → Database → Replication → add: rooms, room_participants
