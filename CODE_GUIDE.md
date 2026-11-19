# Moja kuhinja: a short guide to the code

Use this guide when changing the application. For installation, account setup and configuration, see [README.md](README.md).

For anonymous public pages, snapshot-only recipe reads, image authorization, canonical URLs, JSON-LD and sitemap generation, see [Public website guide](docs/PUBLIC_WEBSITE.md). Start with `src/routes/public-site.js`, `src/services/public-cookbook.js` and `src/services/seo.js`. Existing private routes remain behind authentication.

For the new landing page, invitations, roles and moderated shared cookbook, see [Workspaces guide](docs/WORKSPACES.md).

For weekly lunch/dinner planning, planned servings and conflict handling, see [Planner guide](docs/PLANNER.md).

For profiles, password changes, leaving/deleting workspaces and explicit Super Admin bootstrap, see [Administration guide](docs/ADMINISTRATION.md). Before real migrations/deletions, follow [Backup and restore](docs/BACKUP.md).

## How the application works

```text
Browser request
  -> routes (choose the handler and check access)
  -> controller (read input, validate, call a service)
  -> service (recipe rules and database operations)
  -> EJS template (render HTML returned to the browser)
```

For example, submitting the new-recipe form sends `POST /recipes`. The route checks authentication and CSRF, the controller validates the form, the recipe service saves the recipe and its related rows in a transaction, and the browser is redirected to the saved recipe's edit page.

## Where to find things

| File or folder | What it does / when to change it |
| --- | --- |
| [src/server.js](src/server.js) | Starts the server, opens the database and handles shutdown. |
| [src/app.js](src/app.js) | Connects Express, EJS, security headers, sessions, services and error handling. It is the application setup, rather than the place for individual recipe features. |
| [src/config/index.js](src/config/index.js) | Reads and validates environment settings. Set local values in `.env`; document new settings in `.env.example`. |
| [src/routes/index.js](src/routes/index.js) | Maps URLs and HTTP methods to handlers. Also applies authentication, CSRF and upload/rate limits. |
| [src/controllers/recipes.js](src/controllers/recipes.js) | Handles recipe pages, form errors, previews, saves, favorites and redirects. |
| [src/controllers/auth.js](src/controllers/auth.js) | Login, password verification, session rotation and logout. |
| [src/routes/account-admin.js](src/routes/account-admin.js) | Authenticated settings, workspace lifecycle and Super Admin routes/guards. |
| [src/services/account.js](src/services/account.js) | Name validation, immutable email, password hashing, session version revocation and membership overview. |
| [src/services/workspace-deletion.js](src/services/workspace-deletion.js) | Transactional deletion, preserved approved snapshots, exact-name checks and queued file cleanup. |
| [src/services/super-admin.js](src/services/super-admin.js) | Read-only metadata inventories and real aggregate statistics; no private recipe content. |
| [src/controllers/workspaces.js](src/controllers/workspaces.js) | Workspace/member forms, invitations, signup and switching spaces. |
| [src/services/workspaces.js](src/services/workspaces.js) | Membership rules, invitation token checks, signup and last-admin protection. |
| [src/controllers/community.js](src/controllers/community.js) | Shared collection pages, review actions and authorized snapshot images. |
| [src/services/community.js](src/services/community.js) | Immutable submissions, moderation, global favorites and workspace copies. |
| [src/services/recipe-catalog.js](src/services/recipe-catalog.js) | The three recipe views: workspace, all accessible recipes, and approved public recipes. Combines filtering, sorting, category options and pagination across both sources. |
| [src/services/planner.js](src/services/planner.js) | Shared weekly meal records, recipe access, serving counts, permissions and stale-edit protection. |
| [src/services/planner-dates.js](src/services/planner-dates.js) | Date-only Monday–Sunday calculations and the current day in Europe/Ljubljana. |
| [src/controllers/planner.js](src/controllers/planner.js) | Week overview, recipe chooser, meal forms and save/remove responses. |
| [src/validators/planner.js](src/validators/planner.js) | Meal date, slot, source, serving count and revision validation. |
| [src/services/recipes.js](src/services/recipes.js) | Recipe reads/writes, household ownership, catalog entries, search, categories, private notes and favorites. |
| [src/services/images.js](src/services/images.js) | Validates, resizes, stores, serves access information for, and removes images. |
| [src/services/session-store.js](src/services/session-store.js) | Persists server-side sessions in SQLite and removes expired sessions. |
| [src/services/comments.js](src/services/comments.js) | Lists and saves shared household recipe comments; only the author can delete a comment. |
| [src/validators/comment.js](src/validators/comment.js) | Requires a nonblank comment of at most 2000 characters. |
| [src/validators/recipe.js](src/validators/recipe.js) | Defines accepted recipe fields, lengths, quantities and publishing requirements using Zod. |
| [src/middleware/security.js](src/middleware/security.js) | Loads the signed-in user, requires login and checks session-bound CSRF tokens. |
| [src/db/schema.js](src/db/schema.js) | Defines tables, columns, foreign keys and indexes using Drizzle. |
| [src/db/index.js](src/db/index.js) | Opens SQLite, enables foreign keys/WAL and optionally applies migrations. |
| [src/db/migrations/](src/db/migrations/) | Versioned SQL changes and Drizzle metadata used to build/update databases. |

## What to edit for common changes

| I want to change... | Start here |
| --- | --- |
| Colors, fonts, spacing or mobile layout | [src/styles.css](src/styles.css), then run `npm run build` or `npm run css:watch`. |
| Sidebar, mobile navigation or shared page frame | [src/views/layouts/header.ejs](src/views/layouts/header.ejs) and [footer.ejs](src/views/layouts/footer.ejs). |
| Dashboard | [src/views/dashboard.ejs](src/views/dashboard.ejs); its data comes from `dashboard()` in the recipe controller. |
| Recipe cards | [src/views/components/card.ejs](src/views/components/card.ejs). |
| Card hearts and private/global card content | [src/views/components/recipe-card.ejs](src/views/components/recipe-card.ejs); `card.ejs` includes it. |
| Public landing page | [src/views/landing.ejs](src/views/landing.ejs). `/` shows it for visitors; `/welcome` shows it to everyone. |
| Memberships, signup or shared cookbook pages | [src/views/workspaces/](src/views/workspaces/) and [src/views/community/](src/views/community/). |
| Shared recipe comments | [src/views/components/comments.ejs](src/views/components/comments.ejs); behavior is in `src/services/comments.js` and the recipe controller. |
| Collection and search controls | [src/views/recipes/index.ejs](src/views/recipes/index.ejs); the three views and filters use `list()` in `src/services/recipe-catalog.js`. The dashboard still uses the workspace-only recipe service. |
| New/edit form | [src/views/recipes/form.ejs](src/views/recipes/form.ejs). |
| Recipe detail or cooking view | [src/views/recipes/detail.ejs](src/views/recipes/detail.ejs); both use this template, with a `cooking` flag. |
| Login page appearance | [src/views/auth/login.ejs](src/views/auth/login.ejs). |
| Coming-soon pages | [src/views/coming-soon.ejs](src/views/coming-soon.ejs). |
| Weekly meal planner | [src/views/planner/](src/views/planner/), with layout rules in `src/styles.css`. Only shopping remains a coming-soon section. |
| Dynamic ingredient/step rows, step ordering, confirmation dialogs or cooking checkboxes | [public/js/app.js](public/js/app.js). |
| Serving-size calculations | [public/js/quantities.js](public/js/quantities.js). It is shared by the browser and server-rendered quantities. |
| Required fields or allowed values | [src/validators/recipe.js](src/validators/recipe.js), plus the corresponding form controls. |
| Upload sizes or image processing | [src/services/images.js](src/services/images.js) and multipart limits in [src/routes/index.js](src/routes/index.js). |
| Port or database/upload locations | `.env`; restart the server after changes. |

Interface text uses feature translation keys from `src/locales/{sl,en,de}/`: `t('feature:key')` in EJS and `tr('feature:key')` in server code. Keep keys complete in all three languages. Recipe/user content is independent and must never be implicitly translated. See [Multilingual architecture and upgrade](docs/MULTILINGUAL.md). In EJS, use `<%= value %>` for user-provided text so HTML is escaped. `<%- ... %>` is used for trusted template includes; do not use it to display recipe content.

## Example: add a recipe field

For a stored field such as `difficulty`:

1. Add the column to `src/db/schema.js` with a suitable default for existing recipes.
2. Add validation and the initial value in `src/validators/recipe.js` (`emptyRecipe()`).
3. Add the form control in `src/views/recipes/form.ejs`.
4. Update the submitted-field mapping in the recipe controller's `save()` so errors retain the new value. Check the recipe service's `save()` too: validated scalar fields are currently passed through to the recipe table, while related lists and private notes are handled separately.
5. Display the value in the detail/card templates as needed.
6. Run `npm run db:generate`, review the generated SQL, then run `npm run db:migrate`.
7. Update relevant tests and run `npm test`. If the form interaction changed, also run `npm run test:browser`.

Changing a schema file alone does not update an existing database. Keep generated migrations and their metadata in version control; create a new migration rather than rewriting one already applied.

## Data ownership to preserve

- A recipe belongs to a **household/workspace**. Its original author must also have an admin/editor role to change it, its translations or images; every server-side read/write must keep the ownership check.
- Users can belong to multiple households/workspaces. The active membership comes from the session and is checked against the database on each request. Members may read authorized private recipes regardless of content language, comment, favorite and save their own notes. Public content additionally requires an approved complete version in the viewer's interface language.
- Global recipes are separate moderated snapshots, not permission changes on private recipes. Keep private notes/comments out of snapshots and use the community image route for snapshot photos. Platform moderators are distinct from workspace admins.
- Favorites and recipe notes belong to an **individual user**. Notes live in `recipe_notes`, not in the shared recipe row.
- Recipe comments live in `recipe_comments` and are visible to the **whole household**. They store the author's user ID and creation time. Adding/deleting uses CSRF-protected POST routes; only authors may delete their own comments. Deleting the recipe also deletes its comments.
- Ingredients have household catalog entries; `recipe_ingredients` stores the recipe-specific quantity, unit, display name and preparation note.
- Steps and image records are separate ordered child rows. The first image is the cover.
- Quantities are decimal text or `null`. Serving changes affect display only; they must not overwrite the base recipe or convert incompatible units.
- Uploaded files live outside `public/`. Use the authorized `/images/:id` route rather than exposing the upload folder as static files.

## Daily commands

Run these from `C:\Users\jurek\Desktop\VSC\moja-kuhinja`:

```powershell
npm run dev          # Start the app with automatic server restarts
npm run css:watch    # In a second terminal while editing styles/templates
npm test             # Server, database, validation and account-setup tests
npm run test:browser # Browser flows; requires an installed Chrome/Edge/Chromium
npm run build        # Generate the final minified stylesheet
```

Open `http://127.0.0.1:3000`. If using this checkout's portable Node, first run:

```powershell
$env:Path = "$PWD\.runtime\node\node_modules\node\bin;$env:Path"
```

Use [tests/app.test.js](tests/app.test.js) for server/recipe behavior, [tests/setup.test.js](tests/setup.test.js) for initial-account setup, and [scripts/browser-smoke.js](scripts/browser-smoke.js) for browser interactions. Tests use isolated temporary data.

## Source files versus generated/local files

Edit `src/styles.css`, not generated `public/css/app.css`. Manage dependencies through `npm install` and `package.json`, rather than hand-editing `package-lock.json` or `node_modules/`.

Keep source code, migrations, the compiled stylesheet and `package-lock.json` in version control. `.env`, `data/`, `node_modules/` and `.runtime/` are local and ignored. `data/` contains real database/upload content: stop the app and back it up before database maintenance; do not delete it to fix a code problem.
## Recipe reading statistics

See [docs/READING_STATS.md](docs/READING_STATS.md) for daily counting rules, statistics filters, the service/table locations and the migration commands needed to enable the feature.
# Verification maintenance

The verification run on 15 November 2026 passed all 72 server tests, the production CSS build and both browser suites. Public website regression coverage lives in `tests/public-site.test.js`; browser workflows live in `scripts/browser-smoke.js` and `scripts/browser-i18n.js`. Tests request language-prefixed URLs explicitly and use isolated temporary databases. Publication controls are exercised through My profile. When changing localized navigation or approval visibility, update these workflows alongside the implementation. See `docs/PUBLIC_WEBSITE.md` for the checks and their limits. Run checks only when explicitly requested, as required by `AGENTS.md`.


## Public library maintenance

`src/services/public-library.js` owns dedicated suggestions, Super Admin snapshot editing, approvals, featured slots and independent public image management. `src/routes/public-library.js` exposes these functions through the existing authenticated router. `src/services/community.js` retains legacy pending submissions and now tracks duplicate-safe private imports. `src/services/seed-public-library.js` and `src/db/public-recipes.js` provide the optional idempotent starter library. `src/views/library/` reuses the existing ingredient/step browser editor and design system. New interface text is in `src/locales/{sl,en,de}/library.json`.

See [implemented application flows](docs/architecture/APPLICATION_FLOWS.md), [routes](docs/architecture/SITE_MAP.md), [fields](docs/architecture/DATABASE_SCHEMA.md) and [relationships](docs/architecture/DATABASE_ERD.md). Apply migration 0009 before using these features. The public homepage is now `/`; private navigation and login use `/kitchen`. `npm run test:browser:library` covers the new UI. Checks still require explicit user authorization under `AGENTS.md`.
