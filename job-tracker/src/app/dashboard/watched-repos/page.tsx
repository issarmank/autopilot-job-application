import { redirect } from 'next/navigation'
import { eq, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { watchedRepos } from '@/db/schema'
import WatchedRepos from '@/components/WatchedRepos'

// force-dynamic is required because auth() reads a cookie from the request —
// see src/app/dashboard/page.tsx for the same pattern.
export const dynamic = 'force-dynamic'

export default async function WatchedReposPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth')

  const rows = await db.query.watchedRepos.findMany({
    where   : eq(watchedRepos.userId, session.user.id),
    orderBy : [desc(watchedRepos.createdAt)],
  })

  const serialized = JSON.parse(JSON.stringify(rows))

  return <WatchedRepos initialWatchedRepos={serialized} />
}
