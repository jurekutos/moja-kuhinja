CREATE TABLE `recipe_comments` (
	`id` integer PRIMARY KEY NOT NULL,
	`recipe_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comment_body_length" CHECK(length(trim("recipe_comments"."body")) between 1 and 2000)
);
--> statement-breakpoint
CREATE INDEX `comments_recipe_created_idx` ON `recipe_comments` (`recipe_id`,`created_at`);