const BASE = 'https://api.themoviedb.org/3'
const IMG  = 'https://image.tmdb.org/t/p/w500'
const KEY  = process.env.TMDB_API_KEY!

export interface TMDBMovie {
  tmdbId:      number
  imdbId:      string
  title:       string
  year:        number
  runtime:     number
  genres:      string[]
  director:    string
  plot:        string
  posterUrl:   string
  tmdbRating:  number
  popularity:  number
}

async function get(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('api_key', KEY)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`)
  return res.json()
}

export async function searchMovies(query: string, page = 1) {
  const data = await get('/search/movie', { query, page: String(page) })
  return data.results as Array<{
    id: number
    title: string
    release_date: string
    poster_path: string | null
    vote_average: number
    popularity: number
    overview: string
  }>
}

export async function getMovieDetail(tmdbId: number): Promise<TMDBMovie> {
  const [detail, credits] = await Promise.all([
    get(`/movie/${tmdbId}`, { append_to_response: 'external_ids' }),
    get(`/movie/${tmdbId}/credits`),
  ])

  const director =
    (credits.crew as Array<{ job: string; name: string }>)
      .find(c => c.job === 'Director')?.name ?? 'Unknown'

  const genres = (detail.genres as Array<{ name: string }>).map(g => g.name)

  return {
    tmdbId:     detail.id,
    imdbId:     detail.external_ids?.imdb_id ?? '',
    title:      detail.title,
    year:       parseInt(detail.release_date?.slice(0, 4) ?? '0'),
    runtime:    detail.runtime ?? 0,
    genres,
    director,
    plot:       detail.overview ?? '',
    posterUrl:  detail.poster_path ? `${IMG}${detail.poster_path}` : '',
    tmdbRating: detail.vote_average ?? 0,
    popularity: detail.popularity ?? 0,
  }
}

export async function getRecommendations(tmdbId: number) {
  const data = await get(`/movie/${tmdbId}/recommendations`)
  return data.results as Array<{ id: number }>
}

export function posterUrl(path: string | null, size = 'w500') {
  if (!path) return ''
  return `https://image.tmdb.org/t/p/${size}${path}`
}
