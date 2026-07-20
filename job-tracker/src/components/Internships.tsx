'use client'

import { useState } from 'react'
import Link from 'next/link'
import { fmtSalary } from '@/lib/format'

interface Listing {
  title       : string | null
  company     : string | null
  location    : string | null
  description : string | null
  sourceUrl   : string
  salaryMin   : number | null
  salaryMax   : number | null
  postedDate  : string | null
  matchScore  : number
  matchReason : string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function Internships() {
  const [role, setRole] = useState('')
  const [positionType, setPositionType] = useState('Internship')
  const [location, setLocation] = useState('')
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!role.trim()) return

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ role: role.trim() })
      if (positionType.trim()) params.set('positionType', positionType.trim())
      if (location.trim()) params.set('location', location.trim())

      const res = await fetch(`/api/internships?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(typeof body?.error === 'string' ? body.error : 'Could not fetch recommendations.')
        setListings(null)
        return
      }
      const { listings: results } = await res.json()
      setListings(results)
      setSaveStates({})
    } catch {
      setError('Could not reach the server.')
      setListings(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(listing: Listing) {
    setSaveStates(prev => ({ ...prev, [listing.sourceUrl]: 'saving' }))
    try {
      const res = await fetch('/api/jobs/save', {
        method  : 'POST',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify({
          title       : listing.title,
          company     : listing.company,
          location    : listing.location,
          description : listing.description,
          salaryMin   : listing.salaryMin,
          salaryMax   : listing.salaryMax,
          sourceUrl   : listing.sourceUrl,
          sourceType  : 'adzuna',
        }),
      })
      setSaveStates(prev => ({ ...prev, [listing.sourceUrl]: res.ok ? 'saved' : 'error' }))
    } catch {
      setSaveStates(prev => ({ ...prev, [listing.sourceUrl]: 'error' }))
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

      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-xl font-bold text-slate-900">Internship recommendations</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Set your preferences and we&apos;ll pull recent listings from Adzuna and rank them
          by fit before showing them to you.
        </p>

        <form onSubmit={handleSearch} className="mt-6 flex flex-wrap items-start gap-2">
          <input
            type="text"
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="Role (e.g. software engineering)"
            className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={positionType}
            onChange={e => setPositionType(e.target.value)}
            placeholder="Position type"
            className="w-40 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="w-48 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !role.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors"
          >
            {loading ? 'Searching…' : 'Find internships'}
          </button>
        </form>
        {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}

        {listings !== null && (
          <div className="mt-8">
            {listings.length === 0 ? (
              <p className="text-[13px] text-slate-400">No matching internships found — try broadening your preferences.</p>
            ) : (
              <div className="space-y-2">
                {listings.map(listing => {
                  const saveState = saveStates[listing.sourceUrl] ?? 'idle'
                  return (
                    <div
                      key={listing.sourceUrl}
                      className="flex items-start justify-between border border-gray-200 bg-white rounded-lg px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <a
                            href={listing.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[13px] font-semibold text-slate-900 hover:underline"
                          >
                            {listing.title ?? 'Untitled role'}
                          </a>
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex-shrink-0">
                            {listing.matchScore}% match
                          </span>
                        </div>
                        <p className="text-[12px] text-slate-500 mt-0.5">
                          {listing.company ?? 'Unknown company'} · {listing.location ?? 'Location unknown'} · {fmtSalary(listing.salaryMin, listing.salaryMax)}
                        </p>
                        {listing.matchReason && (
                          <p className="text-[12px] text-slate-400 mt-1 italic">{listing.matchReason}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleSave(listing)}
                        disabled={saveState === 'saving' || saveState === 'saved'}
                        className="flex-shrink-0 ml-3 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                      >
                        {saveState === 'saving' && 'Saving…'}
                        {saveState === 'saved' && 'Saved ✓'}
                        {saveState === 'error' && 'Retry'}
                        {saveState === 'idle' && 'Save'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
