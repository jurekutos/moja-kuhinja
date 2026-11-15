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
  if (runMigrations) {
    try { applyMigrations(db,sqlite); } catch(error) {sqlite.close();throw error;}
  }
  return { db, sqlite };
}
export function applyMigrations(db,sqlite,migrationsFolder=fileURLToPath(new URL('./migrations',import.meta.url))) {
  // SQLite ignores PRAGMA foreign_keys inside a transaction. Disable before Drizzle's
  // transaction so table rebuilds cannot cascade-delete referencing application data.
  if(sqlite.inTransaction)throw new Error('Migrations must run outside an existing transaction.');
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db,{migrationsFolder});
    if(sqlite.pragma('foreign_key_check').length)throw new Error('Migration integrity check failed. Restore the matched backup before starting the server.');
  } finally {sqlite.pragma('foreign_keys = ON');}
}
