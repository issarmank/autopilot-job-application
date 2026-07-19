import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import { jobs, applications } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { parseRepoUrl, fetchRepoJobText } from '@/lib/sources/github'
import { extractJobFromText } from '@/lib/llm/extract'

// GitHub source orchestration: repo URL → REST API fetch (JOBS.md → README.md
// → description) → Gemini Flash extraction → job + application rows.
const githubSchema = z.object({
  repoUrl: z.string().url(),
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

  const result = githubSchema.safeParse(body)
  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 })
  }

  const ref = parseRepoUrl(result.data.repoUrl)
  if (!ref) {
    return Response.json(
      { error: 'Not a GitHub repository URL (expected github.com/owner/repo)' },
      { status: 400 },
    )
  }

  let content
  try {
    content = await fetchRepoJobText(ref)
  } catch (err) {
    console.error('GitHub fetch failed:', err)
    const message = err instanceof Error ? err.message : 'GitHub fetch failed'
    return Response.json({ error: message }, { status: 502 })
  }

  let fields
  try {
    fields = await extractJobFromText(content.rawText)
  } catch (err) {
    console.error('LLM extraction failed:', err)
    return Response.json({ error: 'Extraction failed' }, { status: 502 })
  }

  try {
    const [job] = await db.insert(jobs).values({
      title       : fields.title,
      company     : fields.company ?? ref.owner,
      location    : fields.location,
      salaryMin   : fields.salaryMin,
      salaryMax   : fields.salaryMax,
      description : fields.description,
      sourceUrl   : content.repoUrl,
      sourceType  : 'github',
      // Keep the original markdown so bad extractions can be re-run without
      // another GitHub fetch — see CLAUDE.md.
      rawText     : content.rawText,
    }).returning()

    const [application] = await db.insert(applications).values({
      jobId  : job.id,
      userId : user.id,
    }).returning()

    return Response.json(
      { success: true, jobId: job.id, applicationId: application.id },
      { status: 201 },
    )
  } catch (err) {
    console.error('Failed to save GitHub job:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
