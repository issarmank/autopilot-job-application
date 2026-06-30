CREATE TYPE "public"."source_type" AS ENUM('linkedin', 'github', 'manual');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('SAVED', 'APPLIED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'REJECTED');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"stage" "stage" DEFAULT 'SAVED' NOT NULL,
	"notes" text,
	"applied_at" timestamp,
	"followed_up_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"job_id" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"company" text,
	"location" text,
	"salary_min" integer,
	"salary_max" integer,
	"description" text,
	"source_url" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"raw_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;