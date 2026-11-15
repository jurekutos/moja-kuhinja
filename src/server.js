import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
import { openDatabase } from './db/index.js';
const config = loadConfig();
const connection = openDatabase(config.databasePath);
const app = createApp({ ...connection, config });
const server = app.listen(config.port, config.host, () => console.log(`Moja kuhinja: http://${config.host}:${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { app.locals.sessionStore.close(); connection.sqlite.close(); process.exit(0); }));
