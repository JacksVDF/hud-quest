-- Optimistic concurrency: every save says which version it was based on, and the server
-- refuses it if another tab or device saved in the meantime.
ALTER TABLE "user_tasks" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
