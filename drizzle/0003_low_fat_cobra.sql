ALTER TABLE "projects" ADD COLUMN "floorplan" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "floorplan_commit" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "floorplan_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "diagram";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "diagram_commit";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "diagram_updated_at";