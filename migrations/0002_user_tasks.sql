-- One row per user holding their whole task list as JSON (same shape the app keeps in
-- localStorage). Every query must filter by user_id; see src/lib/server/db.ts.
CREATE TABLE "user_tasks" (
	"user_id" text NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
	"tasks" text NOT NULL,
	"updated_at" integer NOT NULL
);
