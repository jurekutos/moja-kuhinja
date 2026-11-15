CREATE TABLE `community_favorites` (
	`user_id` integer NOT NULL,
	`publication_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `publication_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`publication_id`) REFERENCES `recipe_publications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` integer PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`household_id` integer,
	`role` text DEFAULT 'editor' NOT NULL,
	`created_by` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitation_role_valid" CHECK("invitations"."role" in ('admin', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitations_household_idx` ON `invitations` (`household_id`);--> statement-breakpoint
CREATE TABLE `recipe_publications` (
	`id` integer PRIMARY KEY NOT NULL,
	`recipe_id` integer,
	`household_id` integer NOT NULL,
	`submitted_by` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`snapshot` text NOT NULL,
	`feedback` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` integer,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "publication_status_valid" CHECK("recipe_publications"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `publications_status_created_idx` ON `recipe_publications` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `publications_household_idx` ON `recipe_publications` (`household_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_household_members` (
	`user_id` integer NOT NULL,
	`household_id` integer NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	PRIMARY KEY(`user_id`, `household_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "member_role_valid" CHECK("__new_household_members"."role" in ('admin', 'editor', 'viewer'))
);
--> statement-breakpoint
INSERT INTO `__new_household_members`("user_id", "household_id", "role") SELECT "user_id", "household_id", 'editor' FROM `household_members`;--> statement-breakpoint
DROP TABLE `household_members`;--> statement-breakpoint
ALTER TABLE `__new_household_members` RENAME TO `household_members`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `members_household_idx` ON `household_members` (`household_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `is_moderator` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Preserve legacy workspaces: the first member becomes their admin.
UPDATE `household_members` SET `role` = 'admin' WHERE `user_id` = (SELECT min(m.`user_id`) FROM `household_members` m WHERE m.`household_id` = `household_members`.`household_id`);
--> statement-breakpoint
-- Bootstrap platform moderation once for the first existing account; later signup never grants it.
UPDATE `users` SET `is_moderator` = 1 WHERE `id` = (SELECT min(`id`) FROM `users`);
