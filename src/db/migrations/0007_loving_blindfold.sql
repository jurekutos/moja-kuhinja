CREATE TABLE `global_categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`active` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_categories_key_unique` ON `global_categories` (`key`);--> statement-breakpoint
CREATE TABLE `global_category_names` (
	`category_id` integer NOT NULL,
	`language` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`category_id`, `language`),
	FOREIGN KEY (`category_id`) REFERENCES `global_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `global_ingredient_names` (
	`ingredient_id` integer NOT NULL,
	`language` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`ingredient_id`, `language`),
	FOREIGN KEY (`ingredient_id`) REFERENCES `global_ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `global_ingredients` (
	`id` integer PRIMARY KEY NOT NULL,
	`key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_ingredients_key_unique` ON `global_ingredients` (`key`);--> statement-breakpoint
CREATE TABLE `ingredient_aliases` (
	`id` integer PRIMARY KEY NOT NULL,
	`ingredient_id` integer NOT NULL,
	`language` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `global_ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_alias_unique` ON `ingredient_aliases` (`ingredient_id`,`language`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `publication_categories` (
	`publication_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`publication_id`, `category_id`),
	FOREIGN KEY (`publication_id`) REFERENCES `recipe_publications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `global_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `publication_translations` (
	`id` integer PRIMARY KEY NOT NULL,
	`publication_id` integer NOT NULL,
	`language` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`complete` integer DEFAULT false NOT NULL,
	`snapshot` text NOT NULL,
	`feedback` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` integer,
	FOREIGN KEY (`publication_id`) REFERENCES `recipe_publications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "publication_translation_language_valid" CHECK("publication_translations"."language" in ('sl','en','de')),
	CONSTRAINT "publication_translation_status_valid" CHECK("publication_translations"."status" in ('draft','pending','approved','rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publication_translation_language` ON `publication_translations` (`publication_id`,`language`);--> statement-breakpoint
CREATE INDEX `publication_language_status` ON `publication_translations` (`language`,`status`,`complete`);--> statement-breakpoint
CREATE TABLE `recipe_translations` (
	`id` integer PRIMARY KEY NOT NULL,
	`recipe_id` integer NOT NULL,
	`language` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`revision` integer NOT NULL,
	`reviewed` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recipe_translation_language_valid" CHECK("recipe_translations"."language" in ('sl','en','de'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_translation_language` ON `recipe_translations` (`recipe_id`,`language`);--> statement-breakpoint
CREATE TABLE `translated_ingredients` (
	`translation_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`translation_id`, `ingredient_id`),
	FOREIGN KEY (`translation_id`) REFERENCES `recipe_translations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `recipe_ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `translated_steps` (
	`translation_id` integer NOT NULL,
	`step_id` integer NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`translation_id`, `step_id`),
	FOREIGN KEY (`translation_id`) REFERENCES `recipe_translations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`step_id`) REFERENCES `recipe_steps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD `canonical_ingredient_id` integer REFERENCES global_ingredients(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `original_language` text DEFAULT 'sl' NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `content_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `language` text DEFAULT 'sl' NOT NULL;
--> statement-breakpoint
INSERT INTO recipe_translations(recipe_id,language,title,description,revision,reviewed,updated_at)
SELECT id,original_language,title,description,content_revision,1,updated_at FROM recipes;
--> statement-breakpoint
INSERT INTO translated_ingredients(translation_id,ingredient_id,name,note)
SELECT tr.id,i.id,i.name,i.note FROM recipe_ingredients i JOIN recipe_translations tr ON tr.recipe_id=i.recipe_id;
--> statement-breakpoint
INSERT INTO translated_steps(translation_id,step_id,body)
SELECT tr.id,s.id,s.body FROM recipe_steps s JOIN recipe_translations tr ON tr.recipe_id=s.recipe_id;
--> statement-breakpoint
INSERT INTO publication_translations(publication_id,language,status,complete,snapshot,feedback,created_at,reviewed_at,reviewed_by)
SELECT id,'sl',status,
  length(trim(coalesce(json_extract(snapshot,'$.title'),'')))>0
  AND coalesce(json_array_length(snapshot,'$.ingredients'),0)>0
  AND coalesce(json_array_length(snapshot,'$.steps'),0)>0
  AND NOT EXISTS(SELECT 1 FROM json_each(snapshot,'$.ingredients') i WHERE length(trim(coalesce(json_extract(i.value,'$.name'),'')))=0)
  AND NOT EXISTS(SELECT 1 FROM json_each(snapshot,'$.steps') s WHERE length(trim(coalesce(s.value,'')))=0),
  snapshot,feedback,created_at,reviewed_at,reviewed_by FROM recipe_publications;
--> statement-breakpoint
CREATE TRIGGER publication_initial_language AFTER INSERT ON recipe_publications BEGIN
  INSERT INTO publication_translations(publication_id,language,status,complete,snapshot,feedback,created_at,reviewed_at,reviewed_by)
  VALUES(NEW.id,coalesce(json_extract(NEW.snapshot,'$.language'),'sl'),NEW.status,
    length(trim(coalesce(json_extract(NEW.snapshot,'$.title'),'')))>0
    AND coalesce(json_array_length(NEW.snapshot,'$.ingredients'),0)>0
    AND coalesce(json_array_length(NEW.snapshot,'$.steps'),0)>0
    AND NOT EXISTS(SELECT 1 FROM json_each(NEW.snapshot,'$.ingredients') i WHERE length(trim(coalesce(json_extract(i.value,'$.name'),'')))=0)
    AND NOT EXISTS(SELECT 1 FROM json_each(NEW.snapshot,'$.steps') s WHERE length(trim(coalesce(s.value,'')))=0),
    NEW.snapshot,NEW.feedback,NEW.created_at,NEW.reviewed_at,NEW.reviewed_by);
END;
--> statement-breakpoint
CREATE TRIGGER publication_legacy_status AFTER UPDATE OF status ON recipe_publications BEGIN
  UPDATE publication_translations SET status=NEW.status,feedback=NEW.feedback,reviewed_at=NEW.reviewed_at,reviewed_by=NEW.reviewed_by
  WHERE publication_id=NEW.id AND language=coalesce(json_extract(NEW.snapshot,'$.language'),'sl');
END;
--> statement-breakpoint
INSERT INTO global_categories(id,key,active) VALUES (1,'main_dishes',1),(2,'soups',1),(3,'breakfast',1),(4,'desserts',1),(5,'vegetarian',1),(6,'quick',1);
--> statement-breakpoint
INSERT INTO global_category_names(category_id,language,name) VALUES
 (1,'sl','Glavne jedi'),(1,'en','Main dishes'),(1,'de','Hauptgerichte'),
 (2,'sl','Juhe'),(2,'en','Soups'),(2,'de','Suppen'),
 (3,'sl','Zajtrk'),(3,'en','Breakfast'),(3,'de','Frühstück'),
 (4,'sl','Sladice'),(4,'en','Desserts'),(4,'de','Nachspeisen'),
 (5,'sl','Vegetarijansko'),(5,'en','Vegetarian'),(5,'de','Vegetarisch'),
 (6,'sl','Hitro'),(6,'en','Quick'),(6,'de','Schnell');
--> statement-breakpoint
INSERT INTO global_ingredients(id,key) VALUES(1,'chicken_breast'),(2,'onion'),(3,'salt'),(4,'egg'),(5,'flour'),(6,'milk');
--> statement-breakpoint
INSERT INTO global_ingredient_names(ingredient_id,language,name) VALUES
 (1,'sl','Piščančje prsi'),(1,'en','Chicken breast'),(1,'de','Hähnchenbrust'),
 (2,'sl','Čebula'),(2,'en','Onion'),(2,'de','Zwiebel'),
 (3,'sl','Sol'),(3,'en','Salt'),(3,'de','Salz'),
 (4,'sl','Jajce'),(4,'en','Egg'),(4,'de','Ei'),
 (5,'sl','Moka'),(5,'en','Flour'),(5,'de','Mehl'),
 (6,'sl','Mleko'),(6,'en','Milk'),(6,'de','Milch');
