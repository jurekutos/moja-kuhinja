# Multilingual UI and recipe content

Moja kuhinja remains an Express/EJS application. The interface supports Slovenian (`sl`), English (`en`) and German (`de`). Existing accounts and content default to Slovenian. Interface language never translates user content automatically.

## Upgrade an existing installation

The implementation inspected the development database schema read-only. It had migrations 0000–0006 applied. **Migrations 0007 and 0008 were not applied to that database.** All upgrade tests and browser checks use temporary databases and synthetic content.

1. Stop every running app process with Ctrl+C. Keep the server stopped while backing up and migrating.
2. From the project directory, using the same supported Node version as the existing installation:

   ```powershell
   npm ci
   npm run backup -- --server-stopped
   npm run db:migrate
   npm run build
   npm run dev
   ```

3. Open `http://127.0.0.1:3000`. Use the language picker, available on every page including account settings. Existing signed-in sessions remain valid.
4. Before sharing an existing recipe in another language, add its translation, review it, and submit that language for moderation.

Migration `0007_loving_blindfold.sql` only adds columns, tables, indexes, compatibility triggers and initial catalog rows. It copies existing text into Slovenian source translations and independent Slovenian publication versions. It does not drop/recreate existing tables, infer languages, translate personal content, merge local categories or change existing quantities. Incomplete approved legacy snapshots retain their records and historical status but are not eligible for public visibility until replaced with a complete reviewed submission. The new dictionaries are initial reference entries, not automatic mappings to household data.

Migration `0008_high_devos.sql` adds a planner source marker. Existing live references are marked private/public; already orphaned entries are marked unknown. The original title snapshots remain in the database, but unknown/deleted public sources display an unavailable label to avoid exposing foreign-language titles.

Before migrating, keep the complete database/uploads backup, its manifest and a copy of the previous application revision. For rollback, stop the server, preserve any new data separately, restore the matched database **and uploads** using [BACKUP.md](BACKUP.md), and run the matching previous code/dependencies. Do not try to roll back by dropping translation tables or deleting migration journal rows. Restoring the backup discards changes made after that backup. Do not run the new migrations again until you intend to re-upgrade.

## Interface localization

`src/i18n/index.js` loads i18next resources from `src/locales/{sl,en,de}/`. Files are organized by feature: auth, recipes, planner, community, workspaces, settings, super-admin, dashboard, landing and shared/common screens. The same keys exist in every language. Existing labels use stable text-derived keys; new workflow keys have descriptive names. Search the Slovenian JSON files for a label to find its key and the corresponding EN/DE entries.

Use `t('feature:key')` in EJS and `tr('feature:key')` in server code. Express runs each request inside an `AsyncLocalStorage` language context, so asynchronous requests do not change another user's locale. Zod schemas with localized messages are created during validation rather than at module initialization. Recipe/user values must still use escaped EJS output; translation helpers do not mark HTML safe.

Authenticated language preference comes from `users.language`, loaded from SQLite on each request. `POST /language` validates the language and CSRF token, persists account preferences and sets an HTTP-only SameSite cookie. Anonymous pages use that cookie, otherwise Slovenian. Invitation-created accounts inherit the selected interface language. Existing accounts retain their saved preference when signing in.

Only the browser interaction messages are placed in an HTML-escaped metadata attribute. `public/js/i18n.js` reads those messages for dynamic ingredient/step forms, clipboard feedback and serving validation. Dates use the selected locale and Slovenian time; weekly date-only calculations retain UTC date arithmetic. Quantity scaling keeps its existing integer arithmetic and only changes the decimal display separator. Known unit identifiers (`piece`, `tablespoon`, `teaspoon`) have localized labels; existing Slovenian labels are recognized without rewriting stored data during migration. Arbitrary units remain unchanged and are never converted.

## Private recipe translations

- `recipes.original_language` identifies the source language. Source text remains in the existing recipe, ingredient and step tables for backward compatibility and is mirrored into a source translation by the recipe service.
- `recipe_translations` is unique by recipe/language and contains title, description, source revision, review flag and update date.
- `translated_ingredients` references stable recipe-ingredient row IDs and stores translated names/preparation notes. Quantities, units, canonical references and order remain on the shared ingredient rows.
- `translated_steps` references stable step rows. Step order remains in the shared step table.
- Source saves retain row IDs at existing positions, increment `content_revision`, and invalidate all additional translation review flags. Removed rows cascade their translation text. This deliberately favors requiring another review over silently displaying stale text.

Private reads choose a complete, reviewed version in the interface language, otherwise the source language with an explicit indicator. Members can select available complete translations explicitly. Draft translations are editable and show their review state; incomplete versions cannot replace the source display. A reviewed translation requires a title, all ingredient names, preparation notes where the source has them, a description where the source has one, and every step. Translation forms keep quantities and shared metadata read-only. The original author, with an editing role, can edit source text and translations; ordinary members retain their existing reading, comments, favorites and private-note permissions.

## Public cookbook and moderation

`recipe_publications` keeps its original immutable snapshot, source relationship and identity. `publication_translations` is unique by publication/language and contains an independent snapshot, completeness flag, draft/pending/approved/rejected status, feedback and review metadata. Initial source submissions create a matching language record using a database trigger, including legacy-compatible insertions. The legacy parent status mirrors decisions for its original snapshot only; it is not the visibility authority for other languages.

Ordinary public reads require an approved, complete version in the account's selected language. There is **no public content fallback**. This predicate is applied in SQL before search, pagination, counts and sorting; it also protects detail/image delivery, favorites, copying, reading statistics and planner choices. A saved public favorite or meal does not grant access to another language. Unavailable planned public recipes retain the meal record/servings but hide their old title. Private recipes remain accessible regardless of language.

Moderators and originating workspace members can explicitly open language-specific submission previews through review links. These are authorized submission views, not a language-switch bypass for other workspaces. Language review decisions only affect that version. Adding a second language preserves the original snapshot and uses its shared public images. Its source revision and explicit category mapping must match: after source edits, submit a new publication instead of attaching a structurally different translation to an old one. Existing approved text is never overwritten. Revisions/rejections are handled by creating a new publication snapshot, preserving older feedback and approved versions.

Publication drafts can be saved without appearing in the public collection or moderator queue. Their owner workspace must explicitly submit them for review. They are frozen copies: edit the private recipe and create a new draft when text needs revision. No paid or automatic translation service is used.

## Global catalogs

Super Admin tools are at `/super-admin/catalog/categories` and `/super-admin/catalog/ingredients`. Ordinary workspace admins and moderators do not receive this permission.

- `global_categories` has stable IDs/keys and activation status; `global_category_names` holds localized names. Activation requires SL, EN and DE names.
- `global_ingredients` has stable IDs/keys; `global_ingredient_names` and `ingredient_aliases` provide language-specific labels and explicitly approved aliases. SL and EN names are required by the management form; DE may be missing.
- Keys cannot be changed after creation. Names/aliases can be edited. Entries are not automatically merged or deleted. The tools show missing-name counts, per-language indicators and exact normalized duplicate-name candidates for manual comparison.
- `/ingredients/autocomplete?q=...` is authenticated and searches names/aliases in the selected language. Picking a suggestion explicitly links the recipe ingredient to its canonical ID. Custom names remain valid; typing a new custom name clears the explicit link.
- Publishing requires explicitly choosing global category IDs (or deliberately leaving the recipe uncategorized). `publication_categories` stores those references. Local household categories and ingredient catalog records are retained unchanged. Legacy category strings remain in their original snapshots; republish with explicit mappings to add global catalog filters. No name-similarity migration is performed.
- A missing dictionary name can be supplied manually in a recipe translation. A human-reviewed complete recipe-specific name is sufficient for publication; otherwise that language cannot be approved.

## Changed code map

| Files | Responsibility |
| --- | --- |
| `src/i18n/index.js`, `src/locales/**`, `public/js/i18n.js` | Locale detection/context, i18next resources and browser message adapter |
| `src/app.js`, `src/middleware/security.js`, auth/workspace/settings controllers/services | Persisted locale in identity, localized messages and invitation signup |
| `src/db/schema.js`, migrations 0007/0008 and metadata | Additive translation/catalog schema, source backfills and planner provenance |
| `src/services/recipe-translations.js`, `recipes.js` | Completeness, stable references, private fallback, author guards and invalidation |
| `src/services/content-visibility.js`, `community.js`, `recipe-catalog.js`, `recipe-reads.js`, `planner.js` | Approved-language visibility, snapshot moderation, localized search and protected counts/planner |
| `src/services/global-catalog.js`, `src/routes/account-admin.js` | Explicit mapping, autocomplete, Super Admin catalog editing and duplicate candidates |
| `src/services/file-cleanup.js`, `workspace-deletion.js` | Preserve language-version image references and approved secondary-language publications |
| `src/views/**`, `src/styles.css`, `public/css/app.css` | Localized existing screens, language/version selectors, translation/catalog forms and wrapping longer labels |
| `public/js/app.js`, `quantities.js` | Localized interactions, explicit canonical selection, translation serialization and precise locale-aware scaling |
| `tests/i18n.test.js`, `tests/i18n-migration.test.js` | Language/security/translation rules and nonempty upgrade preservation |
| `tests/workspaces.test.js`, `tests/recipe-reads.test.js` | Update synthetic fixtures for explicit global mapping and complete public content |
| `scripts/browser-smoke.js`, `scripts/browser-i18n.js`, `package.json`, lockfile | Existing regression browser flow, multilingual browser checks, i18next dependency |

## Validation commands

Final verification: **71 server tests passed, 0 failed**; `npm run build`, `npm run test:browser` and `npm run test:browser:i18n` all passed. Migration preservation was tested on a nonempty synthetic legacy database. No tests used or migrated the real development database.

```powershell
npm test
npm run build
npm run test:browser
npm run test:browser:i18n
```

Browser tests use an existing Chromium/Chrome/Edge installation or `BROWSER_PATH`. They never use the development database. The multilingual browser suite checks localized login/settings, preferences, source fallback, translation authoring, independent language approval, autocomplete, decimal scaling and EN/DE layouts at 1440/390/320px. Screenshots go to ignored `.runtime/screenshots/`.

## Manual follow-up and intentional limits

Apply the migrations after a matched backup. Translate recipes manually, review the text, map categories explicitly and approve each public language separately. Existing public Slovenian recipes will correctly disappear when selecting English/German until those versions are approved. Have a native speaker review the interface wording before sharing widely. Local category names, recipe text, comments, workspace names, custom units, personal notes and cookbook/source references are user content and are not automatically translated. Catalog tools use manual editing and exact duplicate candidates; approximate matching/automatic merging, automatic translation and AI import are intentionally absent.
