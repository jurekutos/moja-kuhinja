# Matched database and uploads backups

Before a migration or workspace deletion on real data, stop the application completely (Ctrl+C in its server terminal). Do not run backup, restore or offline cleanup while another app process is writing files. All destructive feature tests use temporary synthetic databases and uploads; never point tests at `.env` or personal data.

From the project root:

```powershell
npm run backup -- --server-stopped
```

The command uses SQLite's backup API and copies the entire configured upload directory into a new ignored `data/backups/<timestamp>/` folder. The app must remain stopped for the whole operation so the database and images describe the same state. A `manifest.json` is written only after both copies complete. Treat a backup without that manifest as incomplete. No secrets are printed. Keep `.env` separately and securely; it is intentionally excluded.

Copy the complete backup folder to separate private storage. It contains account hashes, private recipes and photos; it must not be uploaded to GitHub or exposed through `public/`.

## Restore

1. Keep the server stopped and preserve a backup of the current database/uploads first.
2. Select one complete backup (manifest, `kitchen.sqlite`, and the matching `uploads/`). Never mix dates.
3. Move the current configured database and its `-wal`/`-shm` sidecars, if present, and current uploads aside into a separate recovery folder. Do not leave old sidecars beside a restored database.
4. Copy the selected backup's `kitchen.sqlite` to `DATABASE_PATH` and its complete `uploads/` directory to `UPLOAD_DIR`. Restore permissions appropriate for the server account. Preserve your existing `.env`.
5. Run `npm run db:migrate`, then start the app and verify recipes/photos, workspace memberships and login. Old backup sessions may restore login state; use a new `SESSION_SECRET` if all sessions must be invalidated.

## Deletion and recovery

Workspace deletion is transactional in SQLite. Approved community snapshots are detached and preserved. Other workspace records and membership links are removed; users and unrelated spaces survive. Generated files are queued for deletion in the same transaction, then removed after commit only if no current recipe or community snapshot references them. Failed file operations stay queued.

With the app stopped, `npm run storage:clean` retries queued deletions and removes unreferenced generated WebP files. Filesystem operations cannot share SQLite's transaction: after a crash or a permission failure, cleanup may need this retry. Restoring a deleted workspace requires restoring a whole matched backup; this is not a per-workspace undo feature.
