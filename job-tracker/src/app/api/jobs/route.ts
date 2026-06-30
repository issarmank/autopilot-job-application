import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { applications } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await db.query.applications.findMany({
      where : eq(applications.userId, user.id),
      with  : { job: true },
    })

    return Response.json({ applications: rows })
  } catch (err) {
    console.error('Failed to fetch applications:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
