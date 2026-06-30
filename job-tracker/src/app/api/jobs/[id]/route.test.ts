import { vi, describe, it, expect, beforeAll } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}))

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/db'
import { users, jobs, applications } from '@/db/schema'
import { PATCH, DELETE } from './route'

const ownerUserId  = crypto.randomUUID()
const otherUserId  = crypto.randomUUID()
const suffix       = ownerUserId.slice(0, 8)

// IDs for the single application we'll use across most tests
let applicationId: string
let jobId: string

const owner = {
  id    : ownerUserId,
  email : `owner-${suffix}@test.com`,
  name  : null as null,
  image : null as null,
}

const otherUser = {
  id    : otherUserId,
  email : `other-${suffix}@test.com`,
  name  : null as null,
  image : null as null,
}

beforeAll(async () => {
  // Create two users: the owner of the application and an unrelated user
  await db.insert(users).values([
    { id: ownerUserId, email: owner.email },
    { id: otherUserId, email: otherUser.email },
  ])

  const [job] = await db.insert(jobs).values({
    sourceUrl  : `https://example.com/job-${suffix}`,
    sourceType : 'manual',
  }).returning()

  jobId = job.id

  const [app] = await db.insert(applications).values({
    jobId  : job.id,
    userId : ownerUserId,
    stage  : 'SAVED',
  }).returning()

  applicationId = app.id
})

// Helper: params is a Promise in Next.js 15+
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePatchRequest(body: unknown) {
  return new NextRequest(`http://localhost:3000/api/jobs/${applicationId}`, {
    method  : 'PATCH',
    headers : { 'Content-Type': 'application/json' },
    body    : JSON.stringify(body),
  })
}

describe('PATCH /api/jobs/[id]', () => {
  it('returns 401 when not signed in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null)
    const res = await PATCH(makePatchRequest({ stage: 'APPLIED' }), makeParams(applicationId))
    expect(res.status).toBe(401)
  })

  it('returns 400 when stage is not a valid enum value', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(owner)
    const res = await PATCH(makePatchRequest({ stage: 'PROMOTED' }), makeParams(applicationId))
    expect(res.status).toBe(400)
  })

  it('returns 404 for a non-existent application id', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(owner)
    const res = await PATCH(makePatchRequest({ stage: 'APPLIED' }), makeParams(crypto.randomUUID()))
    expect(res.status).toBe(404)
  })

  it('returns 403 when the application belongs to a different user', async () => {
    // otherUser tries to PATCH owner's application
    vi.mocked(getCurrentUser).mockResolvedValueOnce(otherUser)
    const res = await PATCH(makePatchRequest({ stage: 'APPLIED' }), makeParams(applicationId))
    expect(res.status).toBe(403)
  })

  it('updates stage and returns the updated application', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(owner)
    const res = await PATCH(makePatchRequest({ stage: 'APPLIED' }), makeParams(applicationId))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.application.stage).toBe('APPLIED')
    expect(body.application.id).toBe(applicationId)
  })
})

describe('DELETE /api/jobs/[id]', () => {
  // Each DELETE test needs its own application since delete is destructive
  async function seedFreshApplication(forUserId: string) {
    const [job] = await db.insert(jobs).values({
      sourceUrl  : `https://example.com/delete-job-${crypto.randomUUID()}`,
      sourceType : 'manual',
    }).returning()

    const [app] = await db.insert(applications).values({
      jobId  : job.id,
      userId : forUserId,
    }).returning()

    return app
  }

  it('returns 401 when not signed in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null)
    const app = await seedFreshApplication(ownerUserId)
    const res = await DELETE(new NextRequest(`http://localhost:3000/api/jobs/${app.id}`, { method: 'DELETE' }), makeParams(app.id))
    expect(res.status).toBe(401)
  })

  it('returns 403 when the application belongs to a different user', async () => {
    const app = await seedFreshApplication(ownerUserId)
    vi.mocked(getCurrentUser).mockResolvedValueOnce(otherUser)
    const res = await DELETE(new NextRequest(`http://localhost:3000/api/jobs/${app.id}`, { method: 'DELETE' }), makeParams(app.id))
    expect(res.status).toBe(403)
  })

  it('deletes the application and returns success', async () => {
    const app = await seedFreshApplication(ownerUserId)
    vi.mocked(getCurrentUser).mockResolvedValueOnce(owner)
    const res = await DELETE(new NextRequest(`http://localhost:3000/api/jobs/${app.id}`, { method: 'DELETE' }), makeParams(app.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    // Confirm the row is actually gone
    const gone = await db.query.applications.findFirst({
      where: (a, { eq }) => eq(a.id, app.id),
    })
    expect(gone).toBeUndefined()
  })
})
