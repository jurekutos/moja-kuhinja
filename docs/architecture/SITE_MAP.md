# Site map and route access

All application routes below are relative to `/{language}` (`sl`, `en`, `de`). `/si` redirects to `/sl`; unprefixed routes normalize to the selected language. `/robots.txt`, `/sitemap.xml`, static CSS/JS/icons and the marketing image are global. All state changes use POST and CSRF verification. Image multipart bodies are bounded and content-validated. Login, invitations, suggestions and uploads also have rate limits.

The homepage `/` is public for everyone; `/welcome` is its compatibility alias. The signed-in dashboard is `/kitchen`, and login/invitation acceptance/workspace switching navigate there. Signup remains invitation-only; `/register` explains the process. A public detail route only delegates to the private preview controller for authorized reviewers/owners. Private previews are not indexed.

## public-site.js

| Method | Route | Access |
| --- | --- | --- |
| GET | `/robots.txt` | Public; approved and complete selected-language versions only for recipe/image routes |
| GET | `/sitemap.xml` | Public; approved and complete selected-language versions only for recipe/image routes |
| GET | `/welcome` | Public; approved and complete selected-language versions only for recipe/image routes |
| GET | `/` | Public; approved and complete selected-language versions only for recipe/image routes |
| GET | `/community` | Public; approved and complete selected-language versions only for recipe/image routes |
| GET | `/recepti` | Public; approved and complete selected-language versions only for recipe/image routes |
| GET | `/rezepte` | Public; approved and complete selected-language versions only for recipe/image routes |
| GET | `/community/:publicId/images/:index` | Public; approved and complete selected-language versions only for recipe/image routes |
| GET | `/community/:slug` | Public; approved and complete selected-language versions only for recipe/image routes |
| GET | `/about` | Public information; invitation-only registration explanation |
| GET | `/contact` | Public information; invitation-only registration explanation |
| GET | `/privacy` | Public information; invitation-only registration explanation |
| GET | `/legal` | Public information; invitation-only registration explanation |
| GET | `/register` | Public information; invitation-only registration explanation |

## public-library.js

| Method | Route | Access |
| --- | --- | --- |
| GET | `/suggestions/new` | Authenticated |
| POST | `/suggestions` | Authenticated |
| GET | `/super-admin/public-recipes` | Super Admin (database role checked; workspace membership alone is insufficient) |
| GET | `/super-admin/public-recipes/new` | Super Admin (database role checked; workspace membership alone is insufficient) |
| POST | `/super-admin/public-recipes` | Super Admin (database role checked; workspace membership alone is insufficient) |
| POST | `/super-admin/public-recipes/featured` | Super Admin (database role checked; workspace membership alone is insufficient) |
| GET | `/super-admin/public-recipes/:publicationId/edit` | Super Admin (database role checked; workspace membership alone is insufficient) |
| POST | `/super-admin/public-recipes/:publicationId` | Super Admin (database role checked; workspace membership alone is insufficient) |
| POST | `/super-admin/public-recipes/:publicationId/moderate` | Super Admin (database role checked; workspace membership alone is insufficient) |
| POST | `/super-admin/public-recipes/:publicationId/images` | Super Admin (database role checked; workspace membership alone is insufficient) |
| POST | `/super-admin/public-recipes/:publicationId/images/:index/delete` | Super Admin (database role checked; workspace membership alone is insufficient) |

## index.js

| Method | Route | Access |
| --- | --- | --- |
| POST | `/language` | Public; valid token for invitations; CSRF on POST |
| GET | `/login` | Public; valid token for invitations; CSRF on POST |
| POST | `/login` | Public; valid token for invitations; CSRF on POST |
| GET | `/join/:token` | Public; valid token for invitations; CSRF on POST |
| POST | `/join/:token` | Public; valid token for invitations; CSRF on POST |
| POST | `/logout` | Authenticated |
| GET | `/kitchen` | Authenticated |
| GET | `/workspace` | Authenticated |
| POST | `/workspace/switch` | Authenticated |
| POST | `/workspace/invitations` | Authenticated; active workspace admin |
| POST | `/workspace/invitations/:invitationId/revoke` | Authenticated; active workspace admin |
| POST | `/workspace/members/:userId` | Authenticated; active workspace admin |
| GET | `/admin/invitations` | Platform moderator |
| POST | `/admin/invitations` | Platform moderator |
| POST | `/admin/invitations/:invitationId/revoke` | Platform moderator |
| GET | `/submissions` | Authenticated |
| GET | `/admin/reviews` | Platform moderator |
| GET | `/community/:id` | Authenticated; private preview only, normal public detail is handled first |
| GET | `/community/:id/images/:index` | Authenticated |
| POST | `/community/:id/favorite` | Authenticated |
| POST | `/community/:id/copy` | Authenticated; destination membership must be admin/editor (service checked) |
| POST | `/community/:id/submit-draft` | Authenticated; active workspace admin/editor |
| POST | `/community/:id/languages` | Authenticated; active workspace admin/editor |
| POST | `/community/:id/review` | Authenticated |
| GET | `/planner` | Authenticated |
| GET | `/planner/meal` | Authenticated; active workspace admin/editor |
| POST | `/planner/save` | Authenticated; active workspace admin/editor |
| POST | `/planner/remove` | Authenticated; active workspace admin/editor |
| POST | `/planner/preferences` | Authenticated; active workspace admin/editor |
| GET | `/shopping` | Authenticated |
| GET | `/recipes` | Authenticated; household isolation checked in services |
| GET | `/recipes/statistics` | Authenticated; household isolation checked in services |
| GET | `/recipes/new` | Authenticated; active workspace admin/editor; household isolation checked in services |
| POST | `/recipes` | Authenticated; active workspace admin/editor; household isolation checked in services |
| GET | `/ingredients/autocomplete` | Authenticated |
| GET | `/recipes/:id/translations/:language` | Authenticated; active workspace admin/editor; private recipe author; household isolation checked in services |
| POST | `/recipes/:id/translations/:language` | Authenticated; active workspace admin/editor; private recipe author; household isolation checked in services |
| GET | `/recipes/:id` | Authenticated; household isolation checked in services |
| GET | `/recipes/:id/edit` | Authenticated; active workspace admin/editor; private recipe author; household isolation checked in services |
| GET | `/recipes/:id/cook` | Authenticated; household isolation checked in services |
| POST | `/recipes/:id` | Authenticated; active workspace admin/editor; private recipe author; household isolation checked in services |
| POST | `/recipes/:id/delete` | Authenticated; active workspace admin/editor; private recipe author; household isolation checked in services |
| POST | `/recipes/:id/submit` | Authenticated; active workspace admin/editor; household isolation checked in services; legacy pending-snapshot suggestion, never direct publication |
| POST | `/recipes/:id/notes` | Authenticated; household isolation checked in services |
| POST | `/recipes/:id/favorite` | Authenticated; household isolation checked in services |
| POST | `/recipes/:id/comments` | Authenticated; household isolation checked in services |
| POST | `/recipes/:id/comments/:commentId/delete` | Authenticated; household isolation checked in services |
| POST | `/recipes/:id/images` | Authenticated; active workspace admin/editor; private recipe author; household isolation checked in services |
| GET | `/images/:id` | Authenticated; household isolation checked in services |
| POST | `/images/:id/delete` | Authenticated; active workspace admin/editor; private recipe author; household isolation checked in services |
| POST | `/images/:id/cover` | Authenticated; active workspace admin/editor; private recipe author; household isolation checked in services |

## account-admin.js

| Method | Route | Access |
| --- | --- | --- |
| GET | `/settings` | Authenticated |
| POST | `/settings/profile` | Authenticated |
| POST | `/settings/password` | Authenticated |
| GET | `/workspaces/:workspaceId/leave` | Authenticated |
| POST | `/workspaces/:workspaceId/leave` | Authenticated |
| POST | `/workspace/rename` | Authenticated; active workspace admin |
| GET | `/workspace/delete` | Authenticated; active workspace admin |
| POST | `/workspace/delete` | Authenticated; active workspace admin |
| GET | `/super-admin/catalog/:kind` | Super Admin (database role checked; workspace membership alone is insufficient) |
| POST | `/super-admin/catalog/:kind` | Super Admin (database role checked; workspace membership alone is insufficient) |
| GET | `/super-admin` | Super Admin (database role checked; workspace membership alone is insufficient) |
| GET | `/super-admin/users` | Super Admin (database role checked; workspace membership alone is insufficient) |
| GET | `/super-admin/workspaces` | Super Admin (database role checked; workspace membership alone is insufficient) |
| GET | `/super-admin/workspaces/:workspaceId` | Super Admin (database role checked; workspace membership alone is insufficient) |
| GET | `/super-admin/workspaces/:workspaceId/members/:userId/remove` | Super Admin (database role checked; workspace membership alone is insufficient) |
| POST | `/super-admin/workspaces/:workspaceId/members/:userId/remove` | Super Admin (database role checked; workspace membership alone is insufficient) |
| GET | `/super-admin/workspaces/:workspaceId/delete` | Super Admin (database role checked; workspace membership alone is insufficient) |
| POST | `/super-admin/workspaces/:workspaceId/delete` | Super Admin (database role checked; workspace membership alone is insufficient) |
| GET | `/super-admin/statistics` | Super Admin (database role checked; workspace membership alone is insufficient) |

## Query and navigation contracts

- Public directory: `q`, `ingredient`, `category` (global category key), `maxTime` (15/30/60 minutes), `sort` (newest/alpha), authenticated `favorite=1`, and `page`. Filters survive pagination; filtered results are noindex. Cards and images load thumbnail sizes.
- Workspace collection: `view=workspace|all|public`, name/ingredient/category/favorite/author filters and sorting. Existing linked legacy public snapshots and tracked imports are deduplicated when their private recipe also matches. Independently suggested recipes are separate recipes and are never merged by title.
- Private detail: `lang` selects a translation; missing private translations may fall back to the source. Public versions never fall back across languages.
- Admin public editor: `contentLanguage` explicitly selects the content version independently of interface language. Existing content language cannot be changed accidentally by editing.
- `reviewLanguage` authorizes preview only for Super Admin/moderator, owning workspace members, or the author of a dedicated suggestion. It never exposes a pending recipe anonymously.
- `/shopping` remains a coming-soon page. No shopping-list functionality was added.

