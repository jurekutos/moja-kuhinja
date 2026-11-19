import { eq } from 'drizzle-orm';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { seedPublicLibrary } from '../src/services/seed-public-library.js';

const email=process.argv.find(v=>v.startsWith('--admin-email='))?.slice(14).trim().toLowerCase();
if(!email)throw new Error('Usage: npm run seed:public -- --admin-email=you@example.com [--publish]');
const config=loadConfig(),connection=openDatabase(config.databasePath);
try {
  const user=connection.db.select().from(users).where(eq(users.email,email)).get();
  if(!user?.isSuperAdmin)throw new Error('Choose an existing Super Admin account. No accounts are created or elevated.');
  console.log(seedPublicLibrary(connection.db,user,config.uploadDir,{publish:process.argv.includes('--publish')}));
}finally{connection.sqlite.close();}
