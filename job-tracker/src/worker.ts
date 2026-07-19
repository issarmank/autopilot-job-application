// Standalone background-job process — run alongside `next dev`/`next start`
// with `npm run worker`. Registers the repeatable "check every watched repo"
// job on boot, then processes both that fan-out job and the individual
// per-repo sync jobs it produces (plus the immediate one-off sync jobs
// POST /api/watched-repos enqueues when a repo is first added).
import { config } from 'dotenv'
config({ path: '.env.local' })

import type { Job, Queue as QueueType } from 'bullmq'

const SYNC_ALL_JOB_ID = 'sync-all-cron'
const intervalHours = Number(process.env.REPO_SYNC_INTERVAL_HOURS ?? 12)

async function main() {
  // Imported dynamically, inside main(), on purpose: a static top-level
  // `import { db } from '@/db'` would be hoisted and evaluated before the
  // config() call above runs, capturing process.env.DATABASE_URL as
  // undefined — @/db builds its Postgres pool at import time. Next.js and
  // Vitest both auto-load .env.local before anything runs, which is why
  // this isn't an issue anywhere else in the app, only in this standalone
  // entrypoint.
  const [{ Worker, Queue }, { db }, { getRedisConnection }, { REPO_SYNC_QUEUE }, { syncWatchedRepo }] =
    await Promise.all([
      import('bullmq'),
      import('@/db'),
      import('@/lib/queue/connection'),
      import('@/lib/queue/repoSyncQueue'),
      import('@/lib/sources/repoWatchSync'),
    ])

  async function handleSyncAll(queue: QueueType): Promise<void> {
    const repos = await db.query.watchedRepos.findMany()
    for (const repo of repos) {
      await queue.add('sync-repo', { watchedRepoId: repo.id })
    }
    console.log(`[worker] sync-all: enqueued ${repos.length} repo sync job(s)`)
  }

  const connection = getRedisConnection()
  const queue = new Queue(REPO_SYNC_QUEUE, { connection })

  // jobId makes this idempotent across worker restarts — BullMQ keys
  // repeatable jobs by (name, jobId) and won't duplicate the schedule.
  await queue.add(
    'sync-all',
    {},
    { repeat: { every: intervalHours * 60 * 60 * 1000 }, jobId: SYNC_ALL_JOB_ID },
  )

  const worker = new Worker(
    REPO_SYNC_QUEUE,
    async (job: Job) => {
      if (job.name === 'sync-all') {
        await handleSyncAll(queue)
        return
      }
      if (job.name === 'sync-repo') {
        const { watchedRepoId } = job.data as { watchedRepoId: string }
        const result = await syncWatchedRepo(watchedRepoId)
        console.log(
          `[worker] sync-repo ${watchedRepoId}: imported ${result.imported}, skipped ${result.skipped}`,
        )
        return
      }
      console.warn(`[worker] unknown job name: ${job.name}`)
    },
    { connection },
  )

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.name} (${job?.id}) failed:`, err)
  })

  console.log(`[worker] started — syncing every watched repo every ${intervalHours}h`)
}

main().catch(err => {
  console.error('[worker] fatal error:', err)
  process.exit(1)
})
