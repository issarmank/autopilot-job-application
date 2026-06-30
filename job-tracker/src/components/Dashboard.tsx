'use client'

import { useState, useCallback } from 'react'
import { signOut } from 'next-auth/react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = 'SAVED' | 'APPLIED' | 'PHONE_SCREEN' | 'INTERVIEW' | 'OFFER' | 'REJECTED'
type SourceType = 'linkedin' | 'github' | 'manual'

interface Job {
  id: string
  title: string | null
  company: string | null
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  sourceUrl: string
  sourceType: SourceType
  createdAt: string
}

interface Application {
  id: string
  stage: Stage
  createdAt: string
  job: Job
}

interface User {
  id: string
  name: string | null
  email: string
  image: string | null
}

interface Props {
  user: User
  initialApplications: Application[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES: Stage[] = ['SAVED', 'APPLIED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'REJECTED']

const STAGE_LABELS: Record<Stage, string> = {
  SAVED: 'Saved',
  APPLIED: 'Applied',
  PHONE_SCREEN: 'Phone Screen',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
}

const STAGE_COLORS: Record<Stage, { bg: string; text: string }> = {
  SAVED:        { bg: '#f1f5f9', text: '#64748b' },
  APPLIED:      { bg: '#dbeafe', text: '#1d4ed8' },
  PHONE_SCREEN: { bg: '#fef9c3', text: '#92400e' },
  INTERVIEW:    { bg: '#ffedd5', text: '#c2410c' },
  OFFER:        { bg: '#dcfce7', text: '#15803d' },
  REJECTED:     { bg: '#fee2e2', text: '#b91c1c' },
}

const STAGE_DOTS: Record<Stage, string> = {
  SAVED: '#94a3b8',
  APPLIED: '#3b82f6',
  PHONE_SCREEN: '#f59e0b',
  INTERVIEW: '#f97316',
  OFFER: '#22c55e',
  REJECTED: '#ef4444',
}

const SOURCE_LABELS: Record<SourceType, string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  manual: 'Manual',
}

const SOURCE_COLORS: Record<SourceType, { bg: string; text: string }> = {
  linkedin: { bg: '#e0f2fe', text: '#0369a1' },
  github:   { bg: '#f1f5f9', text: '#475569' },
  manual:   { bg: '#f5f3ff', text: '#6d28d9' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relDate(dateStr: string): string {
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  if (d < 14) return '1 week ago'
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`
  return `${Math.floor(d / 30)} mo. ago`
}

function fmtSalary(min: number | null, max: number | null): string {
  if (!min && !max) return '—'
  const f = (n: number) => `$${Math.round(n / 1000)}k`
  if (min && max) return `${f(min)}–${f(max)}`
  return min ? `${f(min)}+` : f(max!)
}

function initials(name: string | null, email: string): string {
  return (name ?? email).slice(0, 2).toUpperCase()
}

// ─── Small components ─────────────────────────────────────────────────────────

function StagePill({ stage }: { stage: Stage }) {
  const { bg, text } = STAGE_COLORS[stage]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      background: bg, color: text, whiteSpace: 'nowrap',
    }}>
      {STAGE_LABELS[stage]}
    </span>
  )
}

function SourcePill({ source }: { source: SourceType }) {
  const { bg, text } = SOURCE_COLORS[source]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 999,
      fontSize: 11, fontWeight: 500,
      background: bg, color: text,
    }}>
      {SOURCE_LABELS[source]}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Dashboard({ user, initialApplications }: Props) {
  const [apps, setApps] = useState<Application[]>(initialApplications)
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null)
  const [selectedSource, setSelectedSource] = useState<SourceType | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortCol, setSortCol] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [stageMenuId, setStageMenuId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [addForm, setAddForm] = useState({
    title: '', company: '', location: '',
    salaryMin: '', salaryMax: '',
    stage: 'SAVED' as Stage,
    source: 'manual' as SourceType,
    url: '',
  })

  // Refetch after mutations
  const refetch = useCallback(async () => {
    const res = await fetch('/api/jobs')
    if (res.ok) {
      const data = await res.json()
      setApps(data.applications ?? [])
    }
  }, [])

  // ── Filtering & sorting ──────────────────────────────────────────────────

  const filtered = apps
    .filter(a => {
      if (selectedStage && a.stage !== selectedStage) return false
      if (selectedSource && a.job.sourceType !== selectedSource) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const inTitle = a.job.title?.toLowerCase().includes(q) ?? false
        const inCompany = a.job.company?.toLowerCase().includes(q) ?? false
        if (!inTitle && !inCompany) return false
      }
      return true
    })
    .sort((a, b) => {
      let va: string | number | null | undefined
      let vb: string | number | null | undefined
      switch (sortCol) {
        case 'title':     va = a.job.title;     vb = b.job.title;     break
        case 'company':   va = a.job.company;   vb = b.job.company;   break
        case 'salary':    va = a.job.salaryMin; vb = b.job.salaryMin; break
        case 'stage':     va = a.stage;         vb = b.stage;         break
        default:          va = a.createdAt;     vb = b.createdAt;     break
      }
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va == null) return 1
      if (vb == null) return -1
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  // ── Counts ───────────────────────────────────────────────────────────────

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s] = apps.filter(a => a.stage === s).length
    return acc
  }, {} as Record<Stage, number>)

  const sourceCounts: Record<SourceType, number> = {
    linkedin: apps.filter(a => a.job.sourceType === 'linkedin').length,
    github:   apps.filter(a => a.job.sourceType === 'github').length,
    manual:   apps.filter(a => a.job.sourceType === 'manual').length,
  }

  // ── Sort helpers ─────────────────────────────────────────────────────────

  function handleSort(col: string) {
    setSortDir(sortCol === col && sortDir === 'asc' ? 'desc' : 'asc')
    setSortCol(col)
  }

  function sortArrow(col: string) {
    if (sortCol !== col) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setOpenMenuId(null)
    setApps(prev => prev.filter(a => a.id !== id))
    await fetch(`/api/jobs/${id}`, { method: 'DELETE' })
  }

  async function handleEditStage(id: string, stage: Stage) {
    setStageMenuId(null)
    setApps(prev => prev.map(a => a.id === id ? { ...a, stage } : a))
    await fetch(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
  }

  async function handleAddJob() {
    if (!addForm.title || !addForm.company || !addForm.url) return
    const res = await fetch('/api/jobs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:      addForm.title,
        company:    addForm.company,
        location:   addForm.location || 'Remote',
        salaryMin:  addForm.salaryMin ? parseInt(addForm.salaryMin) * 1000 : null,
        salaryMax:  addForm.salaryMax ? parseInt(addForm.salaryMax) * 1000 : null,
        sourceUrl:  addForm.url,
        sourceType: addForm.source,
      }),
    })
    if (res.ok) {
      setShowAddModal(false)
      setAddForm({ title: '', company: '', location: '', salaryMin: '', salaryMax: '', stage: 'SAVED', source: 'manual', url: '' })
      await refetch()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const hasOpenMenu = !!(openMenuId || stageMenuId || showUserMenu)

  return (
    <div className="flex flex-col h-screen bg-white" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>

      {/* Dismiss backdrop */}
      {hasOpenMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => { setOpenMenuId(null); setStageMenuId(null); setShowUserMenu(false) }}
        />
      )}

      {/* ── Navbar ────────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 h-14 border-b border-gray-200 bg-white flex-shrink-0 relative z-20">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <rect width="26" height="26" rx="7" fill="#2563eb" />
            <polyline points="7,17 11,12 14,15 19,9" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="font-bold text-[16px] tracking-tight text-slate-900">JobPilot</span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => { setShowAddModal(true); setShowUserMenu(false) }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="1" x2="6" y2="11" />
              <line x1="1" y1="6" x2="11" y2="6" />
            </svg>
            Add Job
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setShowUserMenu(v => !v); setOpenMenuId(null); setStageMenuId(null) }}
              className="flex items-center gap-2 border border-gray-200 rounded-lg py-1.5 pl-2 pr-3 hover:bg-slate-50 transition-colors"
            >
              {user.image ? (
                <img src={user.image} className="w-7 h-7 rounded-full" alt={user.name ?? ''} />
              ) : (
                <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-700 flex-shrink-0">
                  {initials(user.name, user.email)}
                </div>
              )}
              <span className="text-[13px] font-medium text-gray-700">{user.name ?? user.email}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3.5l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {showUserMenu && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute right-0 top-[calc(100%+8px)] bg-white border border-gray-200 rounded-xl shadow-lg z-[100] min-w-[160px] p-1"
              >
                <button
                  onClick={() => signOut({ callbackUrl: '/auth' })}
                  className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-gray-700 rounded-md hover:bg-gray-100 transition-colors text-left">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-48 flex-shrink-0 border-r border-gray-200 px-2.5 py-3.5 bg-gray-50 flex flex-col gap-0.5 overflow-y-auto">

          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 pb-2">Stage</p>

          {/* All stages */}
          <SidebarBtn
            label="All stages" count={apps.length} active={!selectedStage}
            onClick={() => setSelectedStage(null)}
          />
          {STAGES.map(s => (
            <SidebarBtn
              key={s}
              label={STAGE_LABELS[s]}
              count={stageCounts[s]}
              active={selectedStage === s}
              dot={STAGE_DOTS[s]}
              onClick={() => setSelectedStage(prev => prev === s ? null : s)}
            />
          ))}

          <div className="h-px bg-gray-200 my-2.5 mx-0.5" />

          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 pb-2">Source</p>

          <SidebarBtn
            label="All sources" count={apps.length} active={!selectedSource}
            onClick={() => setSelectedSource(null)}
          />
          {(['linkedin', 'github', 'manual'] as SourceType[]).map(src => (
            <SidebarBtn
              key={src}
              label={SOURCE_LABELS[src]}
              count={sourceCounts[src]}
              active={selectedSource === src}
              onClick={() => setSelectedSource(prev => prev === src ? null : src)}
            />
          ))}
        </aside>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">

          {/* Search bar */}
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 flex-shrink-0">
            <div className="relative max-w-[300px] w-full">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c0c8d2" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search by title or company…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-8 pr-3 border border-gray-200 rounded-lg text-[13px] text-gray-700 bg-slate-50 outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
            </div>
            <span className="text-[12px] text-slate-400 ml-auto whitespace-nowrap">
              {filtered.length} {filtered.length === 1 ? 'application' : 'applications'}
            </span>
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="5" y="3" width="14" height="18" rx="2" />
                  <path d="M9 7h6M9 11h6M9 15h4" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-[15px] text-gray-700 mb-1">No applications yet</p>
                <p className="text-[13px] text-slate-400 max-w-[260px]">Add your first job to start tracking your search.</p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 text-[13px] font-semibold mt-1 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                  <line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" />
                </svg>
                Add your first job
              </button>
            </div>
          )}

          {/* Table */}
          {filtered.length > 0 && (
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {[
                      { key: 'title',   label: 'Role & Company' },
                      { key: 'salary',  label: 'Salary' },
                      { key: 'stage',   label: 'Stage' },
                    ].map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className="px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest border-b border-gray-200 bg-gray-50 sticky top-0 cursor-pointer whitespace-nowrap select-none"
                        style={{ color: sortCol === col.key ? '#2563eb' : '#64748b' }}
                      >
                        {col.label}{sortArrow(col.key)}
                      </th>
                    ))}
                    <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest border-b border-gray-200 bg-gray-50 sticky top-0">
                      URL
                    </th>
                    <th
                      onClick={() => handleSort('createdAt')}
                      className="px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest border-b border-gray-200 bg-gray-50 sticky top-0 cursor-pointer whitespace-nowrap select-none"
                      style={{ color: sortCol === 'createdAt' ? '#2563eb' : '#64748b' }}
                    >
                      Saved{sortArrow('createdAt')}
                    </th>
                    <th className="border-b border-gray-200 bg-gray-50 sticky top-0 w-11" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(app => (
                    <tr key={app.id} className="border-b border-gray-100 hover:bg-slate-50 transition-colors">

                      {/* Role & Company */}
                      <td className="px-3.5 py-3 align-middle min-w-[220px]">
                        <div className="font-semibold text-[13px] text-slate-900">{app.job.title ?? '—'}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[12px] text-slate-400">
                            {[app.job.company, app.job.location].filter(Boolean).join(' · ')}
                          </span>
                          <SourcePill source={app.job.sourceType} />
                        </div>
                      </td>

                      {/* Salary */}
                      <td className="px-3.5 py-3 align-middle text-[13px] text-gray-700 whitespace-nowrap font-mono">
                        {fmtSalary(app.job.salaryMin, app.job.salaryMax)}
                      </td>

                      {/* Stage */}
                      <td className="px-3.5 py-3 align-middle whitespace-nowrap">
                        <StagePill stage={app.stage} />
                      </td>

                      {/* URL */}
                      <td className="px-3.5 py-3 align-middle">
                        <a
                          href={app.job.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12px] text-blue-600 hover:underline whitespace-nowrap"
                        >
                          View Posting ↗
                        </a>
                      </td>

                      {/* Saved date */}
                      <td className="px-3.5 py-3 align-middle text-[12px] text-slate-400 whitespace-nowrap">
                        {relDate(app.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 pr-2.5 align-middle text-right w-11">
                        <div className="relative inline-block">
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setOpenMenuId(openMenuId === app.id ? null : app.id)
                              setStageMenuId(null)
                              setShowUserMenu(false)
                            }}
                            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-[15px] tracking-widest"
                          >
                            ···
                          </button>

                          {/* Actions dropdown */}
                          {openMenuId === app.id && (
                            <div
                              onClick={e => e.stopPropagation()}
                              className="absolute right-0 top-[calc(100%+4px)] bg-white border border-gray-200 rounded-xl shadow-xl z-[100] min-w-[156px] p-1"
                            >
                              <button
                                onClick={() => { setStageMenuId(app.id); setOpenMenuId(null) }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-gray-700 rounded-md hover:bg-gray-100 transition-colors text-left"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round">
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z" />
                                </svg>
                                Edit Stage
                              </button>
                              <div className="h-px bg-gray-100 my-1 mx-2" />
                              <button
                                onClick={() => handleDelete(app.id)}
                                className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-red-500 rounded-md hover:bg-red-50 transition-colors text-left"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                                </svg>
                                Delete
                              </button>
                            </div>
                          )}

                          {/* Stage picker */}
                          {stageMenuId === app.id && (
                            <div
                              onClick={e => e.stopPropagation()}
                              className="absolute right-0 top-[calc(100%+4px)] bg-white border border-gray-200 rounded-xl shadow-xl z-[100] min-w-[172px] p-1"
                            >
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 pt-2 pb-1">
                                Move to stage
                              </p>
                              {STAGES.map(s => (
                                <button
                                  key={s}
                                  onClick={() => handleEditStage(app.id, s)}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] rounded-md hover:bg-blue-50 transition-colors text-left"
                                  style={{
                                    fontWeight: app.stage === s ? 600 : 400,
                                    color: app.stage === s ? '#1d4ed8' : '#374151',
                                    background: app.stage === s ? '#eff6ff' : 'transparent',
                                  }}
                                >
                                  <span style={{
                                    width: 7, height: 7, borderRadius: '50%',
                                    background: STAGE_DOTS[s],
                                    display: 'inline-block', flexShrink: 0,
                                  }} />
                                  {STAGE_LABELS[s]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Add Job Modal ──────────────────────────────────────────────────── */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-slate-900/35 z-[200] flex items-center justify-center"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-[16px] text-slate-900 tracking-tight">Add Job</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">Track a new application</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-gray-100 hover:text-gray-600 text-xl transition-colors"
              >×</button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Job Title *">
                  <input type="text" value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Senior Designer" className={inputCls} />
                </Field>
                <Field label="Company *">
                  <input type="text" value={addForm.company} onChange={e => setAddForm(f => ({ ...f, company: e.target.value }))} placeholder="e.g. Stripe" className={inputCls} />
                </Field>
              </div>

              <Field label="Location">
                <input type="text" value={addForm.location} onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))} placeholder="Remote or City, State" className={inputCls} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Min Salary (k)">
                  <input type="number" value={addForm.salaryMin} onChange={e => setAddForm(f => ({ ...f, salaryMin: e.target.value }))} placeholder="120" className={inputCls} />
                </Field>
                <Field label="Max Salary (k)">
                  <input type="number" value={addForm.salaryMax} onChange={e => setAddForm(f => ({ ...f, salaryMax: e.target.value }))} placeholder="160" className={inputCls} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Stage">
                  <select value={addForm.stage} onChange={e => setAddForm(f => ({ ...f, stage: e.target.value as Stage }))} className={selectCls}>
                    {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                  </select>
                </Field>
                <Field label="Source">
                  <select value={addForm.source} onChange={e => setAddForm(f => ({ ...f, source: e.target.value as SourceType }))} className={selectCls}>
                    <option value="linkedin">LinkedIn</option>
                    <option value="github">GitHub</option>
                    <option value="manual">Manual</option>
                  </select>
                </Field>
              </div>

              <Field label="Posting URL *">
                <input type="url" value={addForm.url} onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))} placeholder="https://…" className={inputCls} />
              </Field>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddJob}
                disabled={!addForm.title || !addForm.company || !addForm.url}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-[13px] font-semibold transition-colors"
              >
                Add Job
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Mini helpers ─────────────────────────────────────────────────────────────

const inputCls = 'h-9 w-full px-3 border border-gray-200 rounded-lg text-[13px] text-gray-900 outline-none focus:border-blue-500 transition-colors bg-white'
const selectCls = 'h-9 w-full px-3 border border-gray-200 rounded-lg text-[13px] text-gray-700 bg-white outline-none focus:border-blue-500 transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function SidebarBtn({
  label, count, active, dot, onClick,
}: {
  label: string; count: number; active: boolean; dot?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-left transition-colors"
      style={{ background: active ? '#eff6ff' : 'transparent' }}
    >
      <span
        className="flex items-center gap-1.5 text-[12px]"
        style={{ fontWeight: active ? 500 : 400, color: active ? '#1d4ed8' : '#374151' }}
      >
        {dot && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
        )}
        {label}
      </span>
      <span
        className="text-[11px] font-semibold px-1.5 rounded-full flex-shrink-0"
        style={{ color: active ? '#1d4ed8' : '#94a3b8', background: active ? '#dbeafe' : '#f1f5f9' }}
      >
        {count}
      </span>
    </button>
  )
}
