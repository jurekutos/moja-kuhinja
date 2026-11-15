import { sql,eq,and } from 'drizzle-orm';
import * as t from '../db/schema.js';
import { readingDay } from './recipe-reads.js';
export function superAdminService(db) {
  function requireOwner(user) {if(!db.select({id:t.users.id}).from(t.users).where(and(eq(t.users.id,user.id),eq(t.users.isSuperAdmin,true))).get())throw Object.assign(new Error('Dostop ni dovoljen.'),{status:403});}
  const count=table=>db.get(sql`select count(*) as n from ${table}`).n;
  function statistics(user) {
    requireOwner(user);
    return {
      reads:db.get(sql`select count(*) as total,coalesce(sum(substr(day,1,7)=${readingDay().slice(0,7)}),0) as month from ${t.recipeReads}`),
      registrations:db.all(sql`select substr(${t.users.createdAt},1,7) as period,count(*) as count from ${t.users} where ${t.users.createdAt} is not null group by period order by period desc limit 24`),
      workspaceCreation:db.all(sql`select substr(${t.households.createdAt},1,7) as period,count(*) as count from ${t.households} where ${t.households.createdAt} is not null group by period order by period desc limit 24`),
      recipesByWorkspace:db.all(sql`select h.id,h.name,count(r.id) as count from households h left join recipes r on r.household_id=h.id group by h.id order by count desc,h.id limit 100`),
      meals:db.all(sql`select slot,count(*) as count from ${t.mealPlanEntries} group by slot order by slot`),
      publications:db.all(sql`select status,count(*) as count from ${t.publications} group by status order by status`),
      unknownUsers:db.get(sql`select count(*) as n from ${t.users} where ${t.users.createdAt} is null`).n,
      unknownWorkspaces:db.get(sql`select count(*) as n from ${t.households} where ${t.households.createdAt} is null`).n,
    };
  }
  function pagination(query,count) {const pages=Math.max(1,Math.ceil(count/25));return {pages,page:Math.max(1,Math.min(pages,Number.parseInt(query.page)||1)),count};}
  return {
    requireOwner,statistics,
    summary(user) {
      requireOwner(user);const since=new Date(Date.now()-30*86400000).toISOString();
      return {users:count(t.users),workspaces:count(t.households),memberships:count(t.members),recipes:count(t.recipes),approved:db.get(sql`select count(*) n from ${t.publications} where status='approved'`).n,meals:count(t.mealPlanEntries),recentUsers:db.get(sql`select count(*) n from ${t.users} where created_at >= ${since}`).n,recentWorkspaces:db.get(sql`select count(*) n from ${t.households} where created_at >= ${since}`).n};
    },
    users(user,query={}) {
      requireOwner(user);const q=typeof query.q==='string'?query.q.trim().slice(0,160):'';
      const where=sql`instr(normalize_sl(name),normalize_sl(${q}))>0 or instr(normalize_sl(email),normalize_sl(${q}))>0`;
      const paging=pagination(query,db.get(sql`select count(*) n from ${t.users} where ${where}`).n);
      const order=query.sort==='name'?sql`normalize_sl(name),id`:query.sort==='oldest'?sql`created_at asc,id asc`:sql`created_at desc,id desc`;
      const rows=db.all(sql`select id,name,email,created_at as createdAt,is_moderator as isModerator,is_super_admin as isSuperAdmin from ${t.users} where ${where} order by ${order} limit 25 offset ${(paging.page-1)*25}`);
      const ids=rows.map(r=>r.id);const membershipRows=ids.length?db.all(sql`select m.user_id as userId,m.household_id as workspaceId,h.name,m.role from household_members m join households h on h.id=m.household_id where m.user_id in (${sql.join(ids.map(id=>sql`${id}`),sql`, `)}) order by h.id`):[];
      return {...paging,rows:rows.map(row=>({...row,memberships:membershipRows.filter(m=>m.userId===row.id)}))};
    },
    workspaces(user,query={}) {
      requireOwner(user);const q=typeof query.q==='string'?query.q.trim().slice(0,160):'';const where=sql`instr(normalize_sl(h.name),normalize_sl(${q}))>0`;
      const paging=pagination(query,db.get(sql`select count(*) n from households h where ${where}`).n);
      const order=query.sort==='name'?sql`normalize_sl(h.name),h.id`:query.sort==='oldest'?sql`h.created_at asc,h.id asc`:sql`h.created_at desc,h.id desc`;
      const rows=db.all(sql`select h.id,h.name,h.created_at as createdAt,(select count(*) from household_members m where m.household_id=h.id) as memberCount,(select count(*) from recipes r where r.household_id=h.id) as recipeCount from households h where ${where} order by ${order} limit 25 offset ${(paging.page-1)*25}`);
      const ids=rows.map(r=>r.id);const admins=ids.length?db.all(sql`select m.household_id as workspaceId,u.name from household_members m join users u on u.id=m.user_id where m.role='admin' and m.household_id in (${sql.join(ids.map(id=>sql`${id}`),sql`, `)}) order by u.id`):[];
      return {...paging,rows:rows.map(row=>({...row,admins:admins.filter(a=>a.workspaceId===row.id).map(a=>a.name)}))};
    },
    detail(user,id) {requireOwner(user);const workspace=db.select({id:t.households.id,name:t.households.name,createdAt:t.households.createdAt}).from(t.households).where(eq(t.households.id,id)).get();if(!workspace)throw Object.assign(new Error('Prostor ne obstaja.'),{status:404});return workspace;},
  };
}
