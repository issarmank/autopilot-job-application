import { vi, describe, it, expect, beforeAll } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}))

import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/db'
import { users, applications } from '@/db/schema'
import { POST } from './route'

const userId = crypto.randomUUID()
const suffix  = userId.slice(0, 8)

beforeAll(async () => {
  await db.insert(users).values({
    id    : userId,
    email : `save-user-${suffix}@test.com`,
  })
})

// Helper: build a POST request with a JSON body
function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/jobs/save', {
    method  : 'POST',
    headers : { 'Content-Type': 'application/json' },
    body    : JSON.stringify(body),
  })
}

describe('POST /api/jobs/save', () => {
  it('returns 401 when not signed in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null)

    const res = await POST(makeRequest({ sourceUrl: 'https://example.com', sourceType: 'manual' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when sourceUrl is missing', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: userId, email: `save-user-${suffix}@test.com`, name: null, image: null,
    })

    // sourceUrl is required — omitting it should fail Zod validation
    const res = await POST(makeRequest({ sourceType: 'manual' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 400 when sourceType is not a valid enum value', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: userId, email: `save-user-${suffix}@test.com`, name: null, image: null,
    })

    const res = await POST(makeRequest({
      sourceUrl  : 'https://example.com/job',
      sourceType : 'invalid-type',   // not in enum
    }))
    expect(res.status).toBe(400)
  })

  it('creates job + application and returns jobId on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: userId, email: `save-user-${suffix}@test.com`, name: null, image: null,
    })

    const res = await POST(makeRequest({
      title      : 'Senior Engineer',
      company    : 'Acme Co',
      sourceUrl  : `https://example.com/job-${suffix}`,
      sourceType : 'manual',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(typeof body.jobId).toBe('string')

    // Verify the application row was actually written to the DB
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.jobId, body.jobId))

    expect(app).toBeDefined()
    expect(app.userId).toBe(userId)
    expect(app.stage).toBe('SAVED')
  })
})
