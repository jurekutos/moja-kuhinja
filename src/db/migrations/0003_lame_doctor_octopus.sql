CREATE TABLE `meal_plan_entries` (
	`id` integer PRIMARY KEY NOT NULL,
	`household_id` integer NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`recipe_id` integer,
	`publication_id` integer,
	`title_snapshot` text NOT NULL,
	`servings` integer NOT NULL,
	`revision` text NOT NULL,
	`updated_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`publication_id`) REFERENCES `recipe_publications`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "meal_slot_valid" CHECK("meal_plan_entries"."slot" in ('lunch', 'dinner')),
	CONSTRAINT "meal_servings_valid" CHECK("meal_plan_entries"."servings" between 1 and 100),
	CONSTRAINT "meal_source_exclusive" CHECK("meal_plan_entries"."recipe_id" is null or "meal_plan_entries"."publication_id" is null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plan_workspace_date_slot` ON `meal_plan_entries` (`household_id`,`date`,`slot`);