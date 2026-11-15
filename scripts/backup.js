import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';
import { backupMatched } from '../src/services/backup.js';
if(!process.argv.includes('--server-stopped'))throw new Error('Stop the server first, then run npm run backup -- --server-stopped.');
const config=loadConfig();const directory=path.resolve('data/backups',new Date().toISOString().replace(/[:.]/g,'-'));
if(directory===config.uploadDir || directory.startsWith(config.uploadDir+path.sep))throw new Error('Backup destination must be outside uploads.');
await fs.mkdir(path.dirname(directory),{recursive:true});const c=openDatabase(config.databasePath);
try {
  await backupMatched(c.sqlite,config.uploadDir,directory);
  console.log('Matched database/uploads backup completed: '+directory);
} finally {c.sqlite.close();}
