import IORedis from 'ioredis'

// Shared Redis connection for the repo-sync queue — one per process. BullMQ
// requires maxRetriesPerRequest: null on connections used by its Queue/Worker.
let connection: IORedis | null = null

export function getRedisConnection(): IORedis {
  if (!connection) {
    const url = process.env.REDIS_URL
    if (!url) {
      throw new Error('REDIS_URL is not set')
    }
    connection = new IORedis(url, { maxRetriesPerRequest: null })
  }
  return connection
}
