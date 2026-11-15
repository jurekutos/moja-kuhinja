# Recipe reading statistics

Recipe detail pages show lifetime opens and opens this calendar month. The recipe collection links to `/recipes/statistics`, with workspace/public/all filters and lifetime/month rankings (up to 50 recipes). Summary totals include all counted opens in the selected accessible collection, including recipes outside the ranking limit. Super Admin statistics also show platform-wide aggregate counts without exposing private recipe titles.

An authenticated detail-page request counts once per account, recipe and calendar day in `Europe/Ljubljana`. Refreshes and multiple devices for the same account share that limit. Different accounts contribute separately; authors also count. Collection cards, images, editing, previews and cooking pages do not count. Pending/rejected public submissions do not count. Private recipes and approved public snapshots have independent counters; copying a recipe starts a new counter.

`src/services/recipe-reads.js` owns recording, access checks, counting and ranking. The `recipe_reads` table stores source IDs, reader ID and local calendar date. Unique database indexes enforce daily limits even with concurrent requests. No reader identities are displayed. Private rankings require membership in the active workspace; approved public statistics are available to signed-in users. Revoked publication visibility removes it from regular statistics. Deleted recipes cascade their reading records; surviving public snapshots retain theirs. Totals describe surviving records, rather than an immutable audit log. Historical opens before this feature cannot be reconstructed.

## Enable on an existing installation

Migration `0006_remarkable_strong_guy.sql` adds the table and indexes. It was verified against temporary test databases; the real development database was deliberately not changed. Stop the server, then run from the project directory:

```powershell
npm run backup -- --server-stopped
npm run db:migrate
npm run build
npm run dev
```

The migration runner applies any earlier pending migrations as well. See `ADMINISTRATION.md` for the preceding account/admin migration and explicit Super Admin bootstrap process. Counts start at zero.

Validation: 57 automated tests pass, including daily deduplication, multiple readers, Slovenian midnight/month boundaries, authorization, separate public/private counts, ranking, aggregate totals, detail-route integration and deletion cascades. Browser smoke checks include both statistics filter views at 320px and 390px widths, using temporary data only.
