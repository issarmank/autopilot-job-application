import { Queue } from 'bullmq'
import { getRedisConnection } from './connection'

export const REPO_SYNC_QUEUE = 'repo-sync'

// Job names processed by the worker (src/worker.ts):
// 'sync-all'  — fans out a 'sync-repo' job for every watched repo
// 'sync-repo' — syncs a single watched repo, given its id
export type SyncAllJob = { name: 'sync-all'; data: Record<string, never> }
export type SyncRepoJob = { name: 'sync-repo'; data: { watchedRepoId: string } }

let queue: Queue | null = null

function getRepoSyncQueue(): Queue {
  if (!queue) {
    queue = new Queue(REPO_SYNC_QUEUE, { connection: getRedisConnection() })
  }
  return queue
}

// Enqueues an immediate one-off sync for a single repo — used right after a
// repo is added so the user doesn't have to wait for the next scheduled run.
export async function enqueueRepoSync(watchedRepoId: string): Promise<void> {
  await getRepoSyncQueue().add('sync-repo', { watchedRepoId })
}
