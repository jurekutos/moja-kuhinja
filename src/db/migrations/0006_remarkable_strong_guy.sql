CREATE TABLE `recipe_reads` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`recipe_id` integer,
	`publication_id` integer,
	`day` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`publication_id`) REFERENCES `recipe_publications`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reads_one_source" CHECK(("recipe_reads"."recipe_id" is not null and "recipe_reads"."publication_id" is null) or ("recipe_reads"."recipe_id" is null and "recipe_reads"."publication_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reads_recipe_user_day` ON `recipe_reads` (`recipe_id`,`user_id`,`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `reads_publication_user_day` ON `recipe_reads` (`publication_id`,`user_id`,`day`);--> statement-breakpoint
CREATE INDEX `reads_day_idx` ON `recipe_reads` (`day`);