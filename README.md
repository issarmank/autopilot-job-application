# Job Application Tracker

<img width="2918" height="1210" alt="image" src="https://github.com/user-attachments/assets/7d8c4a27-530b-4025-842d-66faa508f3cc" />
<img width="1812" height="1360" alt="image" src="https://github.com/user-attachments/assets/9381bb37-a706-4c89-a6f6-c086bc9d5904" />


A personal job-application tracker with a list/table-based pipeline UI. Save job
listings from GitHub repos (via the GitHub REST API) or any job site (via a
universal apply-capture browser extension), and move applications through
stages: **Saved → Applied → Phone Screen → Interview → Offer / Rejected**.

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
- **LLM extraction & ranking:** Gemini Flash via OpenRouter (GitHub job postings, extension raw-text fallback, internship ranking)

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

See [.env.example](job-tracker/.env.example) for the full list, including
database, Auth.js, GitHub API, OpenRouter, Adzuna, Redis, and Resend
credentials.

## Browser extension (universal apply-capture)

The extension lives in [`extension/`](extension/): on any job site, clicking
Apply/Submit is detected automatically and the job is auto-saved to the
tracker.

To install it unpacked:

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` folder.
4. Sign in to the app at [http://localhost:3000](http://localhost:3000) —
   the extension reuses that session cookie to authenticate its saves.

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

- **GitHub repos** — paste a repo URL into the Add Job modal; the server
  fetches `JOBS.md` / `README.md` via the GitHub REST API and uses Gemini
  Flash (OpenRouter) to extract structured job fields.
- **Universal apply-capture** — the extension detects Apply/Submit on any job
  site and auto-saves the application (100% client-side, no server scraping).
- **Adzuna internships** *(Phase 4, upcoming)* — preference-ranked internship
  recommendations with one-click save.

## Build phases

- **Phase 1 — Plain CRUD:** ✅ complete. Manual job entry, stage management,
  dashboard table UI, auth.
- **Phase 2 — Data sources:** ✅ complete. GitHub REST API integration.
- **Phase 3 — Universal apply-capture:** ✅ complete. Auto-detects and saves
  applications on any job site.
- **Phase 4 — Internship recommendations:** upcoming. Adzuna Jobs API +
  Gemini ranking.

Phases beyond Phase 4 are out of scope until explicitly planned.
