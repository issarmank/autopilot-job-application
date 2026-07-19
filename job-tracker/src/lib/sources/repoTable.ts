// Parses "tracker repo" README job tables into structured rows for the
// watched-repo sync in repoWatchSync.ts. These repos (the SimplifyJobs/
// Pitt CSC "Summer-Internships" family and forks of it) use two different
// table formats in the wild:
//   - Classic Markdown pipe tables: | Company | Role | ... | Date Posted |
//   - Raw HTML <table> markup with an "Age" column ("0d", "1mo") instead of
//     an absolute date — the current format of the flagship repo.
// Both are scanned; rows that don't fit either shape (or where no table is
// found at all) are returned as raw text in `unparsed` instead of being
// dropped — the caller sends those through the LLM extraction fallback.

export interface ParsedJobRow {
  company  : string
  title    : string | null
  location : string | null
  applyUrl : string | null
  postedAt : Date | null
  raw      : string
}

type Field = 'company' | 'title' | 'location' | 'applyUrl' | 'postedAt'

const HEADER_ALIASES: Record<string, Field> = {
  company            : 'company',
  role               : 'title',
  title              : 'title',
  position           : 'title',
  location           : 'location',
  'application/link' : 'applyUrl',
  application        : 'applyUrl',
  link               : 'applyUrl',
  apply              : 'applyUrl',
  'date posted'      : 'postedAt',
  date               : 'postedAt',
  posted             : 'postedAt',
  age                : 'postedAt', // HTML-table repos show a relative age instead of a date
}

// Postings never lead "today" by more than a bit — a header year-less date
// that lands further than this in the future almost certainly belongs to
// last year, not next year.
const FUTURE_SLACK_MS = 45 * 24 * 60 * 60 * 1000

const AGE_UNIT_MS: Record<string, number> = {
  h  : 60 * 60 * 1000,
  d  : 24 * 60 * 60 * 1000,
  mo : 30 * 24 * 60 * 60 * 1000,
  y  : 365 * 24 * 60 * 60 * 1000,
}

function canonicalField(header: string): Field | null {
  const key = header.toLowerCase().replace(/[*_]/g, '').trim()
  return HEADER_ALIASES[key] ?? null
}

function isClosed(text: string): boolean {
  return text.includes('🔒') || /\bclosed\b/i.test(text)
}

// "0d", "1d", "3mo", "1y" — relative age used by HTML-table repos.
function parseRelativeAge(text: string): Date | null {
  const match = text.trim().match(/^(\d+)\s*(h|d|mo|y)$/i)
  if (!match) return null
  const amount = Number(match[1])
  const unitMs = AGE_UNIT_MS[match[2].toLowerCase()]
  return new Date(Date.now() - amount * unitMs)
}

// "Jul 15" — year-less absolute date used by Markdown-table repos.
function parseAbsoluteDate(text: string): Date | null {
  if (!text) return null
  const now = new Date()
  const parsed = new Date(`${text} ${now.getFullYear()}`)
  if (Number.isNaN(parsed.getTime())) return null

  if (parsed.getTime() - now.getTime() > FUTURE_SLACK_MS) {
    parsed.setFullYear(parsed.getFullYear() - 1)
  }
  return parsed
}

function parsePostedCell(text: string): Date | null {
  const clean = text.trim()
  if (!clean) return null
  return parseRelativeAge(clean) ?? parseAbsoluteDate(clean)
}

interface RowFields {
  company  : string
  title    : string
  location : string
  applyUrl : string
  posted   : string
}

// Shared by both formats once each has reduced a row to plain field text —
// resolves the ↳ "same company as above" convention, skips closed listings,
// and parses the posted-date/age cell.
function finalizeRow(fields: RowFields, raw: string, lastCompany: string | null): ParsedJobRow | null {
  if (isClosed(raw)) return null

  let company = fields.company
  if (company === '' || company === '↳') {
    if (!lastCompany) return null
    company = lastCompany
  }
  if (!company) return null

  return {
    company,
    title    : fields.title || null,
    location : fields.location || null,
    applyUrl : fields.applyUrl || null,
    postedAt : fields.posted ? parsePostedCell(fields.posted) : null,
    raw,
  }
}

// ── Markdown pipe tables ────────────────────────────────────────────────

function splitMarkdownRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => c.trim())
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c))
}

function cleanMarkdownCell(cell: string): string {
  return cell
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/🔒/g, '')
    .trim()
}

function extractMarkdownUrl(cell: string): string {
  const linked = cell.match(/\((https?:\/\/[^)\s]+)\)/)
  if (linked) return linked[1]
  const bare = cell.match(/https?:\/\/[^\s|]+/)
  return bare ? bare[0] : ''
}

function parseMarkdownTables(markdown: string): { rows: ParsedJobRow[]; unparsed: string[] } {
  const lines = markdown.split('\n')
  const rows: ParsedJobRow[] = []
  const unparsed: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const headerLine = lines[i]
    if (!headerLine.includes('|')) continue

    const headerCells = splitMarkdownRow(headerLine)
    if (headerCells.length < 2) continue

    const sepLine = lines[i + 1]
    if (!sepLine || !sepLine.includes('|')) continue
    const sepCells = splitMarkdownRow(sepLine)
    if (sepCells.length !== headerCells.length || !isSeparatorRow(sepCells)) continue

    const fieldMap = headerCells.map(canonicalField)
    if (!fieldMap.includes('company')) continue // not a job table — e.g. a stats table

    let lastCompany: string | null = null
    let j = i + 2
    for (; j < lines.length; j++) {
      const rowLine = lines[j]
      if (!rowLine.includes('|')) break

      const cells = splitMarkdownRow(rowLine)
      if (isSeparatorRow(cells)) break

      const raw = cells.join(' | ')
      if (cells.length < 2) {
        unparsed.push(rowLine.trim())
        continue
      }

      const values: Partial<Record<Field, string>> = {}
      for (let k = 0; k < fieldMap.length && k < cells.length; k++) {
        const field = fieldMap[k]
        if (field) values[field] = cells[k]
      }

      const parsed = finalizeRow({
        company  : values.company ? cleanMarkdownCell(values.company) : '',
        title    : values.title ? cleanMarkdownCell(values.title) : '',
        location : values.location ? cleanMarkdownCell(values.location) : '',
        applyUrl : values.applyUrl ? extractMarkdownUrl(values.applyUrl) : '',
        posted   : values.postedAt ? cleanMarkdownCell(values.postedAt) : '',
      }, raw, lastCompany)

      if (parsed) {
        rows.push(parsed)
        lastCompany = parsed.company
      } else {
        unparsed.push(rowLine.trim())
      }
    }

    i = j - 1 // resume scanning after this table (there may be more than one)
  }

  return { rows, unparsed }
}

// ── Raw HTML <table> markup ─────────────────────────────────────────────

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// Prefers the link whose image is explicitly the "Apply" button (these repos
// often pack a second "view details" link into the same cell); falls back to
// the first href in the cell.
function extractHtmlUrl(cellHtml: string): string {
  const applyLink = cellHtml.match(/<a\s+href="([^"]+)"[^>]*>\s*<img[^>]*alt="Apply"/i)
  if (applyLink) return applyLink[1]
  const anyLink = cellHtml.match(/href="([^"]+)"/)
  return anyLink ? anyLink[1] : ''
}

function parseHtmlTables(markdown: string): { rows: ParsedJobRow[]; unparsed: string[] } {
  const rows: ParsedJobRow[] = []
  const unparsed: string[] = []

  const tableRe = /<table>([\s\S]*?)<\/table>/gi
  let tableMatch: RegExpExecArray | null
  while ((tableMatch = tableRe.exec(markdown))) {
    const tableHtml = tableMatch[1]
    const headMatch = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/i)
    const bodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i)
    if (!headMatch || !bodyMatch) continue

    const headerCells = [...headMatch[1].matchAll(/<th>([\s\S]*?)<\/th>/gi)]
      .map(m => stripHtmlTags(m[1]))
    const fieldMap = headerCells.map(canonicalField)
    if (!fieldMap.includes('company')) continue

    let lastCompany: string | null = null
    const rowRe = /<tr>([\s\S]*?)<\/tr>/gi
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRe.exec(bodyMatch[1]))) {
      const rowHtml = rowMatch[1]
      const cellsHtml = [...rowHtml.matchAll(/<td>([\s\S]*?)<\/td>/gi)].map(m => m[1])
      const raw = stripHtmlTags(rowHtml)

      if (cellsHtml.length < 2) {
        unparsed.push(raw)
        continue
      }

      const values: Partial<Record<Field, string>> = {}
      for (let k = 0; k < fieldMap.length && k < cellsHtml.length; k++) {
        const field = fieldMap[k]
        if (field) values[field] = cellsHtml[k]
      }

      const parsed = finalizeRow({
        company  : values.company ? stripHtmlTags(values.company) : '',
        title    : values.title ? stripHtmlTags(values.title) : '',
        location : values.location ? stripHtmlTags(values.location) : '',
        applyUrl : values.applyUrl ? extractHtmlUrl(values.applyUrl) : '',
        posted   : values.postedAt ? stripHtmlTags(values.postedAt) : '',
      }, raw, lastCompany)

      if (parsed) {
        rows.push(parsed)
        lastCompany = parsed.company
      } else {
        unparsed.push(raw)
      }
    }
  }

  return { rows, unparsed }
}

export function parseRepoJobRows(markdown: string): { rows: ParsedJobRow[]; unparsed: string[] } {
  const md = parseMarkdownTables(markdown)
  const html = parseHtmlTables(markdown)
  return {
    rows     : [...md.rows, ...html.rows],
    unparsed : [...md.unparsed, ...html.unparsed],
  }
}
