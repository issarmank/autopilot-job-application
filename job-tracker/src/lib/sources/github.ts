// GitHub source: given a repo URL, fetch the markdown most likely to describe
// a job posting via the official REST API. No scraping — see CLAUDE.md.

const GITHUB_API = 'https://api.github.com'

// Priority order for repo content. First file that exists wins; if none do,
// the repo description is the fallback.
const FILE_CANDIDATES = ['JOBS.md', 'jobs.md', 'README.md', 'readme.md']

export interface RepoRef {
  owner: string
  repo: string
}

export interface RepoJobText {
  rawText: string
  // Which file the text came from, or 'description' for the repo-description fallback
  fetchedFrom: string
  // Canonical repo URL to store as the job's sourceUrl
  repoUrl: string
}

// Accepts any github.com repo URL shape (with or without protocol, trailing
// paths like /tree/main, .git suffix) and returns the owner/repo pair.
export function parseRepoUrl(url: string): RepoRef | null {
  const match = url.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/)
  if (!match) return null
  const owner = match[1]
  const repo = match[2].replace(/\.git$/, '')
  // Reserved top-level paths that look like owner names but aren't repos
  if (['orgs', 'topics', 'collections', 'sponsors', 'marketplace', 'settings'].includes(owner)) {
    return null
  }
  return { owner, repo }
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    // raw+json returns the file body directly — no base64 decoding step
    'Accept'               : 'application/vnd.github.raw+json',
    'X-GitHub-Api-Version' : '2022-11-28',
  }
  // Optional: 5000 req/hour with a token vs 60 without
  const token = process.env.GITHUB_TOKEN
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function fetchRepoFile(ref: RepoRef, path: string): Promise<string | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${ref.owner}/${ref.repo}/contents/${path}`,
    { headers: githubHeaders() },
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}) fetching ${path}`)
  }
  const text = await res.text()
  return text.trim() ? text : null
}

async function fetchRepoDescription(ref: RepoRef): Promise<string | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${ref.owner}/${ref.repo}`,
    { headers: { ...githubHeaders(), Accept: 'application/vnd.github+json' } },
  )
  if (res.status === 404) {
    throw new Error(`Repository ${ref.owner}/${ref.repo} not found`)
  }
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}) fetching repo metadata`)
  }
  const data: unknown = await res.json()
  const description =
    typeof data === 'object' && data !== null && 'description' in data
      ? (data as { description: unknown }).description
      : null
  return typeof description === 'string' && description.trim() ? description : null
}

// Walks the candidate files in priority order, falling back to the repo
// description when the repo has no usable markdown at all.
export async function fetchRepoJobText(ref: RepoRef): Promise<RepoJobText> {
  const repoUrl = `https://github.com/${ref.owner}/${ref.repo}`

  for (const path of FILE_CANDIDATES) {
    const text = await fetchRepoFile(ref, path)
    if (text) return { rawText: text, fetchedFrom: path, repoUrl }
  }

  const description = await fetchRepoDescription(ref)
  if (description) {
    return { rawText: description, fetchedFrom: 'description', repoUrl }
  }

  throw new Error(
    `No JOBS.md, README.md, or description found in ${ref.owner}/${ref.repo}`,
  )
}
