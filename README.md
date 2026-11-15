# Moja kuhinja

The interface now supports Slovenian, English and German, with independent recipe translations, strict language-specific public moderation and multilingual catalogs. Existing installations must stop the server and make a matched backup before applying migrations 0007/0008. See [Multilingual setup, workflows and rollback](docs/MULTILINGUAL.md). These migrations have not been applied to the actual development database during implementation.

For a short explanation of the code and where to make changes, see [Code guide](CODE_GUIDE.md).

Account settings, safe workspace deletion and the separate Super Admin dashboard are described in [Administration](docs/ADMINISTRATION.md). Existing installations must first stop the server, make a [matched backup](docs/BACKUP.md), then run `npm run db:migrate` and `npm run build`. No owner is granted automatically; the guide includes the explicit existing-account bootstrap command. This upgrade has not been applied to the actual development database during implementation.

A Slovenian cookbook with private workspaces, invitations, member roles, a moderated shared recipe collection and a shared weekly meal planner. A local Express/EJS modular monolith, with SQLite/Drizzle migrations and a compiled Tailwind stylesheet. No external runtime services, remote fonts, CDN scripts, Docker, imports or shopping-list implementation. See [Workspaces guide](docs/WORKSPACES.md) for roles and sharing, and [Planner guide](docs/PLANNER.md) for Jedilnik.

## Requirements

- Recommended: **Node.js 26 LTS**, Windows x64 or Ubuntu x64, with its bundled npm. Current LTS releases: <https://nodejs.org/en/download>. The existing Windows Node 22.23.5 installation also passed the integration suite; use Node 26 for new installations.
- PowerShell and a browser on Windows; Git is optional.
- Internet access for the initial npm install. Runtime is entirely local.
- Native dependencies (`better-sqlite3`, `argon2`, `sharp`) normally have prebuilt binaries for supported platforms. If your architecture has no prebuild, install Python 3 and Visual Studio Build Tools with “Desktop development with C++” on Windows; on Ubuntu install `build-essential python3`.

## First run (Windows PowerShell)

From the workspace:

```powershell
cd "C:\Users\jurek\Desktop\VSC\moja-kuhinja"
node --version
npm ci
Copy-Item .env.example .env
```

Generate a random session secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste that value after `SESSION_SECRET=` in `.env`. Never share or commit `.env`. The implementation session has already created an ignored `.env` with a random secret and migrated an empty local database. **Do not overwrite an existing `.env`** when continuing this checkout.

```powershell
npm run db:migrate
npm run setup
npm run build
npm run dev
```

Open **http://127.0.0.1:3000**. CSS is compiled locally; in a second terminal use `npm run css:watch` when changing styles. `npm run dev` restarts the server when source changes; `npm start` runs without the watcher. Restart after changing `.env`.

### Create the two initial accounts

`npm run setup` prompts for the household name and **two separate names, email addresses, passwords and password confirmations**. Password input is hidden, must contain at least 8 characters and must match its confirmation. They are hashed with Argon2id (64 MiB memory, three iterations, parallelism one) before a single transaction creates the household, both users and memberships. No initial passwords are provided or stored in source control, command arguments, environment variables or documentation.

Run this command in an interactive terminal, not a pipeline. It only works when the users table is empty, and validates all inputs before committing. Rerunning it will not replace existing accounts. Signup is invitation-only; there is no open registration or password recovery UI. The first setup account is the workspace admin and platform moderator; the second is an editor.

### Optional portable Node already present in this checkout

The implementation session downloaded Node 26 to ignored `.runtime/node/` without changing the system installation. Until you install Node 26 normally, you can put this directory first in the current terminal's PATH:

```powershell
$env:Path = "$PWD\.runtime\node\node_modules\node\bin;$env:Path"
node --version
npm run setup
npm run dev
```

This temporary download is not part of the project or required on other computers. If switching Node major versions causes a native-module ABI error, rerun `npm ci` using the chosen Node version.

## Configuration

| Variable | Default / purpose |
| --- | --- |
| `NODE_ENV` | `development`; `production` requires HTTPS and secure cookies |
| `HOST` | `127.0.0.1`, local access only |
| `PORT` | `3000` |
| `SESSION_SECRET` | Required; at least 32 characters; use a cryptographically random value |
| `DATABASE_PATH` | `./data/kitchen.sqlite`, resolved from project root |
| `UPLOAD_DIR` | `./data/uploads`, outside `public/` |
| `TRUST_PROXY` | `0`; set `1` only behind exactly one trusted reverse proxy |

Run all npm commands from the project directory. Production must use HTTPS; do not set `NODE_ENV=production` for plain local HTTP because secure session cookies will not work there. A later Ubuntu deployment should use a single application process, a reverse proxy terminating TLS, restricted file permissions, and backups. No hosting was configured here.

## Commands

```text
npm ci                 Install locked dependencies
npm run db:generate    Generate version-controlled SQL and schema snapshots after schema edits
npm run db:migrate     Apply pending migrations (safe to repeat)
npm run setup          Create household and two users interactively
npm run build          Compile/minify Tailwind to public/css/app.css
npm run css:watch      Watch stylesheet/template changes
npm run dev            Watch/restart the local Express server
npm start              Run the server
npm test               Run Node's automated test runner with Supertest
npm run test:browser   Exercise real desktop/mobile flows using an installed browser
npm run storage:clean  Remove unreferenced generated images; stop the server first
npm run backup -- --server-stopped  Back up matched database/uploads after stopping the server
npm run super-admin:grant -- --email EXISTING_OWNER_EMAIL --confirm-owner  Explicit owner bootstrap
```

The compiled stylesheet and migration files are project artifacts. Track them along with `package-lock.json`; ignore `.env`, `node_modules`, SQLite/WAL/SHM files, uploads and `.runtime`.

## Implemented behavior

- Slovenian login, dashboard, collection, create/edit/preview forms, detail, cooking view and honest coming-soon pages. Desktop sidebar and mobile bottom navigation, responsive cards, visible focus states, accessible form labels and system typography supporting Slovenian letters.
- Full household recipe CRUD; drafts can contain only a title, published recipes require at least one ingredient and one step. Preparation/cooking times, base servings, source metadata and categories (comma-separated, normalized per household).
- Personal favorites **and private per-user notes**. Members share recipe content, images and categories, but never another member's notes or favorites.
- Shared recipe comments with author names and timestamps, visible to household members. Comments accept 1–2000 characters after trimming; each author can delete their own comments. Recipe deletion also deletes its comments. The detail page shows comments under “Komentarji”; personal notes remain private.
- Structured ingredient catalog per household, normalized using NFKC and Slovenian lowercase. Display names are retained; recipe rows reference catalog entries. Editing/removing a recipe ingredient does not destroy shared catalog entries. Ingredients and steps can be added, removed and moved up/down.
- Quantity accepts decimal dot or comma, up to four decimal places, nonnegative values and null for “to taste.” Units are free text with suggestions; incompatible units are never converted. Display scaling uses integer arithmetic, rounds once to three decimal places and does not update stored quantities. Very small values can round to zero; the original four-decimal value is preserved.
- Cooking view with large steps, temporary checkboxes and a reset button. Progress is browser-only and resets on reload. Ingredient checkboxes also remain local to the page.
- Name and ingredient search, categories, personal favorites, newest/alphabetical sorting and 24-item pagination. Slovenian case normalization is supported; search preserves diacritic distinctions. Alphabetical ordering uses normalized Unicode order rather than full dictionary collation.
- Up to ten images per recipe; up to five per upload, 8 MiB each and 40 megapixels. MIME and decoded content are checked, supported input formats are JPEG/PNG/WebP. Images are re-encoded to metadata-free WebP with UUID names, a maximum 1600px full view and 600×450 card variant. Animated images are rejected. No original file names or bytes are served. Add images after saving a recipe; set any image as cover, then remove the old one to replace it. Detail pages use full images; collection and gallery use lazy thumbnails.
- Confirmation before deleting recipes/images, flash messages after writes and validation errors preserving submitted values. Preview does not write to the database; image forms are separate from recipe-text saves.

## Architecture and schema

```text
src/app.js             App factory, shared middleware and error handling
src/server.js          Configuration, listen and graceful shutdown
src/config/            Environment validation
src/db/schema.js       Drizzle SQLite schema
src/db/migrations/     Generated version-controlled SQL, journal and snapshots
src/routes/            HTTP routing, auth/upload limits and request middleware
src/controllers/       Form rendering, validation and redirect orchestration
src/services/          Household recipe operations, images and persistent session store
src/validators/        Server-side recipe validation
src/middleware/        Identity, authentication and session-bound CSRF
src/views/             EJS layouts/components and pages
src/styles.css         Tailwind source plus component styling
public/                Compiled CSS, browser modules and local icon
scripts/               Migration, initial setup and offline image cleanup
tests/                 Isolated temporary SQLite integration tests
data/                  Ignored runtime database and uploads
```

Tables and boundaries:

| Table | Ownership / relationship |
| --- | --- |
| `households` | Shared cookbook boundary |
| `users` | Unique normalized email, name, Argon2id hash |
| `household_members` | Multiple workspaces per account; admin/editor/viewer roles |
| `sessions` | Session ID, serialized session and expiry; indexed expiry cleanup |
| `recipes` | Household FK, creator FK, metadata, status and timestamps |
| `ingredients` | Household FK, unique normalized ingredient name |
| `recipe_ingredients` | Recipe FK, optional catalog FK, display name, decimal text/null, unit, note, order |
| `recipe_steps` | Recipe FK, text, unique order within recipe |
| `recipe_images` | Recipe FK, full/thumbnail generated file names and order; first is cover |
| `categories` / `recipe_categories` | Household category catalog and recipe links |
| `favorites` | Unique user/recipe pair |
| `recipe_notes` | Private user/recipe text |
| `invitations` | Hashed, email-bound, expiring and single-use member/workspace invitations |
| `recipe_publications` | Independent recipe/photo snapshots with moderation decisions |
| `community_favorites` | Personal favorites for approved shared recipes |
| `meal_plan_entries` | Shared workspace/date/lunch-or-dinner slot, recipe/publication reference, servings and revision token |
| `recipe_comments` | Shared recipe conversation, author FK, body and timestamp; cascades with recipe deletion |

Foreign keys are enabled, SQLite uses WAL and a five-second busy timeout. Recipe/child updates are transactional, and deletion cascades child rows. Decimal values are text to preserve precision for later quantity calculations. All authorization happens on the server using the session's current database membership; submitted household IDs, catalog IDs and creator IDs are never trusted. Routes do not accept ownership changes.

## Security and operations

- Argon2id, session regeneration at login, HttpOnly/SameSite=Lax cookies (Secure in production), persistent SQLite sessions with seven-day cookie lifetime and expiry pruning.
- Login rate limit: 15 requests per IP per 15 minutes; image uploads: 20 requests per IP per minute. Rate-limit counters are in-process and reset on restart; this is intended for a single-process small household app.
- Every state-changing route requires a session-bound synchronizer CSRF token. Upload tokens are hidden multipart fields, never URL query parameters. Ownership is checked before buffering uploads, and CSRF before file/database writes. Multer has explicit field, file and part limits.
- Helmet headers, strict same-origin scripts/styles, no remote runtime assets, escaped EJS values and validated http(s) source links. Parameterized Drizzle queries; SQL fragments contain only code-owned identifiers.
- Upload processing validates decoded content, re-encodes images, strips metadata, bounds pixel/file sizes, and serves every image through authenticated household authorization. Direct file-system URLs do not exist.
- Normal delete and failed upload paths remove generated files. A filesystem and SQLite transaction cannot be atomic across power loss; stop the server and use `npm run storage:clean` to recover orphan files after interruption. The cleanup command only removes UUID-named generated WebP files absent from the image table.
- Back up the SQLite database and uploads **together while the server is stopped**. Do not copy only the live SQLite file while WAL is active. Restoring a matched snapshot preserves image references.
- Keep `.env` private. Changing `SESSION_SECRET` invalidates all sessions. `/settings` supports changing your own password with current-password verification; arbitrary account resets/deletion are not exposed. Super Admin requires its separate explicit privilege.

## Tests and verification

`npm test` uses a temporary database, applies real migrations and seeds three synthetic accounts across two households. It needs no `.env`, production database, personal data or external services. It covers anonymous access, invalid login, logout/session rotation/cookie flags, CSRF, household isolation, CRUD, validation, drafts/preview, ingredient catalog reuse, step ordering, decimal scaling, private notes/favorites, search, output escaping, image validation/authorization/cover/delete/cleanup, SQLite settings, page rendering and authentication rate limiting. A separate setup test checks both account hashes, normalized emails, password-confirmation rollback and refusal to overwrite existing accounts.

Verified locally: all 43 server-side test groups pass on Node 26.13.1, including comment sharing, author-only deletion, household isolation, CSRF, validation and escaped output. The comment migration has been applied to the local database and Tailwind builds successfully. At initial implementation, `npm audit` reported zero vulnerabilities. Esbuild is overridden to a patched release because the stable Drizzle generator otherwise pulls in an old development-only copy. `allowScripts` explicitly lists native/build dependencies for npm 12 installations.

`npm run test:browser` uses Playwright Core with an **already installed** Chrome, Chromium or Edge. Set `BROWSER_PATH` if your executable is elsewhere; it does not download a browser. The test creates and removes its own temporary SQLite database, users and uploads. Verified flows: login; dynamic ingredient editing and step reordering; preview/save; image upload; serving scaling; favorites; cooking checkboxes/reset; ingredient search; delete confirmation acceptance/cancellation. At 320px and 390px it checks that dashboard, collection, detail, edit, cooking and placeholder pages do not overflow horizontally. Desktop/mobile screenshots are written to ignored `.runtime/screenshots/`. Chrome headless passed locally; visual screenshots were inspected. Other browser engines and assistive technologies have not been manually audited.

## Current limitations and next phase

- No tags in addition to categories, no standalone catalog editor, no password reset, no autosave, and no conflict resolution when both users edit a recipe concurrently. Last saved shared recipe content wins; private notes remain per user.
- JavaScript is required for ingredient/step editing, serving adjustment and the deletion confirmation dialog. Core browsing, login and native form submissions are server-rendered.
- Existing uploads are displayed in preview, but unsaved files are not previewed. Save recipe text before using separate image forms to avoid losing edits.
- Weekly meal planning is implemented: Monday–Sunday, lunch/dinner, planned servings, shared workspace plans, permission checks and stale-edit protection. See [Planner guide](docs/PLANNER.md).
- No automatic URL/photo extraction, shopping lists or PWA features. Shopping still displays “Prihaja kmalu.”
- The next phase can aggregate ingredients from planned meal references and serving counts, preserving incompatible units and supporting manual shopping items. It is not implemented yet.
