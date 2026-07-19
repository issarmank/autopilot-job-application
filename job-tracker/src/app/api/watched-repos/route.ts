import { NextRequest } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { watchedRepos } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { parseRepoUrl } from '@/lib/sources/github'
import { enqueueRepoSync } from '@/lib/queue/repoSyncQueue'

const createSchema = z.object({
  repoUrl      : z.string().url(),
  lookbackDays : z.number().int().min(1).max(90).optional(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await db.query.watchedRepos.findMany({
      where   : eq(watchedRepos.userId, user.id),
      orderBy : [desc(watchedRepos.createdAt)],
    })
    return Response.json({ watchedRepos: rows })
  } catch (err) {
    console.error('Failed to fetch watched repos:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

  const result = createSchema.safeParse(body)
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

  try {
    const [watched] = await db.insert(watchedRepos).values({
      repoUrl      : `https://github.com/${ref.owner}/${ref.repo}`,
      owner        : ref.owner,
      repo         : ref.repo,
      lookbackDays : result.data.lookbackDays ?? 14,
      userId       : user.id,
    }).returning()

    // Sync right away rather than making the user wait for the next
    // scheduled run — still queue-driven, not a manual endpoint.
    await enqueueRepoSync(watched.id)

    return Response.json({ success: true, watchedRepo: watched }, { status: 201 })
  } catch (err) {
    console.error('Failed to add watched repo:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
