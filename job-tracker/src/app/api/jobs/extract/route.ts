import { NextRequest } from 'next/server'
import { z } from 'zod'
import { extractJobFromText } from '@/lib/llm/extract'
import { getCurrentUser } from '@/lib/auth'

// Raw-text fallback for the universal extension: when a job page's DOM has no
// clean fields, the popup sends the page text here, we run LLM extraction
// server-side (the OpenRouter key never ships to the extension), and return
// the structured fields for the user to confirm before saving.
const extractSchema = z.object({
  rawText: z.string().min(50, 'rawText must be at least 50 characters'),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = extractSchema.safeParse(body)
  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 })
  }

  try {
    const fields = await extractJobFromText(result.data.rawText)
    return Response.json({ fields })
  } catch (err) {
    console.error('LLM extraction failed:', err)
    return Response.json({ error: 'Extraction failed' }, { status: 502 })
  }
}
