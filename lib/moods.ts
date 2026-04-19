export const MOODS = [
  'Cozy', 'Intense', 'Weird', 'Funny', 'Romantic',
  'Cerebral', 'Beautiful', 'Short (<100min)', 'Epic',
  'Foreign', 'Classic', 'Recent',
] as const

export type Mood = typeof MOODS[number]

export interface MoodFilter {
  genres:     string[]
  maxRuntime: number | null
  minRuntime: number | null
  directors:  string[]
  minYear:    number | null
  maxYear:    number | null
}

export const MOOD_FILTERS: Record<Mood, Partial<MoodFilter>> = {
  Cozy: {
    genres: ['Romance', 'Comedy', 'Family', 'Animation'],
    minRuntime: 80, maxRuntime: 120,
  },
  Intense: {
    genres: ['Thriller', 'Crime', 'War', 'Action'],
  },
  Weird: {
    genres: ['Horror', 'Science Fiction', 'Fantasy'],
    directors: ['David Lynch', 'Alejandro Jodorowsky', 'Yorgos Lanthimos', 'Charlie Kaufman'],
  },
  Funny: {
    genres: ['Comedy'],
  },
  Romantic: {
    genres: ['Romance', 'Drama'],
  },
  Cerebral: {
    genres: ['Drama', 'Mystery', 'Science Fiction'],
    directors: ['Stanley Kubrick', 'Ingmar Bergman', 'Andrei Tarkovsky', 'Michael Haneke'],
  },
  Beautiful: {
    genres: ['Drama', 'Romance'],
    directors: ['Wong Kar-wai', 'Terrence Malick', 'Paolo Sorrentino'],
  },
  'Short (<100min)': {
    maxRuntime: 100,
  },
  Epic: {
    minRuntime: 150,
    genres: ['Drama', 'Adventure', 'History', 'War'],
  },
  Foreign: {
    // filtered at query time by original_language != 'en'
    genres: [],
  },
  Classic: {
    maxYear: 1980,
  },
  Recent: {
    minYear: new Date().getFullYear() - 3,
  },
}

export function matchesMoods(
  film: { genres: string[]; runtime: number; year: number; director: string },
  moods: Mood[]
): boolean {
  if (moods.length === 0) return true
  return moods.some(mood => {
    const f = MOOD_FILTERS[mood]
    if (f.maxRuntime && film.runtime > f.maxRuntime) return false
    if (f.minRuntime && film.runtime < f.minRuntime) return false
    if (f.maxYear && film.year > f.maxYear) return false
    if (f.minYear && film.year < f.minYear) return false
    if (f.genres?.length) {
      const overlap = film.genres.some(g => f.genres!.includes(g))
      if (!overlap) return false
    }
    return true
  })
}
