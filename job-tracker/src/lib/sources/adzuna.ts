import { z } from 'zod'

const ADZUNA_BASE_URL = 'https://api.adzuna.com/v1/api/jobs'

export interface AdzunaSearchParams {
  what           : string   // keyword, e.g. "software engineering intern"
  where?         : string   // location, e.g. "New York"
  country?       : string   // Adzuna country code, defaults to 'us'
  resultsPerPage?: number
}

export interface AdzunaListing {
  title       : string | null
  company     : string | null
  location    : string | null
  description : string | null
  sourceUrl   : string
  salaryMin   : number | null
  salaryMax   : number | null
  postedDate  : string | null
}

const adzunaResultSchema = z.object({
  title        : z.string().nullable(),
  company      : z.object({ display_name: z.string() }).nullable().optional(),
  location     : z.object({ display_name: z.string() }).nullable().optional(),
  description  : z.string().nullable().optional(),
  redirect_url : z.string(),
  salary_min   : z.number().nullable().optional(),
  salary_max   : z.number().nullable().optional(),
  created      : z.string().nullable().optional(),
})

const adzunaResponseSchema = z.object({
  results: z.array(adzunaResultSchema),
})

// Adzuna's app_id/app_key are query params, not headers — see CLAUDE.md.
export async function searchAdzunaJobs(params: AdzunaSearchParams): Promise<AdzunaListing[]> {
  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY
  if (!appId || !appKey) {
    throw new Error('ADZUNA_APP_ID / ADZUNA_APP_KEY are not set')
  }

  const country = params.country ?? 'us'
  const url = new URL(`${ADZUNA_BASE_URL}/${country}/search/1`)
  url.searchParams.set('app_id', appId)
  url.searchParams.set('app_key', appKey)
  url.searchParams.set('what', params.what)
  url.searchParams.set('results_per_page', String(params.resultsPerPage ?? 30))
  url.searchParams.set('content-type', 'application/json')
  if (params.where) url.searchParams.set('where', params.where)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Adzuna request failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const data: unknown = await res.json()
  const parsed = adzunaResponseSchema.parse(data)

  return parsed.results.map(r => ({
    title       : r.title,
    company     : r.company?.display_name ?? null,
    location    : r.location?.display_name ?? null,
    description : r.description ?? null,
    sourceUrl   : r.redirect_url,
    salaryMin   : r.salary_min != null ? Math.round(r.salary_min) : null,
    salaryMax   : r.salary_max != null ? Math.round(r.salary_max) : null,
    postedDate  : r.created ?? null,
  }))
}
