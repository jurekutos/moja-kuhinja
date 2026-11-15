import { sqliteTable, text, integer, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const households = sqliteTable('households', {
  id: integer().primaryKey(), name: text().notNull(), plannerMeals: text('planner_meals').notNull().default('both'),
  createdAt: text('created_at'),
}, t => [check('household_planner_meals_valid', sql`${t.plannerMeals} in ('both', 'lunch', 'dinner')`)]);
export const users = sqliteTable('users', {
  language: text().notNull().default('sl'),
  id: integer().primaryKey(), name: text().notNull(), email: text().notNull().unique(), passwordHash: text('password_hash').notNull(), isModerator: integer('is_moderator', { mode: 'boolean' }).notNull().default(false),
  isSuperAdmin: integer('is_super_admin', { mode: 'boolean' }).notNull().default(false),
  sessionVersion: integer('session_version').notNull().default(0), createdAt: text('created_at'),
});
export const members = sqliteTable('household_members', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  householdId: integer('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  role: text().notNull().default('editor'),
}, t => [primaryKey({ columns: [t.userId, t.householdId] }), index('members_household_idx').on(t.householdId), check('member_role_valid', sql`${t.role} in ('admin', 'editor', 'viewer')`)]);
export const sessions = sqliteTable('sessions', { sid: text().primaryKey(), data: text().notNull(), expires: integer().notNull() }, t => [index('sessions_expiry_idx').on(t.expires)]);
export const recipes = sqliteTable('recipes', {
  originalLanguage: text('original_language').notNull().default('sl'),
  contentRevision: integer('content_revision').notNull().default(1),
  id: integer().primaryKey(), householdId: integer('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  title: text().notNull(), description: text().notNull().default(''), prepMinutes: integer('prep_minutes').notNull().default(0), cookMinutes: integer('cook_minutes').notNull().default(0),
  servings: integer().notNull().default(2), sourceType: text('source_type').notNull().default('manual'),
  sourceUrl: text('source_url').notNull().default(''), sourceDescription: text('source_description').notNull().default(''), status: text().notNull().default('draft'),
  createdBy: integer('created_by').notNull().references(() => users.id), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [index('recipes_household_created_idx').on(t.householdId, t.createdAt), index('recipes_household_title_idx').on(t.householdId, t.title), check('recipe_servings_positive', sql`${t.servings} > 0`), check('recipe_status_valid', sql`${t.status} in ('draft', 'published')`), check('recipe_times_positive', sql`${t.prepMinutes} >= 0 and ${t.cookMinutes} >= 0`)]);
export const ingredients = sqliteTable('ingredients', {
  id: integer().primaryKey(), householdId: integer('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }), name: text().notNull(), normalizedName: text('normalized_name').notNull(),
}, t => [uniqueIndex('ingredient_name_unique').on(t.householdId, t.normalizedName)]);
export const recipeIngredients = sqliteTable('recipe_ingredients', {
  canonicalIngredientId: integer('canonical_ingredient_id').references(() => globalIngredients.id, { onDelete: 'set null' }),
  id: integer().primaryKey(), recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  ingredientId: integer('ingredient_id').references(() => ingredients.id), name: text().notNull(), quantity: text(), unit: text().notNull().default(''), note: text().notNull().default(''), position: integer().notNull(),
}, t => [index('recipe_ingredients_recipe_idx').on(t.recipeId), index('recipe_ingredients_catalog_idx').on(t.ingredientId)]);
export const steps = sqliteTable('recipe_steps', {
  id: integer().primaryKey(), recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }), body: text().notNull(), position: integer().notNull(),
}, t => [uniqueIndex('steps_order_unique').on(t.recipeId, t.position)]);
export const images = sqliteTable('recipe_images', {
  id: integer().primaryKey(), recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }), filename: text().notNull().unique(), thumbnail: text().notNull().unique(), position: integer().notNull(),
}, t => [index('images_recipe_idx').on(t.recipeId)]);
export const categories = sqliteTable('categories', {
  id: integer().primaryKey(), householdId: integer('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }), name: text().notNull(), normalizedName: text('normalized_name').notNull(),
}, t => [uniqueIndex('category_name_unique').on(t.householdId, t.normalizedName)]);
export const recipeCategories = sqliteTable('recipe_categories', {
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }), categoryId: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.recipeId, t.categoryId] })]);
export const favorites = sqliteTable('favorites', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.userId, t.recipeId] }), index('favorites_recipe_idx').on(t.recipeId)]);
export const recipeNotes = sqliteTable('recipe_notes', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }), body: text().notNull(),
}, t => [primaryKey({ columns: [t.userId, t.recipeId] })]);
export const comments = sqliteTable('recipe_comments', {
  id: integer().primaryKey(),
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text().notNull(), createdAt: text('created_at').notNull(),
}, t => [index('comments_recipe_created_idx').on(t.recipeId, t.createdAt), check('comment_body_length', sql`length(trim(${t.body})) between 1 and 2000`)]);
export const invitations = sqliteTable('invitations', {
  id: integer().primaryKey(), tokenHash: text('token_hash').notNull().unique(), email: text().notNull(),
  householdId: integer('household_id').references(() => households.id, { onDelete: 'cascade' }),
  role: text().notNull().default('editor'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  expiresAt: integer('expires_at').notNull(), usedAt: text('used_at'), revokedAt: text('revoked_at'), createdAt: text('created_at').notNull(),
}, t => [index('invitations_household_idx').on(t.householdId), check('invitation_role_valid', sql`${t.role} in ('admin', 'editor', 'viewer')`)]);
export const publications = sqliteTable('recipe_publications', {
  id: integer().primaryKey(), recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  householdId: integer('household_id').references(() => households.id, { onDelete: 'set null' }),
  submittedBy: integer('submitted_by').notNull().references(() => users.id),
  status: text().notNull().default('pending'), snapshot: text().notNull(),
  feedback: text().notNull().default(''), createdAt: text('created_at').notNull(),
  reviewedAt: text('reviewed_at'), reviewedBy: integer('reviewed_by').references(() => users.id),
}, t => [index('publications_status_created_idx').on(t.status, t.createdAt), index('publications_household_idx').on(t.householdId), check('publication_status_valid', sql`${t.status} in ('pending', 'approved', 'rejected')`)]);
export const communityFavorites = sqliteTable('community_favorites', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  publicationId: integer('publication_id').notNull().references(() => publications.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.userId, t.publicationId] })]);
export const mealPlanEntries = sqliteTable('meal_plan_entries', {
  sourceKind: text('source_kind').notNull().default('workspace'),
  id: integer().primaryKey(),
  householdId: integer('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  date: text().notNull(), slot: text().notNull(),
  recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  publicationId: integer('publication_id').references(() => publications.id, { onDelete: 'set null' }),
  titleSnapshot: text('title_snapshot').notNull(), servings: integer().notNull(),
  revision: text().notNull(), updatedBy: integer('updated_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [
  uniqueIndex('meal_plan_workspace_date_slot').on(t.householdId, t.date, t.slot),
  check('meal_slot_valid', sql`${t.slot} in ('lunch', 'dinner')`),
  check('meal_servings_valid', sql`${t.servings} between 1 and 100`),
  check('meal_source_exclusive', sql`${t.recipeId} is null or ${t.publicationId} is null`),
]);
export const auditEvents = sqliteTable('audit_events', {
  id: integer().primaryKey(), actorId: integer('actor_id').notNull().references(() => users.id),
  action: text().notNull(), workspaceId: integer('workspace_id'), targetUserId: integer('target_user_id'),
  createdAt: text('created_at').notNull(),
}, t => [index('audit_created_idx').on(t.createdAt)]);
export const fileDeletions = sqliteTable('file_deletions', {
  filename:text().primaryKey(), createdAt:text('created_at').notNull(),
});
export const recipeReads = sqliteTable('recipe_reads', {
  id: integer().primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'cascade' }),
  publicationId: integer('publication_id').references(() => publications.id, { onDelete: 'cascade' }),
  day: text().notNull(),
}, t => [
  uniqueIndex('reads_recipe_user_day').on(t.recipeId, t.userId, t.day),
  uniqueIndex('reads_publication_user_day').on(t.publicationId, t.userId, t.day),
  index('reads_day_idx').on(t.day),
  check('reads_one_source', sql`(${t.recipeId} is not null and ${t.publicationId} is null) or (${t.recipeId} is null and ${t.publicationId} is not null)`),
]);
// Deleted workspace IDs intentionally have no FK: an audit event must survive deletion.
export const recipeTranslations = sqliteTable('recipe_translations', {
  id: integer().primaryKey(), recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  language: text().notNull(), title: text().notNull(), description: text().notNull().default(''),
  revision: integer().notNull(), reviewed: integer({ mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('recipe_translation_language').on(t.recipeId,t.language),check('recipe_translation_language_valid',sql`${t.language} in ('sl','en','de')`)]);
export const translatedIngredients = sqliteTable('translated_ingredients', {
  translationId: integer('translation_id').notNull().references(() => recipeTranslations.id,{onDelete:'cascade'}),
  ingredientId: integer('ingredient_id').notNull().references(() => recipeIngredients.id,{onDelete:'cascade'}),
  name:text().notNull(),note:text().notNull().default(''),
},t=>[primaryKey({columns:[t.translationId,t.ingredientId]})]);
export const translatedSteps = sqliteTable('translated_steps', {
  translationId: integer('translation_id').notNull().references(() => recipeTranslations.id,{onDelete:'cascade'}),
  stepId: integer('step_id').notNull().references(() => steps.id,{onDelete:'cascade'}),body:text().notNull(),
},t=>[primaryKey({columns:[t.translationId,t.stepId]})]);
export const globalCategories = sqliteTable('global_categories', {
  id:integer().primaryKey(),key:text().notNull().unique(),active:integer({mode:'boolean'}).notNull().default(false),
});
export const globalCategoryNames = sqliteTable('global_category_names', {
  categoryId:integer('category_id').notNull().references(()=>globalCategories.id,{onDelete:'cascade'}),language:text().notNull(),name:text().notNull(),
},t=>[primaryKey({columns:[t.categoryId,t.language]})]);
export const globalIngredients = sqliteTable('global_ingredients', {
  id:integer().primaryKey(),key:text().notNull().unique(),
});
export const globalIngredientNames = sqliteTable('global_ingredient_names', {
  ingredientId:integer('ingredient_id').notNull().references(()=>globalIngredients.id,{onDelete:'cascade'}),language:text().notNull(),name:text().notNull(),
},t=>[primaryKey({columns:[t.ingredientId,t.language]})]);
export const ingredientAliases = sqliteTable('ingredient_aliases', {
  id:integer().primaryKey(),ingredientId:integer('ingredient_id').notNull().references(()=>globalIngredients.id,{onDelete:'cascade'}),language:text().notNull(),name:text().notNull(),normalizedName:text('normalized_name').notNull(),
},t=>[uniqueIndex('ingredient_alias_unique').on(t.ingredientId,t.language,t.normalizedName)]);
export const publicationTranslations = sqliteTable('publication_translations', {
  id:integer().primaryKey(),publicationId:integer('publication_id').notNull().references(()=>publications.id,{onDelete:'cascade'}),
  language:text().notNull(),status:text().notNull().default('draft'),complete:integer({mode:'boolean'}).notNull().default(false),snapshot:text().notNull(),
  feedback:text().notNull().default(''),createdAt:text('created_at').notNull(),reviewedAt:text('reviewed_at'),reviewedBy:integer('reviewed_by').references(()=>users.id),
},t=>[uniqueIndex('publication_translation_language').on(t.publicationId,t.language),index('publication_language_status').on(t.language,t.status,t.complete),check('publication_translation_language_valid',sql`${t.language} in ('sl','en','de')`),check('publication_translation_status_valid',sql`${t.status} in ('draft','pending','approved','rejected')`)]);
export const publicationCategories = sqliteTable('publication_categories', {
  publicationId:integer('publication_id').notNull().references(()=>publications.id,{onDelete:'cascade'}),categoryId:integer('category_id').notNull().references(()=>globalCategories.id),
},t=>[primaryKey({columns:[t.publicationId,t.categoryId]})]);
