import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { watchedRepos } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const existing = await db.query.watchedRepos.findFirst({
      where: eq(watchedRepos.id, id),
    })

    if (!existing) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    if (existing.userId !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.delete(watchedRepos).where(eq(watchedRepos.id, id))

    return Response.json({ success: true })
  } catch (err) {
    console.error('Failed to delete watched repo:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
