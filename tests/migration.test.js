import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDatabase } from '../src/db/index.js';
test('workspace migration preserves existing recipes, memberships and credentials and bootstraps roles once', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'moja-migration-'));
  const filename = path.join(root,'legacy.sqlite'); const legacy = path.join(root,'migrations');
  await fs.cp('src/db/migrations',legacy,{recursive:true});
  const journalPath = path.join(legacy,'meta','_journal.json'); const journal = JSON.parse(await fs.readFile(journalPath,'utf8')); journal.entries = journal.entries.slice(0,2); await fs.writeFile(journalPath,JSON.stringify(journal));
  const c = openDatabase(filename);
  try {
    migrate(c.db,{migrationsFolder:legacy});
    c.sqlite.prepare('INSERT INTO households (id,name) VALUES (?,?)').run(1,'Existing home');
    for (const id of [1,2]) { c.sqlite.prepare('INSERT INTO users (id,name,email,password_hash) VALUES (?,?,?,?)').run(id,'Existing user',`user${id}@example.test`,'existing-hash'); c.sqlite.prepare('INSERT INTO household_members (user_id,household_id) VALUES (?,?)').run(id,1); }
    c.sqlite.prepare('INSERT INTO recipes (id,household_id,title,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(1,1,'Existing recipe',1,'2026-01-01','2026-01-01');
    migrate(c.db,{migrationsFolder:'src/db/migrations'});
    assert.equal(c.sqlite.prepare('SELECT title FROM recipes WHERE id = 1').get().title,'Existing recipe');
    assert.equal(c.sqlite.prepare('SELECT password_hash FROM users WHERE id = 1').get().password_hash,'existing-hash');
    const memberships = c.sqlite.prepare('SELECT * FROM household_members ORDER BY user_id').all(); assert.equal(memberships.length,2); assert.equal(memberships[0].role,'admin'); assert.equal(memberships[1].role,'editor');
    assert.equal(c.sqlite.prepare('SELECT is_moderator FROM users WHERE id = 1').get().is_moderator,1); assert.equal(c.sqlite.prepare('SELECT is_moderator FROM users WHERE id = 2').get().is_moderator,0);
    assert.deepEqual(c.sqlite.pragma('foreign_key_check'),[]); assert.equal(c.sqlite.pragma('foreign_keys',{simple:true}),1);
    migrate(c.db,{migrationsFolder:'src/db/migrations'}); assert.equal(c.sqlite.prepare('SELECT count(*) n FROM household_members').get().n,2);
  } finally { c.sqlite.close(); await fs.rm(root,{recursive:true,force:true}); }
});
