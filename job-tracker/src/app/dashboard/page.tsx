import { redirect } from 'next/navigation'
import { eq, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { applications } from '@/db/schema'
import Dashboard from '@/components/Dashboard'

// force-dynamic is required because auth() reads a cookie from the request.
// Without it, Next.js might try to prerender this page at build time,
// when no session cookie exists.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  // redirect() in a Server Component throws internally — execution stops here.
  if (!session?.user?.id) redirect('/auth')

  const rows = await db.query.applications.findMany({
    where   : eq(applications.userId, session.user.id),
    with    : { job: true },
    orderBy : [desc(applications.createdAt)],
  })

  // Dates must be serialized before passing to a Client Component.
  // JSON.stringify + parse converts Date objects to ISO strings.
  const serialized = JSON.parse(JSON.stringify(rows))

  return (
    <Dashboard
      user={session.user}
      initialApplications={serialized}
    />
  )
}
