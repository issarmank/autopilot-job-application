// Syncs one watched repo: fetch its tracker README, parse the job table,
// fall back to the LLM for rows that didn't parse, filter to the repo's
// lookback window, and insert new jobs/applications — deduping against
// postings already imported (by this user or another one watching the same
// repo). Called by the BullMQ worker (src/worker.ts) on a schedule, and once
// immediately when a repo is first watched (POST /api/watched-repos).

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { jobs, applications, watchedRepos } from '@/db/schema'
import { fetchRepoJobText } from './github'
import { parseRepoJobRows, type ParsedJobRow } from './repoTable'
import { extractJobListFromText, type ExtractedJobListItem } from '@/lib/llm/extract'

interface CandidateJob {
  title       : string | null
  company     : string | null
  location    : string | null
  salaryMin   : number | null
  salaryMax   : number | null
  description : string | null
  applyUrl    : string | null
  postedAt    : Date | null
  raw         : string
}

function fromParsedRow(row: ParsedJobRow): CandidateJob {
  return {
    title       : row.title,
    company     : row.company,
    location    : row.location,
    salaryMin   : null,
    salaryMax   : null,
    description : null,
    applyUrl    : row.applyUrl,
    postedAt    : row.postedAt,
    raw         : row.raw,
  }
}

function fromLlmItem(item: ExtractedJobListItem): CandidateJob {
  return {
    title       : item.title,
    company     : item.company,
    location    : item.location,
    salaryMin   : item.salaryMin,
    salaryMax   : item.salaryMax,
    description : item.description,
    applyUrl    : item.sourceUrl,
    postedAt    : item.postedDate ? new Date(item.postedDate) : null,
    raw         : JSON.stringify(item),
  }
}

export async function syncWatchedRepo(watchedRepoId: string): Promise<{ imported: number; skipped: number }> {
  const watched = await db.query.watchedRepos.findFirst({
    where: eq(watchedRepos.id, watchedRepoId),
  })
  // Deleted between being enqueued and processed — nothing to do.
  if (!watched) return { imported: 0, skipped: 0 }

  let content
  try {
    content = await fetchRepoJobText({ owner: watched.owner, repo: watched.repo })
  } catch (err) {
    console.error(`Watched-repo sync: failed to fetch ${watched.repoUrl}:`, err)
    return { imported: 0, skipped: 0 }
  }

  const { rows, unparsed } = parseRepoJobRows(content.rawText)

  let llmCandidates: CandidateJob[] = []
  if (unparsed.length > 0) {
    try {
      const items = await extractJobListFromText(unparsed.join('\n'))
      llmCandidates = items.map(fromLlmItem)
    } catch (err) {
      // Table rows already parsed still get imported — a failed fallback
      // shouldn't sink the whole sync.
      console.error(`Watched-repo sync: LLM fallback failed for ${watched.repoUrl}:`, err)
    }
  }

  const candidates = [...rows.map(fromParsedRow), ...llmCandidates]

  const cutoff = new Date(Date.now() - watched.lookbackDays * 24 * 60 * 60 * 1000)
  const inWindow = candidates.filter(
    (c): c is CandidateJob & { applyUrl: string; postedAt: Date } =>
      c.applyUrl !== null && c.postedAt !== null && c.postedAt >= cutoff,
  )

  let imported = 0
  let skipped = 0

  for (const candidate of inWindow) {
    const existingJob = await db.query.jobs.findFirst({
      where: eq(jobs.sourceUrl, candidate.applyUrl),
    })

    if (existingJob) {
      const existingApplication = await db.query.applications.findFirst({
        where: and(
          eq(applications.jobId, existingJob.id),
          eq(applications.userId, watched.userId),
        ),
      })
      if (existingApplication) {
        skipped++
        continue
      }
      await db.insert(applications).values({ jobId: existingJob.id, userId: watched.userId })
      imported++
      continue
    }

    const [job] = await db.insert(jobs).values({
      title       : candidate.title,
      company     : candidate.company,
      location    : candidate.location,
      salaryMin   : candidate.salaryMin,
      salaryMax   : candidate.salaryMax,
      description : candidate.description,
      sourceUrl   : candidate.applyUrl,
      sourceType  : 'github',
      rawText     : candidate.raw,
    }).returning()

    await db.insert(applications).values({ jobId: job.id, userId: watched.userId })
    imported++
  }

  await db.update(watchedRepos)
    .set({ lastSyncedAt: new Date() })
    .where(eq(watchedRepos.id, watched.id))

  return { imported, skipped }
}
