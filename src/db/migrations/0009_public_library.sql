CREATE TABLE public_imports (household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE, publication_id integer NOT NULL REFERENCES recipe_publications(id) ON DELETE CASCADE, language text NOT NULL, recipe_id integer NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, PRIMARY KEY(household_id,publication_id,language));
--> statement-breakpoint
CREATE TABLE featured_recipes (language text NOT NULL, position integer NOT NULL CONSTRAINT featured_position_valid CHECK(position BETWEEN 1 AND 3), publication_id integer NOT NULL REFERENCES recipe_publications(id) ON DELETE CASCADE, PRIMARY KEY(language,position));
--> statement-breakpoint
CREATE UNIQUE INDEX featured_recipe_unique ON featured_recipes(language,publication_id);
--> statement-breakpoint
CREATE TABLE public_seed_entries (key text PRIMARY KEY NOT NULL, publication_id integer NOT NULL REFERENCES recipe_publications(id) ON DELETE CASCADE);
