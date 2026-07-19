CREATE TABLE "watched_repos" (
	"id" text PRIMARY KEY NOT NULL,
	"repo_url" text NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"lookback_days" integer DEFAULT 14 NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watched_repos" ADD CONSTRAINT "watched_repos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;