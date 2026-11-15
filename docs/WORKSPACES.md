# Workspaces, invitations and the shared cookbook

The application remains local and has not been deployed. Start it with `npm run dev` as described in the README. `/` is the public landing page for visitors; signed-in users still see their dashboard. `/welcome` always shows the landing page.

## Existing accounts

Migration `0002` keeps all existing accounts, password hashes, recipes, images, favorites, notes and comments. The first existing member of each workspace becomes its admin; other existing members become editors. The first existing user becomes the platform moderator. This happens only when the migration is first applied.

An ignored, consistent SQLite backup was saved in `data/before-workspaces-<timestamp>.sqlite` before the local upgrade. Existing upload files were retained. Use your normal matched database/uploads backup process for future maintenance.

On a fresh installation, `npm run setup` creates the initial workspace and two accounts. The first account is its admin and platform moderator; the second is an editor. Invited accounts never automatically become platform moderators.

## Invite someone into your workspace

1. Sign in as a workspace admin.
2. Open **Člani in prostor** (`/workspace`).
3. Under **Povabi člana**, enter their email and choose their role.
4. Select **Ustvari povabilo**, then **Kopiraj povezavo**.
5. Share that link with the intended person. The application does not send email.

Links last seven days, are bound to the supplied email address and can be used only once. Only a hash of the invitation token is stored in the invitation table. The actual link is shown once after creation; create a new one if you lose it. Admins can revoke unused invitations.

Someone without an account enters their name and an eight-character-or-longer password twice. Someone who already has an account signs in with the invited email before accepting; the app never replaces their password. The membership is added to their existing account, and the workspace selector lets them switch between spaces.

## Invite a friend to create a separate workspace

1. Sign in with the platform moderator account.
2. Open **Povabi prijatelje** (`/admin/invitations`).
3. Enter your friend's email and create an invitation.
4. Copy and share the link.

The friend chooses their own workspace name and becomes its admin. Their recipes are separate from yours. They can invite their own members, but cannot create platform invitations or approve global recipes. Ordinary visitors cannot register without an invitation.

`127.0.0.1` links work only on the computer running the app. Invitations work on this local installation for testing; friends on other computers will need a reachable instance of the same application. No domain, external hosting, email service or deployment has been configured by this change.

## Workspace roles

| Action | Skrbnik (admin) | Urednik (editor) | Samo branje (viewer) |
| --- | --- | --- | --- |
| Read recipes, images and cooking view | Yes | Yes | Yes |
| Personal favorites and private notes | Yes | Yes | Yes |
| Add comments; delete own comments | Yes | Yes | Yes |
| Create, edit or delete workspace recipes/images | Yes | Yes | No |
| Copy a global recipe into the workspace | Yes | Yes | No |
| Submit a recipe for moderation | Yes | Yes | No |
| Invite/remove members and change roles | Yes | No | No |

A workspace must retain at least one admin. Promote someone else before removing or demoting the last admin. Permissions are checked on the server and current memberships are loaded on each request; hiding buttons is not the authorization mechanism. Platform moderation is separate from workspace roles.

## Publish a recipe to all workspaces

1. Open a published recipe in your workspace. Drafts cannot be submitted.
2. Select **Pošlji v skupno kuharico** and confirm that you intend to share its content and photos. You must have permission to share them.
3. The app creates an independent snapshot of the recipe, source metadata, attribution and photos. **Private notes, favorites and workspace comments are excluded.**
4. Open **Naše oddaje** (`/submissions`) to follow its status and read the moderator's feedback.
5. The moderator opens **Pregled oddaj** (`/admin/reviews`), reads the submitted copy, and selects **Odobri objavo** or **Zavrni oddajo**. Rejections require feedback.

Only approved snapshots appear in **Skupna kuharica** (`/community`). Every signed-in workspace can browse them. Visitors without an account cannot browse recipe content or images. Pending and rejected submissions are visible only to their workspace members and platform moderators.

Changes to the private original do not change an approved snapshot. Deleting the private original does not remove its global copy or photos. Correct the original and submit a new snapshot when you want another review; only one pending submission per original is allowed. Previous approved versions remain until the moderator withdraws them.

Moderators can open an approved recipe and use **Umakni iz skupne kuharice**, with a reason, to remove it from global browsing. Existing workspace copies remain independent.

## Use the shared cookbook and hearts

- On **Recepti**, use **Moj prostor** for workspace recipes, **Vsi recepti** for workspace recipes plus all approved public snapshots, and **Samo javni** for approved public snapshots only. Public here means shared with signed-in users, not anonymous visitors. Other workspaces' private recipes and pending/rejected submissions are never included.
- Recipe-name search, ingredient search, category filtering, personal favorites, alphabetical/newest sorting and pagination apply across the selected view. Tabs preserve filters and reset the page number; hearts preserve both the view and current list URL. In the combined view, workspace originals and their approved snapshots remain separate recipes.
- Tap a recipe card's heart to add/remove a personal favorite. It is a separate button from the card link and returns to the same list/search filters. Filled hearts are favorites. Both private and approved global cards support it.
- **Moji priljubljeni** follows the selected view: workspace favorites, public favorites, or both. Workspace favorites and global favorites remain separate records; favoriting a public recipe does not copy it.
- **Kopiraj v moj prostor** creates an editable workspace recipe with its own ingredient catalog references and image files. Editing/deleting the copy does not change the global recipe. Repeating the action intentionally makes another copy.
- Global recipes support display-only serving adjustment. Copy one into your workspace to use the existing workspace cooking view, private notes and comments.

## Code map and tests

| File | Responsibility |
| --- | --- |
| `src/services/workspaces.js` | Invitations, signup, memberships, roles and workspace switching |
| `src/controllers/workspaces.js` | Workspace forms and invitation acceptance/session rotation |
| `src/services/community.js` | Submission snapshots, independent images, review decisions, global favorites and copying |
| `src/services/recipe-catalog.js` | Unified workspace/all/public browsing, filters and SQL pagination across both sources |
| `src/controllers/community.js` | Global pages, review actions, authorized image delivery and safe list return URLs |
| `src/middleware/security.js` | Current membership identity and editor/admin/moderator guards |
| `src/views/landing.ejs` | Public marketing/intro page |
| `src/views/workspaces/` | Members, invitations and signup pages |
| `src/views/community/` | Shared collection, submissions and moderation detail |
| `src/views/components/recipe-card.ejs` | Shared private/global card with a quick favorite form |
| `tests/workspaces.test.js` | Roles, invite expiry/revocation/use, signup, multiple memberships, privacy, publishing and copies |
| `tests/migration.test.js` | Upgrade of a nonempty legacy database, role bootstrap and preserved records |

New tables: `invitations`, `recipe_publications`, `community_favorites`. `household_members` now has a composite user/workspace primary key and a role. `users.is_moderator` grants the separate platform moderation permission. Publications use explicit snapshots to keep reviews stable while private recipes change; workspace recipes retain their existing normalized tables.

`npm test` passes 43 test groups at implementation time. `npm run test:browser` also passes, including landing/mobile layout, signup via an invitation, list hearts with preserved filters, submission/approval, global favorites and copying. Screenshots are saved under ignored `.runtime/screenshots/`.

## Current limits

Invitation-only signup, manual link sharing, and a single application process remain intentional. There is no email delivery, email verification, password-reset UI, public open signup, threaded global discussion, notifications, or platform-role management UI. Approved versions are immutable; a new submission is a new version rather than an automatic replacement. Meal planning is now implemented; see [Planner guide](PLANNER.md). Shopping lists, imports and PWA installation remain future work.
