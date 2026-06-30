// vi.mock is hoisted to the top by Vitest — it runs before any import,
// so the route handler that imports getCurrentUser will get our fake version.
import { vi, describe, it, expect, beforeAll } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}))

import { getCurrentUser } from '@/lib/auth'
import { db } from '@/db'
import { users, jobs, applications } from '@/db/schema'
import { GET } from './route'

// Seed two users once for the whole file. Unique emails avoid conflicts with
// other test runs since we don't tear down (personal project, dev DB only).
const userAId = crypto.randomUUID()
const userBId = crypto.randomUUID()
const suffix  = userAId.slice(0, 8)

beforeAll(async () => {
  await db.insert(users).values([
    { id: userAId, email: `user-a-${suffix}@test.com` },
    { id: userBId, email: `user-b-${suffix}@test.com` },
  ])

  // Create one job each and link to an application
  const [jobA] = await db.insert(jobs).values({
    sourceUrl  : 'https://example.com/jobA',
    sourceType : 'manual',
  }).returning()

  const [jobB] = await db.insert(jobs).values({
    sourceUrl  : 'https://example.com/jobB',
    sourceType : 'manual',
  }).returning()

  await db.insert(applications).values([
    { jobId: jobA.id, userId: userAId },
    { jobId: jobB.id, userId: userBId },
  ])
})

describe('GET /api/jobs', () => {
  it('returns 401 when not signed in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null)

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns only the current user\'s applications (not other users\')', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id    : userAId,
      email : `user-a-${suffix}@test.com`,
      name  : null,
      image : null,
    })

    const res = await GET()
    expect(res.status).toBe(200)

    const body = await res.json()
    // User A must only see their own application
    expect(body.applications).toHaveLength(1)
    expect(body.applications[0].userId).toBe(userAId)
    // The joined job data must be present
    expect(body.applications[0].job).toBeDefined()
    expect(body.applications[0].job.sourceUrl).toBe('https://example.com/jobA')
  })
})
