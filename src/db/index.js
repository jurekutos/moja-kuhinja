import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';
export function openDatabase(filename, runMigrations = false) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON'); sqlite.pragma('journal_mode = WAL'); sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  if (runMigrations) migrate(db, { migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) });
  return { db, sqlite };
}
