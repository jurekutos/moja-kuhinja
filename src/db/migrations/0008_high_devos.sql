ALTER TABLE `meal_plan_entries` ADD `source_kind` text DEFAULT 'workspace' NOT NULL;
--> statement-breakpoint
UPDATE meal_plan_entries SET source_kind=CASE WHEN publication_id IS NOT NULL THEN 'public' WHEN recipe_id IS NOT NULL THEN 'workspace' ELSE 'unknown' END;
