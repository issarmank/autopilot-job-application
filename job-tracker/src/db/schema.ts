import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// 'extension' = Phase 3 universal apply-capture · 'adzuna' = Phase 4 internship recommendations
export const sourceTypeEnum = pgEnum('source_type', ['linkedin', 'github', 'manual', 'extension', 'adzuna'])

export const stageEnum = pgEnum('stage', [
  'SAVED', 'APPLIED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'REJECTED',
])

export const users = pgTable('users', {
  id        : text('id').primaryKey(),
  email     : text('email').notNull().unique(),
  password  : text('password'),
  name      : text('name'),
  image     : text('image'),
  createdAt : timestamp('created_at').defaultNow().notNull(),
})

export const jobs = pgTable('jobs', {
  id          : text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title       : text('title'),
  company     : text('company'),
  location    : text('location'),
  salaryMin   : integer('salary_min'),
  salaryMax   : integer('salary_max'),
  description : text('description'),
  sourceUrl   : text('source_url').notNull(),
  sourceType  : sourceTypeEnum('source_type').notNull(),
  rawText     : text('raw_text'),
  createdAt   : timestamp('created_at').defaultNow().notNull(),
})

export const applications = pgTable('applications', {
  id           : text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  stage        : stageEnum('stage').default('SAVED').notNull(),
  notes        : text('notes'),
  appliedAt    : timestamp('applied_at'),
  followedUpAt : timestamp('followed_up_at'),
  createdAt    : timestamp('created_at').defaultNow().notNull(),
  jobId        : text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  userId       : text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
})

export const jobRelations = relations(jobs, ({ many }) => ({
  applications: many(applications),
}))

export const applicationRelations = relations(applications, ({ one }) => ({
  job  : one(jobs,  { fields: [applications.jobId],  references: [jobs.id]  }),
  user : one(users, { fields: [applications.userId], references: [users.id] }),
}))

// A repo watched for new job postings — synced by the BullMQ worker on a
// schedule, filtering rows to the last `lookbackDays` days each sync.
export const watchedRepos = pgTable('watched_repos', {
  id           : text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  repoUrl      : text('repo_url').notNull(),
  owner        : text('owner').notNull(),
  repo         : text('repo').notNull(),
  lookbackDays : integer('lookback_days').default(14).notNull(),
  lastSyncedAt : timestamp('last_synced_at'),
  createdAt    : timestamp('created_at').defaultNow().notNull(),
  userId       : text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
})
