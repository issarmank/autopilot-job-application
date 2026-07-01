# Job Application Tracker

A personal job-application tracker with a list/table-based pipeline UI. Save job
listings from LinkedIn (via a browser extension) or GitHub repos (via the GitHub
REST API), and move applications through stages: **Saved → Applied → Phone
Screen → Interview → Offer / Rejected**.

> See [CLAUDE.md](../CLAUDE.md) for the full architecture reference, locked
> tech decisions, and build-phase scope.

## Tech stack

- **Framework:** Next.js 14 (App Router) + TypeScript (strict)
- **ORM / DB:** Drizzle ORM + PostgreSQL
- **Validation:** Zod
- **Auth:** Auth.js v5 (GitHub OAuth, Google OAuth, email/password)
- **Styling:** Tailwind CSS + shadcn/ui
- **Server state:** TanStack Query
- **Background jobs:** BullMQ + Redis
- **Email:** Resend + React Email
- **LLM extraction:** Anthropic `claude-haiku-4-5-20251001` (GitHub job postings)

## Getting started

### Prerequisites

- Node.js and npm
- Docker (for local Postgres + Redis)

### Setup

```bash
# 1. Start Postgres and Redis
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Copy and fill env vars
cp .env.example .env.local

# 4. Run migrations
npx drizzle-kit migrate

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Environment variables

See [.env.example](.env.example) for the full list, including database,
Auth.js, GitHub API, Anthropic, Redis, and Resend credentials.

## Project structure

```
job-tracker/
├── src/
│   ├── app/              # Next.js App Router (pages, layouts, API routes)
│   ├── components/       # Dashboard UI + shadcn/ui components
│   ├── db/                # Drizzle client singleton + schema (source of truth)
│   └── lib/               # Auth config, utilities, scrapers
├── drizzle/                # Generated migration SQL (committed)
├── drizzle.config.ts
├── docker-compose.yml      # Local Postgres + Redis
└── vitest.config.ts
```

## Database schema changes

After editing `src/db/schema.ts`:

```bash
npx drizzle-kit generate    # creates a new SQL migration file
npx drizzle-kit migrate     # applies pending migrations
```

Always commit `schema.ts` and the generated `/drizzle/*.sql` file together.

## Data sources

- **LinkedIn** — browser extension reads the DOM in the user's authenticated
  session and posts the extracted job to `POST /api/jobs/save`. Server-side
  scraping is not supported (blocked by LinkedIn).
- **GitHub repos** — paste a repo URL; the server fetches `JOBS.md` /
  `README.md` via the GitHub REST API and uses an LLM to extract structured
  job fields.

## Build phases

- **Phase 1 — Plain CRUD:** ✅ complete. Manual job entry, stage management,
  dashboard table UI, auth.
- **Phase 2 — Data sources:** in progress. LinkedIn browser extension +
  GitHub REST API integration.

Phases beyond Phase 2 are out of scope until explicitly planned.
