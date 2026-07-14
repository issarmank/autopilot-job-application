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

export async function extractJobFromText(rawText: string): Promise<ExtractedJob> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set')
  }

  // Job pages can be enormous (nav, footer, scripts' text) — cap what we send.
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
        { role: 'system', content: EXTRACTION_PROMPT },
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

  const completionSchema = z.object({
    choices: z.array(z.object({
      message: z.object({ content: z.string() }),
    })).min(1),
  })
  const completion = completionSchema.parse(data)

  let parsed: unknown
  try {
    parsed = JSON.parse(stripFences(completion.choices[0].message.content))
  } catch {
    throw new Error('LLM returned invalid JSON')
  }

  return extractedJobSchema.parse(parsed)
}
