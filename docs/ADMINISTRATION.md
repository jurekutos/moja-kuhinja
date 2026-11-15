# Account settings, workspace administration and Super Admin

This change adds account settings, voluntary membership leave, workspace rename/delete and a separate platform operations dashboard. Existing invitations, roles, moderation, recipes, favorites and the weekly planner are reused. All destructive tests use temporary synthetic data. **The new migration and owner bootstrap have not been run against the development database.**

## Upgrade an existing installation

Stop the development server first (Ctrl+C). From the project root, with the same Node version used for installation:

```powershell
cd "C:\Users\jurek\Desktop\VSC\moja-kuhinja"
# Only if using the portable Node already present in this checkout:
$env:Path = "$PWD\.runtime\node\node_modules\node\bin;$env:Path"

npm run backup -- --server-stopped
npm run db:migrate
npm run build
```

See [Backup and restore](BACKUP.md) for the matched database/uploads procedure. Confirm that the completed backup has a manifest before applying a migration. Do not reset the database, run setup on an existing installation, or remove runtime data. No new npm dependencies are required.

Migration `0005_clean_mikhail_rasputin.sql` adds:

- `users.is_super_admin` (default false), `users.session_version` (default zero), and nullable `users.created_at`.
- Nullable `households.created_at`.
- `audit_events` (actor/action/workspace/target IDs and UTC timestamp, no passwords, hashes or recipe content).
- `file_deletions` (durable generated-file cleanup queue).
- A nullable, `ON DELETE SET NULL` source workspace reference for community publications.

The migration rebuilds the publications table to change its foreign key. The application migration helper disables foreign keys **before** Drizzle starts its transaction, then restores enforcement. An integrity check inside migration `0005` aborts/rolls back if references are invalid. Tests upgrade a nonempty synthetic database and verify community favorites, planned publication references, accounts and sessions survive. Use `npm run db:migrate`; do not bypass the application's migration helper for this upgrade.

Registration/creation timestamps are recorded for new accounts and workspaces. Older rows stay null and display **Datum ni zabeležen**. New-user/workspace counts do not invent dates for historical rows. Existing zero-version sessions remain valid; no Super Admin permission is assigned by the migration or normal signup/setup.

## Explicitly designate the original owner

Super Admin is separate from workspace roles and `is_moderator`. Even a moderator or workspace admin receives HTTP 403 on Super Admin pages unless `is_super_admin` is explicitly true.

After backup and migration, select the intended **existing** original owner's account by its actual login email:

```powershell
$ownerEmail = Read-Host "Existing application owner's email"
npm run super-admin:grant -- --email "$ownerEmail" --confirm-owner
npm run dev
```

The CLI requires an explicit email and confirmation. It creates no account, never uses the first user/name/hardcoded email to select an owner, refuses if another account is already designated, and is idempotent for the same account. It records a bootstrap audit event only on the initial assignment. This command must be run by the trusted person with filesystem/database access; it is not an HTTP endpoint or a permission available to a workspace admin/moderator. There is no role-granting UI. No real owner account was selected or modified during implementation.

Existing sessions read the current flag from the database on each request. Sign in as the designated account and open `/super-admin`. Workspace admins do not gain this permission when they create/inherit a space. The initial setup's moderator behavior remains unchanged; it does not grant Super Admin.

## Pages (local base URL: http://127.0.0.1:3000)

| URL | Access / purpose |
| --- | --- |
| `/settings` | Every signed-in user, including accounts with no memberships |
| `/workspace` | Current workspace members and existing invitation/role management |
| `/workspaces/:workspaceId/leave` | Confirmation page for leaving one's own workspace |
| `/workspace/delete` | Active workspace admin's exact-name deletion confirmation |
| `/super-admin` | Explicit Super Admin only; live total and trailing-30-day counts |
| `/super-admin/users` | Read-only user metadata, search, sorting and 25-account pages |
| `/super-admin/workspaces` | Workspace metadata, search, sorting and 25-space pages |
| `/super-admin/workspaces/:workspaceId` | Members and roles, membership removal and workspace-delete links |
| `/super-admin/statistics` | SQLite aggregation tables for registrations, spaces, recipes, planned meals and publications |

Operations navigation appears only for Super Admin. **Moj profil** appears in the desktop account section and mobile navigation.

## Personal settings

- Update the display name (1–100 characters); existing content remains attributed to the account. Shared publication snapshots keep their original immutable attribution.
- Email is read-only. Profile/password requests containing email, user ID, privilege flags or other unsupported fields are rejected rather than silently updating them.
- Change password by providing the current password, a different new password (8–1024 characters) and matching confirmation. Argon2id parameters remain 64 MiB/three iterations/one lane. Password fields are never echoed back in errors.
- Changing a password increments the account's session version, invalidates stored sessions and rotates the current session/cookie. Other browsers must sign in again. Version checks also reject old sessions recreated by concurrent requests. Login rechecks the verified hash before issuing a session. Password-change attempts are rate limited.
- View all memberships, roles, member counts, switch spaces, open admin controls or leave through a confirmation page.

## Memberships and administration

Members leave only their own membership. Admins may leave only when another admin remains. The same transaction-safe last-admin rule is used for existing role changes, member removal, voluntary leave and Super Admin removal. After leaving/removal, identity is read from current database memberships; active space selection falls back to another authorized space or a clear **Brez prostora** state. Recipes, photos, comments and other members are not deleted by leaving.

Workspace admins keep existing invitation and member-role controls and can rename their active space (1–100 characters). They cannot rename/delete another space using forged IDs. A dedicated delete page explains the irreversible consequences and requires typing the exact current workspace name. Wrong case/spaces are not accepted. Super Admin uses the same deletion service from its operations pages and can delete without joining a workspace.

## What workspace deletion does

In one database transaction it rechecks permission and exact-name confirmation, queues unused generated image files, removes nonapproved submissions, detaches approved snapshots, deletes workspace recipes and ingredient/category catalogs, and deletes the workspace. Cascades remove its recipe ingredients/steps/images/comments/notes/favorites, memberships, invitations and meal plans. Accounts, unrelated spaces and independent approved snapshots/favorites/photos remain intact. Referencing public plans in other spaces remain intact for approved snapshots. The acting session then selects an authorized remaining workspace.

After commit, cleanup removes only generated UUID-named WebP files absent from **all** surviving recipe and publication references. A failed unlink stays in `file_deletions` for retry by `npm run storage:clean` while the server is stopped. Normal deletion/role-sensitive actions produce audit records with IDs, action and time; deleting a workspace does not delete its audit record. A simulated transaction failure is tested to roll back data and audit changes without touching files.

## Privacy, statistics and limits

- Super Admin lists account names/emails, dates, roles and counts, not private recipe text or private notes. It does not impersonate members or bypass ordinary private-recipe/image permissions. Account deletion and arbitrary password resets are not implemented.
- Statistics use database counts/aggregates. Month buckets use stored UTC timestamps; unknown historical dates are shown separately. Time tables show at most the latest 24 recorded months, and recipe-per-workspace statistics show at most 100 spaces with the most recipes. Full workspace/user inventories are paginated separately.
- Audit records are stored locally; there is no audit-log browsing UI, analytics service, privilege editor, owner-transfer UI or per-workspace restore tool. Users with direct filesystem/SQLite access are trusted operators and can alter the database independently of HTTP permissions.
- A database transaction cannot include filesystem deletes. The queue makes crash/failure cleanup retryable; a matched backup is still necessary for recovery. Restore instructions are in [BACKUP.md](BACKUP.md).
- Workspace/account screens remain server rendered and responsive. New leave, Super Admin membership-removal and workspace-delete confirmations are styled pages, not `alert()` dialogs.

## Validation

`npm test`: **56 passing test groups**, including account/profile/email enforcement, password verification and session revocation, membership leave/fallback, last-admin protection, role separation, rename, safe deletion, unrelated-data/snapshot/photo preservation, file retry behavior, audit rollback, real aggregate counts, pagination, explicit/idempotent owner CLI and legacy-data migration integrity. All fixtures are synthetic and isolated.

`npm run test:browser`: existing recipe/sharing/planner coverage plus profile editing, new admin pages at 320px/390px, password change, wrong-name deletion rejection and a successful synthetic workspace deletion. Desktop screenshots of settings and Super Admin were inspected. Run commands from the project root. No development database was migrated or deleted for these checks.

## Changed files

New code:

- `src/routes/account-admin.js`
- `src/controllers/settings.js`, `src/controllers/workspace-admin.js`, `src/controllers/super-admin.js`
- `src/services/account.js`, `src/services/audit.js`, `src/services/backup.js`, `src/services/file-cleanup.js`, `src/services/workspace-deletion.js`, `src/services/super-admin.js`
- `src/validators/account.js`
- `src/views/settings/index.ejs`
- `src/views/workspaces/delete.ejs`, `src/views/workspaces/empty.ejs`, `src/views/workspaces/leave.ejs`
- `src/views/components/workspace-actions.ejs`
- `src/views/super-admin/index.ejs`, `nav.ejs`, `filters.ejs`, `pagination.ejs`, `users.ejs`, `workspaces.ejs`, `workspace.ejs`, `remove-member.ejs`, `statistics.ejs`
- `scripts/backup.js`, `scripts/grant-super-admin.js`
- `tests/account-admin.test.js`, `tests/admin-upgrade.test.js`
- `src/db/migrations/0005_clean_mikhail_rasputin.sql`, `src/db/migrations/meta/0005_snapshot.json`
- `docs/ADMINISTRATION.md`, `docs/BACKUP.md`

Updated existing code and documentation:

- `src/db/schema.js`, `src/db/index.js`, `src/db/migrations/meta/_journal.json`
- `src/middleware/security.js`, `src/routes/index.js`, `src/app.js`
- `src/controllers/auth.js`, `src/controllers/recipes.js`, `src/controllers/workspaces.js`
- `src/services/workspaces.js`
- `src/views/layouts/header.ejs`, `src/views/layouts/footer.ejs`, `src/views/components/workspace-toolbar.ejs`, `src/views/workspaces/index.ejs`
- `src/styles.css`, generated `public/css/app.css`
- `scripts/setup.js`, `scripts/clean-storage.js`, `scripts/browser-smoke.js`, `package.json`
- `README.md`, `CODE_GUIDE.md`, `docs/WORKSPACES.md`
