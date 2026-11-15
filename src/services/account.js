import { tr } from '../i18n/index.js';
import argon2 from 'argon2';
import { and, eq, sql } from 'drizzle-orm';
import { users, members, households, sessions } from '../db/schema.js';
import { displayName, passwordChange, rejectFields } from '../validators/account.js';
import { audit } from './audit.js';
export function accountService(db) {
  return {
    publishingRecipes(user, query = {}) {
      const where=sql`r.household_id=${user.householdId} and r.created_by=${user.id} and exists(select 1 from household_members m where m.household_id=r.household_id and m.user_id=${user.id})`;
      const count=db.get(sql`select count(*) as count from recipes r where ${where}`).count;
      const pages=Math.max(1,Math.ceil(count/12));
      const page=Math.max(1,Math.min(pages,Number.parseInt(query.recipePage)||1));
      const rows=db.all(sql`select r.id from recipes r where ${where} order by r.created_at desc,r.id desc limit 12 offset ${(page-1)*12}`);
      return {count,pages,page,rows:rows.map(row=>({...row,publications:db.all(sql`select p.id,v.language,v.status,v.complete from recipe_publications p join publication_translations v on v.publication_id=p.id where p.recipe_id=${row.id} and p.household_id=${user.householdId} order by v.created_at desc,v.id desc limit 12`)}))};
    },
    profile(userId) {
      return db.select({id:users.id,name:users.name,email:users.email,createdAt:users.createdAt}).from(users).where(eq(users.id,userId)).get();
    },
    memberships(userId) {
      return db.select({householdId:households.id,name:households.name,role:members.role,memberCount:sql`(select count(*) from household_members m where m.household_id = ${households.id})`}).from(members).innerJoin(households,eq(households.id,members.householdId)).where(eq(members.userId,userId)).orderBy(households.id).all();
    },
    rename(user,input) {
      rejectFields(input,['_csrf','name']); const name=displayName(input.name);
      db.update(users).set({name}).where(eq(users.id,user.id)).run();
    },
    async changePassword(user,input) {
      passwordChange(input);
      const account=db.select({hash:users.passwordHash,version:users.sessionVersion}).from(users).where(eq(users.id,user.id)).get();
      const valid=account && await argon2.verify(account.hash,input.currentPassword).catch(()=>false);
      if(!valid) throw Object.assign(new Error(tr("auth:sbb81c5ab31f6")),{status:422});
      if(input.currentPassword===input.newPassword) throw Object.assign(new Error(tr("auth:s573f23f1a50f")),{status:422});
      const hash=await argon2.hash(input.newPassword,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
      return db.transaction(tx=>{
        const updated=tx.update(users).set({passwordHash:hash,sessionVersion:account.version+1}).where(and(eq(users.id,user.id),eq(users.passwordHash,account.hash),eq(users.sessionVersion,account.version))).returning({version:users.sessionVersion}).get();
        if(!updated) throw Object.assign(new Error(tr("auth:sed802ae9283e")),{status:409});
        tx.delete(sessions).where(sql`json_extract(${sessions.data}, '$.userId') = ${user.id}`).run();
        audit(tx,user.id,'password_changed');
        return updated.version;
      });
    },
  };
}
