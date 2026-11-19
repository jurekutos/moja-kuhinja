# Database schema

Implemented SQLite schema after migration `0009_public_library`. SQLite foreign keys, WAL journaling and a 5-second busy timeout are enabled by `src/db/index.js`. Drizzle migrations are version controlled; never use schema push against existing data. Quantity values are decimal strings, not floating-point numbers. Dates are ISO text unless noted. Boolean columns use integers.

## Storage boundaries

`recipes` and their structured children belong to a household. `recipe_publications` is the independent publication/submission envelope; `publication_translations` stores language-specific JSON snapshots and approval state. A snapshot contains public recipe fields, structured ingredients and ordered steps; it never includes personal notes or comments. The original envelope status allows pending/approved/rejected; language versions additionally allow draft. Public readers use the language version status and completeness, never the envelope alone.

New suggestions have `snapshot.suggestion=true` and no private recipe reference. Legacy submissions retain their nullable source recipe reference for compatibility. Admin edits update the public snapshot only. `featured_recipes` stores three validated slots per language. `public_imports` uniquely identifies a live private copy by household, publication and language; deleting that recipe removes the import mapping, allowing a later reimport. `public_seed_entries` records immutable seed keys and never overwrites existing content.

## audit_events

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `actor_id` | integer | NOT NULL; FK users.id; delete no action |
| `action` | text | NOT NULL |
| `workspace_id` | integer | nullable |
| `target_user_id` | integer | nullable |
| `created_at` | text | NOT NULL |

Indexes: `audit_created_idx` ['created_at'].

## categories

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `household_id` | integer | NOT NULL; FK households.id; delete cascade |
| `name` | text | NOT NULL |
| `normalized_name` | text | NOT NULL |

Indexes: `category_name_unique` ['household_id', 'normalized_name'].

## community_favorites

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `user_id` | integer | PK; NOT NULL; FK users.id; delete cascade |
| `publication_id` | integer | PK; NOT NULL; FK recipe_publications.id; delete cascade |

## favorites

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `user_id` | integer | PK; NOT NULL; FK users.id; delete cascade |
| `recipe_id` | integer | PK; NOT NULL; FK recipes.id; delete cascade |

Indexes: `favorites_recipe_idx` ['recipe_id'].

## featured_recipes

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `language` | text | PK; NOT NULL |
| `position` | integer | PK; NOT NULL |
| `publication_id` | integer | NOT NULL; FK recipe_publications.id; delete cascade |

Indexes: `featured_recipe_unique` ['language', 'publication_id'].

Checks: `featured_position_valid` "featured_recipes"."position" between 1 and 3.

## file_deletions

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `filename` | text | PK; NOT NULL |
| `created_at` | text | NOT NULL |

## global_categories

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `key` | text | NOT NULL |
| `active` | integer | NOT NULL; default False |

Indexes: `global_categories_key_unique` ['key'].

## global_category_names

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `category_id` | integer | PK; NOT NULL; FK global_categories.id; delete cascade |
| `language` | text | PK; NOT NULL |
| `name` | text | NOT NULL |

## global_ingredient_names

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `ingredient_id` | integer | PK; NOT NULL; FK global_ingredients.id; delete cascade |
| `language` | text | PK; NOT NULL |
| `name` | text | NOT NULL |

## global_ingredients

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `key` | text | NOT NULL |

Indexes: `global_ingredients_key_unique` ['key'].

## household_members

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `user_id` | integer | PK; NOT NULL; FK users.id; delete cascade |
| `household_id` | integer | PK; NOT NULL; FK households.id; delete cascade |
| `role` | text | NOT NULL; default 'editor' |

Indexes: `members_household_idx` ['household_id'].

Checks: `member_role_valid` "household_members"."role" in ('admin', 'editor', 'viewer').

## households

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `name` | text | NOT NULL |
| `planner_meals` | text | NOT NULL; default 'both' |
| `created_at` | text | nullable |

Checks: `household_planner_meals_valid` "households"."planner_meals" in ('both', 'lunch', 'dinner').

## ingredient_aliases

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `ingredient_id` | integer | NOT NULL; FK global_ingredients.id; delete cascade |
| `language` | text | NOT NULL |
| `name` | text | NOT NULL |
| `normalized_name` | text | NOT NULL |

Indexes: `ingredient_alias_unique` ['ingredient_id', 'language', 'normalized_name'].

## ingredients

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `household_id` | integer | NOT NULL; FK households.id; delete cascade |
| `name` | text | NOT NULL |
| `normalized_name` | text | NOT NULL |

Indexes: `ingredient_name_unique` ['household_id', 'normalized_name'].

## invitations

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `token_hash` | text | NOT NULL |
| `email` | text | NOT NULL |
| `household_id` | integer | FK households.id; delete cascade |
| `role` | text | NOT NULL; default 'editor' |
| `created_by` | integer | NOT NULL; FK users.id; delete no action |
| `expires_at` | integer | NOT NULL |
| `used_at` | text | nullable |
| `revoked_at` | text | nullable |
| `created_at` | text | NOT NULL |

Indexes: `invitations_token_hash_unique` ['token_hash']; `invitations_household_idx` ['household_id'].

Checks: `invitation_role_valid` "invitations"."role" in ('admin', 'editor', 'viewer').

## meal_plan_entries

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `source_kind` | text | NOT NULL; default 'workspace' |
| `id` | integer | PK; NOT NULL |
| `household_id` | integer | NOT NULL; FK households.id; delete cascade |
| `date` | text | NOT NULL |
| `slot` | text | NOT NULL |
| `recipe_id` | integer | FK recipes.id; delete set null |
| `publication_id` | integer | FK recipe_publications.id; delete set null |
| `title_snapshot` | text | NOT NULL |
| `servings` | integer | NOT NULL |
| `revision` | text | NOT NULL |
| `updated_by` | integer | NOT NULL; FK users.id; delete no action |
| `created_at` | text | NOT NULL |
| `updated_at` | text | NOT NULL |

Indexes: `meal_plan_workspace_date_slot` ['household_id', 'date', 'slot'].

Checks: `meal_slot_valid` "meal_plan_entries"."slot" in ('lunch', 'dinner'); `meal_servings_valid` "meal_plan_entries"."servings" between 1 and 100; `meal_source_exclusive` "meal_plan_entries"."recipe_id" is null or "meal_plan_entries"."publication_id" is null.

## public_imports

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `household_id` | integer | PK; NOT NULL; FK households.id; delete cascade |
| `publication_id` | integer | PK; NOT NULL; FK recipe_publications.id; delete cascade |
| `language` | text | PK; NOT NULL |
| `recipe_id` | integer | NOT NULL; FK recipes.id; delete cascade |

## public_seed_entries

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `key` | text | PK; NOT NULL |
| `publication_id` | integer | NOT NULL; FK recipe_publications.id; delete cascade |

## publication_categories

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `publication_id` | integer | PK; NOT NULL; FK recipe_publications.id; delete cascade |
| `category_id` | integer | PK; NOT NULL; FK global_categories.id; delete no action |

## publication_translations

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `publication_id` | integer | NOT NULL; FK recipe_publications.id; delete cascade |
| `language` | text | NOT NULL |
| `status` | text | NOT NULL; default 'draft' |
| `complete` | integer | NOT NULL; default False |
| `snapshot` | text | NOT NULL |
| `feedback` | text | NOT NULL; default '' |
| `created_at` | text | NOT NULL |
| `reviewed_at` | text | nullable |
| `reviewed_by` | integer | FK users.id; delete no action |

Indexes: `publication_translation_language` ['publication_id', 'language']; `publication_language_status` ['language', 'status', 'complete'].

Checks: `publication_translation_language_valid` "publication_translations"."language" in ('sl','en','de'); `publication_translation_status_valid` "publication_translations"."status" in ('draft','pending','approved','rejected').

## recipe_categories

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `recipe_id` | integer | PK; NOT NULL; FK recipes.id; delete cascade |
| `category_id` | integer | PK; NOT NULL; FK categories.id; delete cascade |

## recipe_comments

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `recipe_id` | integer | NOT NULL; FK recipes.id; delete cascade |
| `user_id` | integer | NOT NULL; FK users.id; delete cascade |
| `body` | text | NOT NULL |
| `created_at` | text | NOT NULL |

Indexes: `comments_recipe_created_idx` ['recipe_id', 'created_at'].

Checks: `comment_body_length` length(trim("recipe_comments"."body")) between 1 and 2000.

## recipe_images

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `recipe_id` | integer | NOT NULL; FK recipes.id; delete cascade |
| `filename` | text | NOT NULL |
| `thumbnail` | text | NOT NULL |
| `position` | integer | NOT NULL |

Indexes: `recipe_images_filename_unique` ['filename']; `recipe_images_thumbnail_unique` ['thumbnail']; `images_recipe_idx` ['recipe_id'].

## recipe_ingredients

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `canonical_ingredient_id` | integer | FK global_ingredients.id; delete set null |
| `id` | integer | PK; NOT NULL |
| `recipe_id` | integer | NOT NULL; FK recipes.id; delete cascade |
| `ingredient_id` | integer | FK ingredients.id; delete no action |
| `name` | text | NOT NULL |
| `quantity` | text | nullable |
| `unit` | text | NOT NULL; default '' |
| `note` | text | NOT NULL; default '' |
| `position` | integer | NOT NULL |

Indexes: `recipe_ingredients_recipe_idx` ['recipe_id']; `recipe_ingredients_catalog_idx` ['ingredient_id'].

## recipe_notes

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `user_id` | integer | PK; NOT NULL; FK users.id; delete cascade |
| `recipe_id` | integer | PK; NOT NULL; FK recipes.id; delete cascade |
| `body` | text | NOT NULL |

## recipe_publications

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `recipe_id` | integer | FK recipes.id; delete set null |
| `household_id` | integer | FK households.id; delete set null |
| `submitted_by` | integer | NOT NULL; FK users.id; delete no action |
| `status` | text | NOT NULL; default 'pending' |
| `snapshot` | text | NOT NULL |
| `feedback` | text | NOT NULL; default '' |
| `created_at` | text | NOT NULL |
| `reviewed_at` | text | nullable |
| `reviewed_by` | integer | FK users.id; delete no action |

Indexes: `publications_status_created_idx` ['status', 'created_at']; `publications_household_idx` ['household_id'].

Checks: `publication_status_valid` "recipe_publications"."status" in ('pending', 'approved', 'rejected').

## recipe_reads

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `user_id` | integer | NOT NULL; FK users.id; delete cascade |
| `recipe_id` | integer | FK recipes.id; delete cascade |
| `publication_id` | integer | FK recipe_publications.id; delete cascade |
| `day` | text | NOT NULL |

Indexes: `reads_recipe_user_day` ['recipe_id', 'user_id', 'day']; `reads_publication_user_day` ['publication_id', 'user_id', 'day']; `reads_day_idx` ['day'].

Checks: `reads_one_source` ("recipe_reads"."recipe_id" is not null and "recipe_reads"."publication_id" is null) or ("recipe_reads"."recipe_id" is null and "recipe_reads"."publication_id" is not null).

## recipe_steps

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `recipe_id` | integer | NOT NULL; FK recipes.id; delete cascade |
| `body` | text | NOT NULL |
| `position` | integer | NOT NULL |

Indexes: `steps_order_unique` ['recipe_id', 'position'].

## recipe_translations

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `id` | integer | PK; NOT NULL |
| `recipe_id` | integer | NOT NULL; FK recipes.id; delete cascade |
| `language` | text | NOT NULL |
| `title` | text | NOT NULL |
| `description` | text | NOT NULL; default '' |
| `revision` | integer | NOT NULL |
| `reviewed` | integer | NOT NULL; default False |
| `updated_at` | text | NOT NULL |

Indexes: `recipe_translation_language` ['recipe_id', 'language'].

Checks: `recipe_translation_language_valid` "recipe_translations"."language" in ('sl','en','de').

## recipes

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `original_language` | text | NOT NULL; default 'sl' |
| `content_revision` | integer | NOT NULL; default 1 |
| `id` | integer | PK; NOT NULL |
| `household_id` | integer | NOT NULL; FK households.id; delete cascade |
| `title` | text | NOT NULL |
| `description` | text | NOT NULL; default '' |
| `prep_minutes` | integer | NOT NULL; default 0 |
| `cook_minutes` | integer | NOT NULL; default 0 |
| `servings` | integer | NOT NULL; default 2 |
| `source_type` | text | NOT NULL; default 'manual' |
| `source_url` | text | NOT NULL; default '' |
| `source_description` | text | NOT NULL; default '' |
| `status` | text | NOT NULL; default 'draft' |
| `created_by` | integer | NOT NULL; FK users.id; delete no action |
| `created_at` | text | NOT NULL |
| `updated_at` | text | NOT NULL |

Indexes: `recipes_household_created_idx` ['household_id', 'created_at']; `recipes_household_title_idx` ['household_id', 'title'].

Checks: `recipe_servings_positive` "recipes"."servings" > 0; `recipe_status_valid` "recipes"."status" in ('draft', 'published'); `recipe_times_positive` "recipes"."prep_minutes" >= 0 and "recipes"."cook_minutes" >= 0.

## sessions

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `sid` | text | PK; NOT NULL |
| `data` | text | NOT NULL |
| `expires` | integer | NOT NULL |

Indexes: `sessions_expiry_idx` ['expires'].

## translated_ingredients

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `translation_id` | integer | PK; NOT NULL; FK recipe_translations.id; delete cascade |
| `ingredient_id` | integer | PK; NOT NULL; FK recipe_ingredients.id; delete cascade |
| `name` | text | NOT NULL |
| `note` | text | NOT NULL; default '' |

## translated_steps

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `translation_id` | integer | PK; NOT NULL; FK recipe_translations.id; delete cascade |
| `step_id` | integer | PK; NOT NULL; FK recipe_steps.id; delete cascade |
| `body` | text | NOT NULL |

## users

| Field | SQLite type | Constraints / default |
| --- | --- | --- |
| `language` | text | NOT NULL; default 'sl' |
| `id` | integer | PK; NOT NULL |
| `name` | text | NOT NULL |
| `email` | text | NOT NULL |
| `password_hash` | text | NOT NULL |
| `is_moderator` | integer | NOT NULL; default False |
| `is_super_admin` | integer | NOT NULL; default False |
| `session_version` | integer | NOT NULL; default 0 |
| `created_at` | text | nullable |

Indexes: `users_email_unique` ['email'].

