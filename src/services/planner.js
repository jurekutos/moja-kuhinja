import { randomUUID } from 'node:crypto';
import { and, eq, gte, lte, asc } from 'drizzle-orm';
import { mealPlanEntries, members, recipes, publications, households } from '../db/schema.js';
import { parseMeal } from '../validators/planner.js';
import { mondayOf, addDays, todayInLjubljana, dateLabel } from './planner-dates.js';
const fail = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
export function plannerService(db) {
  function membership(user, write = false) {
    const row = db.select().from(members).where(and(eq(members.userId, user.id), eq(members.householdId, user.householdId))).get();
    if (!row) fail('Najprej izberite prostor, katerega član ste.', 403);
    if (write && !['admin', 'editor'].includes(row.role)) fail('Jedilnik lahko urejajo samo skrbniki in uredniki.', 403);
  }
  function preferences(user) {
    const mode = db.select({mode:households.plannerMeals}).from(households).where(eq(households.id,user.householdId)).get().mode;
    return { mode, slots: mode === 'both' ? ['lunch','dinner'] : [mode] };
  }
  function requireEnabled(user,slot) {
    if (!preferences(user).slots.includes(slot)) fail('Ta vrsta obroka je v vašem prostoru skrita. Najprej jo omogočite v nastavitvah jedilnika.');
  }
  function source(user, type, id) {
    if (type === 'workspace') {
      const row = db.select().from(recipes).where(and(eq(recipes.id, id), eq(recipes.householdId, user.householdId))).get();
      if (!row || row.status !== 'published') fail('Izbrani recept ni na voljo. Izberite objavljen recept iz svojega prostora ali odobren javni recept.', 404);
      return { title: row.title, servings: row.servings, href: `/recipes/${id}`, minutes: row.prepMinutes + row.cookMinutes };
    }
    const row = db.select().from(publications).where(and(eq(publications.id, id), eq(publications.status, 'approved'))).get();
    if (!row) fail('Javni recept ni več na voljo. Izberite drug recept.', 404);
    const snapshot = JSON.parse(row.snapshot);
    return { title: snapshot.title, servings: snapshot.servings, href: `/community/${id}`, minutes: snapshot.prepMinutes + snapshot.cookMinutes };
  }
  function hydrate(row, user) {
    if (!row) return null;
    if (!row.recipeId && !row.publicationId) return { ...row, title:row.titleSnapshot,href:null,available:false };
    try {
      return { ...row, ...source(user, row.recipeId ? 'workspace' : 'public', row.recipeId || row.publicationId), servings: row.servings, available: true };
    } catch(error) {
      if (error.status !== 404) throw error;
      return { ...row, title: row.titleSnapshot, href: null, available: false };
    }
  }
  function get(user, date, slot) { return hydrate(db.select().from(mealPlanEntries).where(and(eq(mealPlanEntries.householdId, user.householdId), eq(mealPlanEntries.date, date), eq(mealPlanEntries.slot, slot))).get(), user); }
  function conflict(current, revision) {
    if ((current?.revision || '') !== revision) fail('Ta obrok je medtem spremenil drug član. Osvežite jedilnik in ponovno odprite obrok.', 409);
  }
  return {
    get(user, date, slot) { membership(user); parseMeal({ date, slot }, { requireRecipe: false }); requireEnabled(user,slot); return get(user, date, slot); },
    configure(user,mode) {
      membership(user,true);
      if (!['both','lunch','dinner'].includes(mode)) fail('Izberite kosilo, večerjo ali oba obroka.');
      db.update(households).set({plannerMeals:mode}).where(eq(households.id,user.householdId)).run();
    },
    selection(user, type, id) { membership(user); return source(user, type, id); },
    week(user, value) {
      membership(user); const start = mondayOf(value); const end = addDays(start, 6); const today = todayInLjubljana();
      const rows = db.select().from(mealPlanEntries).where(and(eq(mealPlanEntries.householdId, user.householdId), gte(mealPlanEntries.date, start), lte(mealPlanEntries.date, end))).orderBy(asc(mealPlanEntries.date)).all();
      const names = ['Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota','Nedelja'];
      const {mode,slots} = preferences(user);
      return { start, end, previous: addDays(start, -7), next: addDays(start, 7), today, currentWeek: mondayOf(today), dateLabel,
        days: names.map((name,index) => { const date = addDays(start,index); return { name, date, isToday: date === today, meals: slots.map(slot => ({ slot, label: slot === 'lunch' ? 'Kosilo' : 'Večerja', entry: hydrate(rows.find(row => row.date === date && row.slot === slot),user) })) }; }),
        plannedCount: rows.filter(row=>slots.includes(row.slot)).length,
        hiddenCount: rows.filter(row=>!slots.includes(row.slot)).length,
        plannerMeals:mode,totalSlots:slots.length*7,
      };
    },
    save(user, input) {
      membership(user, true); const meal = parseMeal(input);
      return db.transaction(tx => {
        requireEnabled(user,meal.slot);
        const where = and(eq(mealPlanEntries.householdId,user.householdId),eq(mealPlanEntries.date,meal.date),eq(mealPlanEntries.slot,meal.slot));
        const current = tx.select().from(mealPlanEntries).where(where).get(); conflict(current,meal.revision);
        const recipe = source(user,meal.source,meal.sourceId); const now = new Date().toISOString();
        const data = { recipeId: meal.source === 'workspace' ? meal.sourceId : null, publicationId: meal.source === 'public' ? meal.sourceId : null, titleSnapshot: recipe.title, servings: meal.servings, revision: randomUUID(), updatedBy:user.id, updatedAt:now };
        if (current) tx.update(mealPlanEntries).set(data).where(where).run();
        else tx.insert(mealPlanEntries).values({ ...data, householdId:user.householdId,date:meal.date,slot:meal.slot,createdAt:now }).run();
        return mondayOf(meal.date);
      });
    },
    remove(user, input) {
      membership(user, true); const meal = parseMeal(input, { requireRecipe: false });
      return db.transaction(tx => {
        requireEnabled(user,meal.slot);
        const where = and(eq(mealPlanEntries.householdId,user.householdId),eq(mealPlanEntries.date,meal.date),eq(mealPlanEntries.slot,meal.slot));
        const current = tx.select().from(mealPlanEntries).where(where).get(); conflict(current,meal.revision);
        if (current) tx.delete(mealPlanEntries).where(where).run();
        return mondayOf(meal.date);
      });
    },
  };
}
