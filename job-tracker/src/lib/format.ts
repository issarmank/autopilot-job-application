// Shared formatting helpers used by Dashboard.tsx, WatchedRepos.tsx, and Internships.tsx.

export function relDate(dateStr: string): string {
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  if (d < 14) return '1 week ago'
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`
  return `${Math.floor(d / 30)} mo. ago`
}

export function fmtSalary(min: number | null, max: number | null): string {
  if (!min && !max) return '—'
  const f = (n: number) => `$${Math.round(n / 1000)}k`
  if (min && max) return `${f(min)}–${f(max)}`
  return min ? `${f(min)}+` : f(max!)
}
