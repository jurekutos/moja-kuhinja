import { sql } from 'drizzle-orm';
import * as t from '../db/schema.js';

export function readingDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function recipeReadService(db, clock = () => new Date()) {
  const source = (user, id, publicRecipe) => publicRecipe
    ? sql`select id from recipe_publications where id=${id} and status='approved'`
    : sql`select r.id from recipes r join household_members m on m.household_id=r.household_id where r.id=${id} and m.user_id=${user.id} and r.household_id=${user.householdId}`;
  return {
    record(user, id, publicRecipe = false) {
      if (!db.get(source(user, id, publicRecipe))) return null;
      db.insert(t.recipeReads).values({ userId: user.id, recipeId: publicRecipe ? null : id, publicationId: publicRecipe ? id : null, day: readingDay(clock()) }).onConflictDoNothing().run();
      return this.counts(user, id, publicRecipe);
    },
    counts(user, id, publicRecipe = false) {
      if (!db.get(source(user, id, publicRecipe))) return null;
      const month = readingDay(clock()).slice(0, 7);
      const key = publicRecipe ? t.recipeReads.publicationId : t.recipeReads.recipeId;
      return db.get(sql`select count(*) as total, coalesce(sum(substr(day,1,7)=${month}),0) as month from ${t.recipeReads} where ${key}=${id}`);
    },
    statistics(user, query = {}) {
      const view = ['workspace', 'public'].includes(query.view) ? query.view : 'all';
      const period = query.period === 'month' ? 'month' : 'total';
      const month = readingDay(clock()).slice(0, 7);
      const visible = sql`select id, title, 'private' as kind from recipes where household_id=${user.householdId} and exists(select 1 from household_members where household_id=${user.householdId} and user_id=${user.id}) and ${Number(view !== 'public')}
        union all select id,json_extract(snapshot,'$.title') as title,'public' as kind from recipe_publications where status='approved' and ${Number(view !== 'workspace')}`;
      const counted = sql`with visible as (${visible}) select v.id,v.title,v.kind,count(r.id) as total,coalesce(sum(substr(r.day,1,7)=${month}),0) as month from visible v left join recipe_reads r on (v.kind='private' and r.recipe_id=v.id) or (v.kind='public' and r.publication_id=v.id) group by v.kind,v.id`;
      const totals = db.get(sql`select coalesce(sum(total),0) as total,coalesce(sum(month),0) as month from (${counted})`);
      const order = period === 'month' ? sql`month` : sql`total`;
      const recipes = db.all(sql`select * from (${counted}) where ${order}>0 order by ${order} desc,title asc,kind,id limit 50`);
      return { view, period, totals, recipes };
    },
  };
}
