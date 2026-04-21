export const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Horror', 'Mystery',
  'Romance', 'Science Fiction', 'Thriller', 'War',
] as const
export type Genre = typeof GENRES[number]

export const SPECIAL = ['Short', 'Epic', 'Classic', 'Recent', 'Art House', 'Popular'] as const
export type Special = typeof SPECIAL[number]

export function matchesFilters(
  film: { genres: string[]; runtime: number; year: number },
  genres: Genre[],
  special: Special[],
): boolean {
  if (genres.length === 0 && special.length === 0) return true

  // Genre check: film must match at least one selected genre
  if (genres.length > 0) {
    if (!film.genres.some(g => (genres as readonly string[]).includes(g))) return false
  }

  // Special check: film must match at least one selected special
  if (special.length > 0) {
    const ok = special.some(s => {
      if (s === 'Short')   return film.runtime > 0 && film.runtime < 100
      if (s === 'Epic')    return film.runtime >= 150
      if (s === 'Classic') return film.year > 0 && film.year < 1980
      if (s === 'Recent')  return film.year >= new Date().getFullYear() - 3
      if (s === 'Popular') return true
      return false
    })
    if (!ok) return false
  }

  return true
}
