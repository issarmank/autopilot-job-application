'use client'

import { useState } from 'react'
import Link from 'next/link'
import { relDate } from '@/lib/format'

interface WatchedRepo {
  id: string
  repoUrl: string
  owner: string
  repo: string
  lookbackDays: number
  lastSyncedAt: string | null
  createdAt: string
}

interface Props {
  initialWatchedRepos: WatchedRepo[]
}

const DEFAULT_LOOKBACK_DAYS = 14

export default function WatchedRepos({ initialWatchedRepos }: Props) {
  const [repos, setRepos] = useState(initialWatchedRepos)
  const [repoUrl, setRepoUrl] = useState('')
  const [lookbackDays, setLookbackDays] = useState(DEFAULT_LOOKBACK_DAYS)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!repoUrl.trim()) return

    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/watched-repos', {
        method  : 'POST',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify({ repoUrl: repoUrl.trim(), lookbackDays }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(typeof body?.error === 'string' ? body.error : 'Could not add that repo.')
        return
      }
      const { watchedRepo } = await res.json()
      setRepos(prev => [watchedRepo, ...prev])
      setRepoUrl('')
      setLookbackDays(DEFAULT_LOOKBACK_DAYS)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id)
    const prev = repos
    setRepos(repos.filter(r => r.id !== id)) // optimistic
    try {
      const res = await fetch(`/api/watched-repos/${id}`, { method: 'DELETE' })
      if (!res.ok) setRepos(prev) // revert on failure
    } catch {
      setRepos(prev)
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="flex items-center justify-between px-6 h-14 border-b border-gray-200 bg-white">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <rect width="26" height="26" rx="7" fill="#2563eb" />
            <polyline points="7,17 11,12 14,15 19,9" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="font-bold text-[16px] tracking-tight text-slate-900">JobPilot</span>
        </Link>
        <Link href="/dashboard" className="text-[13px] font-medium text-gray-600 hover:text-gray-900">
          ← Back to dashboard
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-xl font-bold text-slate-900">Watched repos</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Point this at a job-tracker repo (e.g. one that lists internships in a
          table) and new postings from the last N days are imported
          automatically — no need to paste individual job URLs.
        </p>

        <form onSubmit={handleAdd} className="mt-6 flex items-start gap-2">
          <input
            type="text"
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            min={1}
            max={90}
            value={lookbackDays}
            onChange={e => setLookbackDays(Number(e.target.value))}
            title="Lookback window (days)"
            className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={adding || !repoUrl.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors"
          >
            {adding ? 'Adding…' : 'Watch'}
          </button>
        </form>
        {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}

        <div className="mt-8 space-y-2">
          {repos.length === 0 && (
            <p className="text-[13px] text-slate-400">No watched repos yet.</p>
          )}
          {repos.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between border border-gray-200 bg-white rounded-lg px-4 py-3"
            >
              <div>
                <a
                  href={r.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] font-semibold text-slate-900 hover:underline"
                >
                  {r.owner}/{r.repo}
                </a>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Last {r.lookbackDays} days · {r.lastSyncedAt ? `synced ${relDate(r.lastSyncedAt)}` : 'not synced yet'}
                </p>
              </div>
              <button
                onClick={() => handleRemove(r.id)}
                disabled={removingId === r.id}
                className="text-[12px] font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
