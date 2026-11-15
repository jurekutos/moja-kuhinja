import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';
import { images, publications } from '../src/db/schema.js';
import { drainFileDeletions } from '../src/services/file-cleanup.js';
// Offline maintenance repairs files left behind by an interrupted filesystem/DB write.
const config = loadConfig(); const { db, sqlite } = openDatabase(config.databasePath);
const pending=await drainFileDeletions(db,config.uploadDir);
const used = new Set(db.select().from(images).all().flatMap(i => [i.filename, i.thumbnail]));
for (const row of db.select().from(publications).all()) for (const image of JSON.parse(row.snapshot).images) { used.add(image.filename); used.add(image.thumbnail); }
let count = 0;
for (const file of await fs.readdir(config.uploadDir).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
  if (/^[a-f0-9-]{36}(-small)?\.webp$/.test(file) && !used.has(file)) { await fs.unlink(path.join(config.uploadDir, file)); count++; }
}
sqlite.close(); console.log(`Removed ${count} unreferenced image files. Queued files still pending: ${pending}. Run only while the server is stopped.`);
