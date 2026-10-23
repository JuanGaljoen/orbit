ALTER TABLE "projects" ADD COLUMN "diagram" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "diagram_commit" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "diagram_updated_at" timestamp with time zone;