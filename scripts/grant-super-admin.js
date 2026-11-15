import { and,eq,ne } from 'drizzle-orm';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { audit } from '../src/services/audit.js';
const args=process.argv.slice(2);const flag=args.indexOf('--email');const email=flag>=0?args[flag+1]?.trim().toLowerCase():'';
if(!email || !args.includes('--confirm-owner') || args.length!==3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Usage: npm run super-admin:grant -- --email EXISTING_OWNER_EMAIL --confirm-owner');
const c=openDatabase(loadConfig().databasePath);
try {
  c.db.transaction(tx=>{
    const account=tx.select({id:users.id,flag:users.isSuperAdmin}).from(users).where(eq(users.email,email)).get();
    if(!account)throw new Error('Existing account not found. No account or privileges were created.');
    if(tx.select({id:users.id}).from(users).where(and(eq(users.isSuperAdmin,true),ne(users.id,account.id))).get())throw new Error('A different owner is already designated. No privileges were changed.');
    if(account.flag){console.log('The designated account already has Super Admin access.');return;}
    tx.update(users).set({isSuperAdmin:true}).where(eq(users.id,account.id)).run();
    audit(tx,account.id,'super_admin_bootstrapped',null,account.id);console.log('Super Admin assigned to the explicitly selected existing account.');
  });
} finally {c.sqlite.close();}
