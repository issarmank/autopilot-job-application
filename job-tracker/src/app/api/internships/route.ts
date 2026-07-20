import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { searchAdzunaJobs } from '@/lib/sources/adzuna'
import { rankInternshipListings } from '@/lib/llm/extract'

const querySchema = z.object({
  role         : z.string().min(1),
  positionType : z.string().optional(),
  location     : z.string().optional(),
})

// Below this score the LLM judged the listing a poor match for the stated
// preferences — filtered out rather than shown at the bottom of the list.
const MIN_MATCH_SCORE = 40

// Descriptions only need to be long enough for the ranking model to judge
// fit — capping keeps the batched ranking payload well under the extraction
// call's truncation limit even with a full page of results.
const DESCRIPTION_PREVIEW_LENGTH = 300

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const result = querySchema.safeParse({
    role         : searchParams.get('role') ?? '',
    positionType : searchParams.get('positionType') || undefined,
    location     : searchParams.get('location') || undefined,
  })
  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 })
  }

  const { role, positionType, location } = result.data

  try {
    const what = positionType ? `${role} ${positionType}` : role
    const listings = await searchAdzunaJobs({ what, where: location, resultsPerPage: 30 })

    if (listings.length === 0) {
      return Response.json({ listings: [] })
    }

    const rankInput = listings.map((listing, id) => ({
      id,
      title       : listing.title,
      company     : listing.company,
      location    : listing.location,
      description : listing.description?.slice(0, DESCRIPTION_PREVIEW_LENGTH) ?? null,
    }))

    const rankings = await rankInternshipListings(rankInput, {
      role,
      positionType : positionType ?? 'internship',
      location     : location ?? 'any',
    })
    const rankById = new Map(rankings.map(r => [r.id, r]))

    const ranked = listings
      .map((listing, id) => ({
        ...listing,
        matchScore  : rankById.get(id)?.score ?? 0,
        matchReason : rankById.get(id)?.reason ?? '',
      }))
      .filter(l => l.matchScore >= MIN_MATCH_SCORE)
      .sort((a, b) => b.matchScore - a.matchScore)

    return Response.json({ listings: ranked })
  } catch (err) {
    console.error('Failed to fetch internship recommendations:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
