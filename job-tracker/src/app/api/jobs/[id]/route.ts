import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { applications } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

const patchSchema = z.object({
  stage: z.enum(['SAVED', 'APPLIED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'REJECTED']),
})

// params is a Promise in Next.js 15+ — must be awaited
type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext) {
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

  const result = patchSchema.safeParse(body)
  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 })
  }

  const { id } = await params

  try {
    const existing = await db.query.applications.findFirst({
      where: eq(applications.id, id),
    })

    if (!existing) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    if (existing.userId !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [updated] = await db
      .update(applications)
      .set({ stage: result.data.stage })
      .where(eq(applications.id, id))
      .returning()

    return Response.json({ application: updated })
  } catch (err) {
    console.error('Failed to update application:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const existing = await db.query.applications.findFirst({
      where: eq(applications.id, id),
    })

    if (!existing) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    if (existing.userId !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Deletes the application row only. The jobs row is NOT deleted here —
    // cascade runs job→application, not the reverse. Orphaned jobs are harmless in Phase 1.
    await db.delete(applications).where(eq(applications.id, id))

    return Response.json({ success: true })
  } catch (err) {
    console.error('Failed to delete application:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
