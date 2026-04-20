import { matchesMoods, type Mood } from './moods'
import { matchesFilters, type Genre, type Special } from './filters'

export interface FilmRecord {
  tmdb_id:   number
  imdb_id:   string
  title:     string
  year:      number
  runtime:   number
  genres:    string[]
  director:  string
  plot:      string
  poster_url: string
  tmdb_rating: number
  list_count: number   // how many curated lists it appears in
}

export interface UserPrefs {
  favoriteGenres:    string[]
  seedDirectors:     string[]   // directors of their 5 seed films
  seedGenres:        string[]   // genres of their 5 seed films
}

export interface RecommenderInput {
  pool:         FilmRecord[]
  swipedIds:    Set<number>     // already liked or passed
  watchedIds:   Set<number>     // marked watched
  userPrefs:    UserPrefs
  moods:        Mood[]
  genres?:      Genre[]
  special?:     Special[]
  count?:       number
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
  // 1. Filter out seen films
  let candidates = pool.filter(
    f => !swipedIds.has(f.tmdb_id) && !watchedIds.has(f.tmdb_id)
  )

  // 2. Filter by genre/special (new) or mood (legacy rooms path)
  if (genres !== undefined || special !== undefined) {
    candidates = candidates.filter(f =>
      matchesFilters({ genres: f.genres, runtime: f.runtime, year: f.year }, genres ?? [], special ?? [])
    )
  } else {
    candidates = candidates.filter(f =>
      matchesMoods({ genres: f.genres, runtime: f.runtime, year: f.year, director: f.director }, moods)
    )
  }

  // 3. Score
  const scored = candidates.map(f => {
    let score = 0
    const genreOverlap = f.genres.some(g => userPrefs.favoriteGenres.includes(g))
    if (genreOverlap) score += 3

    const seedDirectorMatch = userPrefs.seedDirectors.includes(f.director)
    const seedGenreMatch = f.genres.some(g => userPrefs.seedGenres.includes(g))
    if (seedDirectorMatch || seedGenreMatch) score += 2

    // Tiered prestige scoring — strongly favours acclaimed arthouse films
    if      (f.tmdb_rating >= 8.5) score += 6
    else if (f.tmdb_rating >= 8.0) score += 4
    else if (f.tmdb_rating >= 7.8) score += 2
    else if (f.tmdb_rating >= 7.5) score += 1
    if (f.list_count >= 2)    score += 2  // TMDB similarity recs get list_count=2

    return { film: f, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // 4. Take top 60, shuffle, return count
  const top = scored.slice(0, 60).map(s => s.film)
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[top[i], top[j]] = [top[j], top[i]]
  }

  return top.slice(0, count)
}

/** For live rooms — score higher for films that match BOTH user profiles */
export function buildRoomDeck({
  pool,
  swipedIds,
  watchedIds,
  userAPrefs,
  userBPrefs,
  moods,
  genres,
  special,
  count = 50,
}: {
  pool:       FilmRecord[]
  swipedIds:  Set<number>
  watchedIds: Set<number>
  userAPrefs: UserPrefs
  userBPrefs: UserPrefs
  moods:      Mood[]
  genres?:    Genre[]
  special?:   Special[]
  count?:     number
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

  const score = (f: FilmRecord, prefs: UserPrefs) => {
    let s = 0
    if (f.genres.some(g => prefs.favoriteGenres.includes(g))) s += 3
    if (prefs.seedDirectors.includes(f.director) || f.genres.some(g => prefs.seedGenres.includes(g))) s += 2
    if      (f.tmdb_rating >= 8.5) s += 6
    else if (f.tmdb_rating >= 8.0) s += 4
    else if (f.tmdb_rating >= 7.8) s += 2
    else if (f.tmdb_rating >= 7.5) s += 1
    if (f.list_count >= 2) s += 2
    return s
  }

  const scored = candidates.map(f => ({
    film:  f,
    score: score(f, userAPrefs) + score(f, userBPrefs),
  }))

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, 80).map(s => s.film)
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[top[i], top[j]] = [top[j], top[i]]
  }

  return top.slice(0, count)
}
