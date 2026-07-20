import { z } from 'zod'

// All LLM calls in this app go through OpenRouter to a Gemini Flash model.
// Never call the Anthropic API from app code — see CLAUDE.md.
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'google/gemini-2.5-flash'

// The extraction contract shared by every source that starts from raw text:
// GitHub markdown, and the universal extension's raw-page-text fallback.
export const extractedJobSchema = z.object({
  title       : z.string().nullable(),
  company     : z.string().nullable(),
  location    : z.string().nullable(),
  salaryMin   : z.number().nullable(),
  salaryMax   : z.number().nullable(),
  description : z.string().nullable(),
})

export type ExtractedJob = z.infer<typeof extractedJobSchema>

const EXTRACTION_PROMPT = `You extract structured job listing fields from raw text (a job page's text content or a repository's markdown).

Return ONLY a JSON object with exactly these keys:
- "title": the job title, or null
- "company": the hiring company's name, or null
- "location": the job location (city/state/country or "Remote"), or null
- "salaryMin": minimum annual salary in USD as an integer (e.g. 120000), or null
- "salaryMax": maximum annual salary in USD as an integer, or null
- "description": a 1-3 sentence summary of the role, or null

Rules:
- Use null for anything not clearly stated in the text. Never invent values.
- If a single salary is given, set both salaryMin and salaryMax to it.
- Convert hourly rates to annual (hourly × 2080), rounded to an integer.
- Output raw JSON only — no markdown fences, no commentary.`

// Gemini sometimes wraps JSON in ```json fences despite instructions — strip them.
function stripFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

const completionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1),
})

// Shared by every extraction call: sends rawText (capped — job pages and
// batched table rows can be enormous) to Gemini under the given system
// prompt and returns the parsed JSON body of its response.
async function callExtractionModel(systemPrompt: string, rawText: string): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set')
  }

  const text = rawText.slice(0, 30000)

  const res = await fetch(OPENROUTER_URL, {
    method  : 'POST',
    headers : {
      'Authorization' : `Bearer ${apiKey}`,
      'Content-Type'  : 'application/json',
    },
    body: JSON.stringify({
      model    : MODEL,
      messages : [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: text },
      ],
      response_format : { type: 'json_object' },
      temperature     : 0,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenRouter request failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const data: unknown = await res.json()
  const completion = completionSchema.parse(data)

  try {
    return JSON.parse(stripFences(completion.choices[0].message.content))
  } catch {
    throw new Error('LLM returned invalid JSON')
  }
}

export async function extractJobFromText(rawText: string): Promise<ExtractedJob> {
  const parsed = await callExtractionModel(EXTRACTION_PROMPT, rawText)
  return extractedJobSchema.parse(parsed)
}

// The fallback contract for watched-repo table rows a deterministic parser
// (repoTable.ts) couldn't make sense of — see repoWatchSync.ts. Unlike the
// single-job schema, each item also needs sourceUrl (the apply link) and
// postedDate, since dedupe and the lookback-window filter both depend on them.
export const extractedJobListItemSchema = extractedJobSchema.extend({
  sourceUrl  : z.string().nullable(),
  postedDate : z.string().nullable(), // YYYY-MM-DD, or null if not stated
})

export type ExtractedJobListItem = z.infer<typeof extractedJobListItemSchema>

const LIST_EXTRACTION_PROMPT = `You extract structured job listing fields from raw text: one or more job-posting rows from a repository's markdown/HTML table that a deterministic parser could not make sense of (non-standard columns, merged cells, or free-form text). Each line of input is typically one row.

Return ONLY a JSON object with exactly one key, "jobs", holding an array. Each element represents one distinct job posting and must have exactly these keys:
- "title": the job title, or null
- "company": the hiring company's name, or null
- "location": the job location (city/state/country or "Remote"), or null
- "salaryMin": minimum annual salary in USD as an integer, or null
- "salaryMax": maximum annual salary in USD as an integer, or null
- "description": a 1-3 sentence summary of the role, or null
- "sourceUrl": the job's application/posting URL found in the text, or null
- "postedDate": the posting date in YYYY-MM-DD format if stated, or null

Rules:
- One array element per distinct job posting row in the input — do not merge separate rows into one.
- Use null for anything not clearly stated in the text. Never invent values, especially sourceUrl.
- If a single salary is given, set both salaryMin and salaryMax to it.
- Convert hourly rates to annual (hourly × 2080), rounded to an integer.
- Output raw JSON only — no markdown fences, no commentary.`

export async function extractJobListFromText(rawText: string): Promise<ExtractedJobListItem[]> {
  const parsed = await callExtractionModel(LIST_EXTRACTION_PROMPT, rawText)
  const listSchema = z.object({ jobs: z.array(extractedJobListItemSchema) })
  return listSchema.parse(parsed).jobs
}

// Phase 4 — ranks raw Adzuna listings against the user's stated preferences.
// The model only returns a score + reason keyed by id, never the listing
// fields themselves — Adzuna's own data is already normalized, so there's
// nothing to gain (and dedupe/salary accuracy to lose) by having the LLM
// echo it back.
export interface InternshipPreferences {
  role         : string
  positionType : string
  location     : string
}

export interface RankInput {
  id          : number
  title       : string | null
  company     : string | null
  location    : string | null
  description : string | null
}

export interface RankedListing {
  id     : number
  score  : number
  reason : string
}

const rankingResultSchema = z.object({
  rankings: z.array(z.object({
    id     : z.number(),
    score  : z.number(),
    reason : z.string(),
  })),
})

const RANKING_PROMPT = `You rank a list of job listings against a candidate's stated preferences.

Input is a JSON object: { "preferences": { "role": string, "positionType": string, "location": string }, "listings": [{ "id": number, "title": string|null, "company": string|null, "location": string|null, "description": string|null }] }

Return ONLY a JSON object with exactly one key, "rankings", holding an array. Each element must have exactly these keys:
- "id": the listing's id, copied exactly from the input
- "score": an integer 0-100 for how well the listing matches the stated role, position type, and location preferences (100 = excellent match)
- "reason": a short (under 20 words) explanation of the score

Rules:
- Include every listing id from the input exactly once.
- Score listings that clearly don't match the stated role or position type low (below 30).
- Treat "Remote" as compatible with any stated location preference.
- Output raw JSON only — no markdown fences, no commentary.`

export async function rankInternshipListings(
  listings: RankInput[],
  preferences: InternshipPreferences,
): Promise<RankedListing[]> {
  const payload = JSON.stringify({ preferences, listings })
  const parsed = await callExtractionModel(RANKING_PROMPT, payload)
  return rankingResultSchema.parse(parsed).rankings
}
