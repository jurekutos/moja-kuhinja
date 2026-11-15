# Jedilnik: shared weekly meal planning

Open **Jedilnik** in the sidebar or mobile navigation, or visit `/planner`.

## Use it

1. The current week is shown Monday through Sunday, with **Kosilo** (lunch) and **Večerja** (dinner) for each day.
2. Choose **Dodaj obrok** in a slot. Search for a published workspace recipe or an approved public recipe; filter the collection or use **Moji priljubljeni**.
3. Select **Izberi ta recept**, set **Število porcij** (1–100), then **Shrani obrok**.
4. Use **Uredi obrok** to change the recipe or servings. **Odstrani obrok** asks for confirmation and removes just that planned meal.
5. The arrows select the previous/next week. **Ta teden** returns to the current week, and **Skoči na datum** opens the week containing a chosen date.

Both workspace members see the same stored plan. Admins and editors can change it; read-only members can view it and open recipes. Plans are isolated by active workspace. Switching workspaces changes the planner as well.

### Plan only lunch or dinner

Use **Katere obroke želite načrtovati?** above the weekly grid. Choose **Kosilo in večerja**, **Samo kosilo**, or **Samo večerja**, then select **Shrani prikaz**. Admins and editors can change this workspace-wide preference. It applies to every week and every member; read-only members see the chosen layout.

Hiding a meal type does not delete its planned meals. Enable it again to restore them. The planner counts only visible meals (7 slots for one type, 14 for both) and tells you if the selected week contains hidden planned meals. Hidden meal types cannot be edited through stale form links until re-enabled. Existing and new workspaces default to showing both. Migration `0004` adds the preference in place without rebuilding/deleting workspace records.

The day boundary uses Europe/Ljubljana. Calendar calculations use date-only values and UTC date arithmetic so daylight-saving changes do not shift weekdays. Dates are validated, including leap years, within the supported 1900–2100 range.

## Recipes and servings

- One recipe is allowed per lunch/dinner slot. The same recipe can be used on multiple days.
- Only published workspace recipes and approved public snapshots can be selected. Public recipes can be planned directly, without creating a workspace copy.
- Each planned meal stores its own serving count. Base recipe servings and ingredient quantities are never changed.
- **Odpri recept** opens the recipe with the planned serving count applied to its ingredient display. Browser JavaScript performs the display scaling.
- Existing plans follow edits to workspace recipes. Public recipes use their approved snapshot.
- If a private recipe is deleted or returned to draft, or a public recipe is withdrawn, the meal remains visible with its saved title and an unavailable message. Replace or remove it; there is no broken clickable recipe link.
- A revision token prevents stale forms from overwriting or removing someone else's newer changes. A conflict page links back to the current plan. Refresh to see updates made by another member; there is no live push synchronization.

## Code and database

| File | Purpose |
| --- | --- |
| `src/db/schema.js` | `meal_plan_entries` table |
| `src/db/migrations/0003_lame_doctor_octopus.sql` | Additive planner migration; existing recipes/accounts are unchanged |
| `src/validators/planner.js` | Dates, meal slots, recipe references, revision tokens and serving limits |
| `src/services/planner-dates.js` | Ljubljana's current date, Monday selection, date arithmetic and Slovenian labels |
| `src/services/planner.js` | Membership checks, weekly reads, recipe access, transactional save/remove and conflict detection |
| `src/controllers/planner.js` | Week page, recipe chooser, form errors, conflicts and redirects |
| `src/views/planner/` | Responsive weekly overview, recipe selection/editing and conflict page |
| `src/services/recipe-catalog.js` | Reused search/favorites/pagination; planner excludes drafts via `publishedOnly` |
| `src/styles.css` | Planner layout and mobile day cards |
| `tests/planner.test.js` | Dates, CRUD, permissions, isolation, validation, recipe availability and concurrent edits |

`meal_plan_entries` contains workspace ID, calendar date, lunch/dinner slot, nullable workspace-recipe/publication references, a fallback title, planned servings, revision token, editor and timestamps. A unique index on workspace/date/slot prevents duplicate meals. Foreign keys and check constraints enforce references, source exclusivity, slots and serving limits. Deleted recipe references become null so an unavailable meal can still be recognized and replaced.

State changes use authenticated, CSRF-protected POST requests. The service also verifies current database membership and role. All displayed recipe titles are escaped.

## Verification and next phase

`npm test` passes 43 test groups, including nine planner groups. Browser smoke testing covers choosing a recipe, adding/editing/removing a meal, week navigation, planned serving display, and responsive layouts. Planner screenshots are saved under ignored `.runtime/screenshots/`.

A consistent local database backup was saved under ignored `data/before-planner-<timestamp>.sqlite` before applying the migration. Run `npm run db:migrate` after pulling this change on another installation, then `npm run build`.

Shopping lists remain a placeholder. The planner stores structured recipe references and planned servings for later ingredient aggregation; no shopping-list generation, incompatible-unit conversion, meal notifications, automatic plans or week-copying features are included yet.
