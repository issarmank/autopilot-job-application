import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import { jobs, applications } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

const saveSchema = z.object({
  title       : z.string().nullable().optional(),
  company     : z.string().nullable().optional(),
  location    : z.string().nullable().optional(),
  salaryMin   : z.number().nullable().optional(),
  salaryMax   : z.number().nullable().optional(),
  description : z.string().nullable().optional(),
  sourceUrl   : z.string().url(),
  sourceType  : z.enum(['linkedin', 'github', 'manual']),
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

  const result = saveSchema.safeParse(body)
  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 })
  }

  const data = result.data

  try {
    const [job] = await db.insert(jobs).values({
      title       : data.title       ?? null,
      company     : data.company     ?? null,
      location    : data.location    ?? null,
      salaryMin   : data.salaryMin   ?? null,
      salaryMax   : data.salaryMax   ?? null,
      description : data.description ?? null,
      sourceUrl   : data.sourceUrl,
      sourceType  : data.sourceType,
    }).returning()

    await db.insert(applications).values({
      jobId  : job.id,
      userId : user.id,
    })

    return Response.json({ success: true, jobId: job.id }, { status: 201 })
  } catch (err) {
    console.error('Failed to save job:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
