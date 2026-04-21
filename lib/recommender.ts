import { matchesMoods, type Mood } from './moods'
import { matchesFilters, type Genre, type Special } from './filters'

export interface FilmRecord {
  tmdb_id:     number
  imdb_id:     string
  title:       string
  year:        number
  runtime:     number
  genres:      string[]
  director:    string
  plot:        string
  poster_url:  string
  tmdb_rating: number
  list_count:  number   // curated list membership; higher = stronger prestige boost
}

export interface UserPrefs {
  favoriteGenres:  string[]  // explicit genre picks from onboarding
  seedGenres:      string[]  // top genres by like-rate from swipe history
  seedDirectors:   string[]  // top directors by like-rate from swipe history
  passedGenres:    string[]  // genres the user consistently skips
  passedDirectors: string[]  // directors the user consistently skips
  eraCenter:       number    // avg release year of liked films (0 = unknown)
}

export interface RecommenderInput {
  pool:       FilmRecord[]
  swipedIds:  Set<number>
  watchedIds: Set<number>
  userPrefs:  UserPrefs
  moods:      Mood[]
  genres?:    Genre[]
  special?:   Special[]
  count?:     number
}

function scoreFilm(f: FilmRecord, prefs: UserPrefs): number {
  let score = 0

  // ── Positive signals ────────────────────────────────────────────────────
  if (f.genres.some(g => prefs.favoriteGenres.includes(g))) score += 3
  if (prefs.seedDirectors.includes(f.director))              score += 2
  if (f.genres.some(g => prefs.seedGenres.includes(g)))      score += 2

  // Era preference — reward films close to the user's preferred era
  if (prefs.eraCenter > 0 && f.year > 0) {
    const diff = Math.abs(f.year - prefs.eraCenter)
    if      (diff <= 10) score += 3
    else if (diff <= 20) score += 2
    else if (diff <= 35) score += 1
  }

  // Prestige / curated list membership
  if      (f.list_count >= 4) score += 3  // Ebert Great Movies
  else if (f.list_count >= 3) score += 2  // Prestige IDs
  else if (f.list_count >= 2) score += 2  // TMDB similarity recs

  // TMDB rating
  if      (f.tmdb_rating >= 8.5) score += 6
  else if (f.tmdb_rating >= 8.0) score += 4
  else if (f.tmdb_rating >= 7.8) score += 2
  else if (f.tmdb_rating >= 7.5) score += 1

  // ── Negative signals (pass behaviour) ───────────────────────────────────
  if (f.genres.some(g => prefs.passedGenres.includes(g)))  score -= 2
  if (prefs.passedDirectors.includes(f.director))           score -= 1

  return score
}

/** Enforce genre diversity — no primary genre can exceed `capPct` of the deck. */
function applyDiversity(ranked: FilmRecord[], count: number, capPct = 0.4): FilmRecord[] {
  const cap        = Math.ceil(count * capPct)
  const genreCount = new Map<string, number>()
  const result: FilmRecord[] = []
  const overflow: FilmRecord[] = []

  for (const film of ranked) {
    const primary = film.genres[0] ?? '__none__'
    const n = genreCount.get(primary) ?? 0
    if (n < cap) {
      result.push(film)
      genreCount.set(primary, n + 1)
    } else {
      overflow.push(film)
    }
    if (result.length >= count) break
  }

  // Fill any remaining slots from overflow (cap was too strict for a thin pool)
  if (result.length < count) {
    for (const film of overflow) {
      result.push(film)
      if (result.length >= count) break
    }
  }

  return result
}

export function buildDeck({
  pool,
  swipedIds,
  watchedIds,
  userPrefs,
  moods,
  genres,
  special,
  count = 30,
}: RecommenderInput): FilmRecord[] {
  // 1. Exclude seen films
  let candidates = pool.filter(
    f => !swipedIds.has(f.tmdb_id) && !watchedIds.has(f.tmdb_id)
  )

  // 2. Apply active filters
  if (genres !== undefined || special !== undefined) {
    candidates = candidates.filter(f =>
      matchesFilters({ genres: f.genres, runtime: f.runtime, year: f.year }, genres ?? [], special ?? [])
    )
  } else {
    candidates = candidates.filter(f =>
      matchesMoods({ genres: f.genres, runtime: f.runtime, year: f.year, director: f.director }, moods)
    )
  }

  // 3. Score and rank
  const scored = candidates
    .map(f => ({ film: f, score: scoreFilm(f, userPrefs) }))
    .sort((a, b) => b.score - a.score)

  // 4. Take top 80, enforce genre diversity, then shuffle
  const ranked = scored.slice(0, 80).map(s => s.film)
  const diverse = applyDiversity(ranked, Math.min(count * 2, ranked.length))
  for (let i = diverse.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[diverse[i], diverse[j]] = [diverse[j], diverse[i]]
  }

  return diverse.slice(0, count)
}

/** For live rooms — scores combine all participants' profiles. */
export function buildRoomDeck({
  pool,
  swipedIds,
  watchedIds,
  allUserPrefs,
  moods,
  genres,
  special,
  count = 50,
}: {
  pool:         FilmRecord[]
  swipedIds:    Set<number>
  watchedIds:   Set<number>
  allUserPrefs: UserPrefs[]
  moods:        Mood[]
  genres?:      Genre[]
  special?:     Special[]
  count?:       number
}): FilmRecord[] {
  let candidates = pool.filter(
    f => !swipedIds.has(f.tmdb_id) && !watchedIds.has(f.tmdb_id)
  )

  if (genres !== undefined || special !== undefined) {
    candidates = candidates.filter(f =>
      matchesFilters({ genres: f.genres, runtime: f.runtime, year: f.year }, genres ?? [], special ?? [])
    )
  } else {
    candidates = candidates.filter(f =>
      matchesMoods({ genres: f.genres, runtime: f.runtime, year: f.year, director: f.director }, moods)
    )
  }

  const scored = candidates
    .map(f => ({ film: f, score: allUserPrefs.reduce((sum, prefs) => sum + scoreFilm(f, prefs), 0) }))
    .sort((a, b) => b.score - a.score)

  const ranked  = scored.slice(0, 100).map(s => s.film)
  const diverse = applyDiversity(ranked, Math.min(count * 2, ranked.length))
  for (let i = diverse.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[diverse[i], diverse[j]] = [diverse[j], diverse[i]]
  }

  return diverse.slice(0, count)
}
