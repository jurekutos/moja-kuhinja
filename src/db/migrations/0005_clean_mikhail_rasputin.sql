CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`actor_id` integer NOT NULL,
	`action` text NOT NULL,
	`workspace_id` integer,
	`target_user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `file_deletions` (
	`filename` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_recipe_publications` (
	`id` integer PRIMARY KEY NOT NULL,
	`recipe_id` integer,
	`household_id` integer,
	`submitted_by` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`snapshot` text NOT NULL,
	`feedback` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` integer,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "publication_status_valid" CHECK("__new_recipe_publications"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_recipe_publications`("id", "recipe_id", "household_id", "submitted_by", "status", "snapshot", "feedback", "created_at", "reviewed_at", "reviewed_by") SELECT "id", "recipe_id", "household_id", "submitted_by", "status", "snapshot", "feedback", "created_at", "reviewed_at", "reviewed_by" FROM `recipe_publications`;--> statement-breakpoint
DROP TABLE `recipe_publications`;--> statement-breakpoint
ALTER TABLE `__new_recipe_publications` RENAME TO `recipe_publications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `publications_status_created_idx` ON `recipe_publications` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `publications_household_idx` ON `recipe_publications` (`household_id`);--> statement-breakpoint
ALTER TABLE `households` ADD `created_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `is_super_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `session_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `created_at` text;
--> statement-breakpoint
-- This check runs before Drizzle commits; a violation rolls back the entire migration.
CREATE TEMP TABLE `migration_integrity_check` (`ok` integer CHECK (`ok` = 1));
--> statement-breakpoint
INSERT INTO `migration_integrity_check` SELECT CASE WHEN EXISTS (SELECT 1 FROM pragma_foreign_key_check) THEN 0 ELSE 1 END;
--> statement-breakpoint
DROP TABLE `migration_integrity_check`;
