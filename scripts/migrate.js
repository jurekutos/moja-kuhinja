import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';
const { sqlite } = openDatabase(loadConfig().databasePath, true);
sqlite.close(); console.log('Database migrations applied.');
