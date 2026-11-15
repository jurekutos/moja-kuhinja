import { tr } from '../i18n/index.js';
import { translatedRecipe } from './recipe-translations.js';
import { languages } from '../i18n/index.js';
import { eq, and, desc, asc, inArray, sql } from 'drizzle-orm';
import * as t from '../db/schema.js';
const normalized = value => value.normalize('NFKC').toLocaleLowerCase('sl').trim();
export function recipeService(db) {
  function get(id, householdId, userId, language, explicit = false) {
    const recipe = db.select().from(t.recipes).where(and(eq(t.recipes.id, id), eq(t.recipes.householdId, householdId))).get();
    if (!recipe) { const e = new Error(tr("recipes:sa4704a782416")); e.status = 404; throw e; }
    const result = { ...recipe,
      authorName: db.select({ name: t.users.name }).from(t.users).where(eq(t.users.id, recipe.createdBy)).get()?.name || tr("recipes:s656a540cb186"),
      notes: db.select().from(t.recipeNotes).where(and(eq(t.recipeNotes.userId, userId), eq(t.recipeNotes.recipeId, id))).get()?.body || '',
      ingredients: db.select().from(t.recipeIngredients).where(eq(t.recipeIngredients.recipeId, id)).orderBy(t.recipeIngredients.position).all(),
      stepRows: db.select().from(t.steps).where(eq(t.steps.recipeId, id)).orderBy(t.steps.position).all(),
      steps: db.select().from(t.steps).where(eq(t.steps.recipeId, id)).orderBy(t.steps.position).all().map(s => s.body),
      categories: db.select({ name: t.categories.name }).from(t.categories).innerJoin(t.recipeCategories, eq(t.recipeCategories.categoryId, t.categories.id)).where(eq(t.recipeCategories.recipeId, id)).all().map(c => c.name),
      images: db.select().from(t.images).where(eq(t.images.recipeId, id)).orderBy(t.images.position, t.images.id).all(),
      favorite: !!db.select().from(t.favorites).where(and(eq(t.favorites.userId, userId), eq(t.favorites.recipeId, id))).get(),
    };
    const preferred = language === false ? recipe.originalLanguage : language || db.select({language:t.users.language}).from(t.users).where(eq(t.users.id,userId)).get()?.language || 'sl';
    return translatedRecipe(db,result,preferred,explicit);
  }
  function requireAuthor(id, user) {
    const recipe = get(id, user.householdId, user.id, false);
    if (recipe.createdBy !== user.id || user.role === 'viewer') throw Object.assign(new Error(tr("recipes:sb3b229c84191")), { status: 403 });
    return recipe;
  }
  function save(input, user, id) {
    if (id) requireAuthor(id, user);
    return db.transaction(tx => {
      const { ingredients, steps, categories, notes, ...values } = input;
      const originalLanguage = id ? tx.select().from(t.recipes).where(eq(t.recipes.id,id)).get().originalLanguage : languages.includes(values.originalLanguage) ? values.originalLanguage : user.language || 'sl';
      values.originalLanguage=originalLanguage;
      const old = id ? tx.select().from(t.recipes).where(eq(t.recipes.id,id)).get() : null;
      const revision = old ? old.contentRevision + 1 : 1;
      const now = new Date().toISOString();
      if (id) tx.update(t.recipes).set({ ...values, contentRevision:revision, updatedAt: now }).where(and(eq(t.recipes.id, id), eq(t.recipes.householdId, user.householdId))).run();
      else id = tx.insert(t.recipes).values({ ...values, householdId: user.householdId, createdBy: user.id, createdAt: now, updatedAt: now }).returning({ id: t.recipes.id }).get().id;
      tx.insert(t.recipeNotes).values({ userId: user.id, recipeId: id, body: notes }).onConflictDoUpdate({ target: [t.recipeNotes.userId, t.recipeNotes.recipeId], set: { body: notes } }).run();
      const previousIngredients=tx.select().from(t.recipeIngredients).where(eq(t.recipeIngredients.recipeId,id)).orderBy(t.recipeIngredients.position).all();
      const previousSteps=tx.select().from(t.steps).where(eq(t.steps.recipeId,id)).orderBy(t.steps.position).all();
      for(const row of previousIngredients.slice(ingredients.length))tx.delete(t.recipeIngredients).where(eq(t.recipeIngredients.id,row.id)).run();
      for(const row of previousSteps.slice(steps.length))tx.delete(t.steps).where(eq(t.steps.id,row.id)).run();
      tx.delete(t.recipeCategories).where(eq(t.recipeCategories.recipeId, id)).run();
      ingredients.forEach((item, position) => {
        const normalizedName = normalized(item.name);
        tx.insert(t.ingredients).values({ householdId: user.householdId, name: item.name, normalizedName }).onConflictDoNothing().run();
        const ingredient = tx.select().from(t.ingredients).where(and(eq(t.ingredients.householdId, user.householdId), eq(t.ingredients.normalizedName, normalizedName))).get();
        const canonicalIngredientId=item.canonicalIngredientId || null;
        if(canonicalIngredientId && !tx.select().from(t.globalIngredients).where(eq(t.globalIngredients.id,canonicalIngredientId)).get())throw Object.assign(new Error(tr("recipes:s26eef5141335")),{status:422});
        const values={...item,canonicalIngredientId,recipeId:id,ingredientId:ingredient.id,position};
        if(previousIngredients[position])tx.update(t.recipeIngredients).set(values).where(eq(t.recipeIngredients.id,previousIngredients[position].id)).run();
        else tx.insert(t.recipeIngredients).values(values).run();
      });
      steps.forEach((body,position)=>{if(previousSteps[position])tx.update(t.steps).set({body,position}).where(eq(t.steps.id,previousSteps[position].id)).run();else tx.insert(t.steps).values({recipeId:id,body,position}).run();});
      categories.forEach(name => {
        const normalizedName = normalized(name);
        tx.insert(t.categories).values({ householdId: user.householdId, name, normalizedName }).onConflictDoNothing().run();
        const category = tx.select().from(t.categories).where(and(eq(t.categories.householdId, user.householdId), eq(t.categories.normalizedName, normalizedName))).get();
        tx.insert(t.recipeCategories).values({ recipeId: id, categoryId: category.id }).onConflictDoNothing().run();
      });
      tx.update(t.recipeTranslations).set({reviewed:false}).where(eq(t.recipeTranslations.recipeId,id)).run();
      const sourceValues={title:values.title,description:values.description,revision,reviewed:true,updatedAt:now};
      const source=tx.insert(t.recipeTranslations).values({...sourceValues,recipeId:id,language:originalLanguage}).onConflictDoUpdate({target:[t.recipeTranslations.recipeId,t.recipeTranslations.language],set:sourceValues}).returning().get();
      tx.delete(t.translatedIngredients).where(eq(t.translatedIngredients.translationId,source.id)).run();
      tx.delete(t.translatedSteps).where(eq(t.translatedSteps.translationId,source.id)).run();
      tx.select().from(t.recipeIngredients).where(eq(t.recipeIngredients.recipeId,id)).all().forEach(i=>tx.insert(t.translatedIngredients).values({translationId:source.id,ingredientId:i.id,name:i.name,note:i.note}).run());
      tx.select().from(t.steps).where(eq(t.steps.recipeId,id)).all().forEach(s=>tx.insert(t.translatedSteps).values({translationId:source.id,stepId:s.id,body:s.body}).run());
      return id;
    });
  }
  function list(user, query = {}) {
    const term = typeof query.q === 'string' ? normalized(query.q).slice(0, 160) : '';
    const ingredient = typeof query.ingredient === 'string' ? normalized(query.ingredient).slice(0, 150) : '';
    const conditions = [eq(t.recipes.householdId, user.householdId)];
    // instr() treats '%' and '_' literally. Unicode normalization uses an SQLite function.
    if (term) conditions.push(sql`instr(normalize_sl(${t.recipes.title}), ${term}) > 0`);
    if (ingredient) conditions.push(inArray(t.recipes.id, db.select({ id: t.recipeIngredients.recipeId }).from(t.recipeIngredients).where(sql`instr(normalize_sl(${t.recipeIngredients.name}), ${ingredient}) > 0`)));
    if (query.category && Number.isSafeInteger(Number(query.category))) conditions.push(inArray(t.recipes.id, db.select({ id: t.recipeCategories.recipeId }).from(t.recipeCategories).where(eq(t.recipeCategories.categoryId, Number(query.category)))));
    if (query.favorite === '1') conditions.push(inArray(t.recipes.id, db.select({ id: t.favorites.recipeId }).from(t.favorites).where(eq(t.favorites.userId, user.id))));
    const count = db.select({ count: sql`count(*)` }).from(t.recipes).where(and(...conditions)).get().count;
    const page = Math.max(1, Math.min(Math.max(1, Math.ceil(count / 24)), Number.parseInt(query.page) || 1));
    const rows = db.select().from(t.recipes).where(and(...conditions)).orderBy(query.sort === 'alpha' ? sql`normalize_sl(${t.recipes.title})` : desc(t.recipes.createdAt), desc(t.recipes.id)).limit(24).offset((page - 1) * 24).all();
    return { recipes: rows.map(r => get(r.id, user.householdId, user.id, user.language || 'sl')), count, page, pages: Math.ceil(count / 24) };
  }
  return { get, save, list, requireAuthor,
    saveNotes(id, user, body) {
      get(id, user.householdId, user.id);
      if (typeof body !== 'string' || body.length > 10000) throw Object.assign(new Error(tr("recipes:s0c8829058921")), { status: 422 });
      db.insert(t.recipeNotes).values({ userId: user.id, recipeId: id, body: body.trim() }).onConflictDoUpdate({ target: [t.recipeNotes.userId, t.recipeNotes.recipeId], set: { body: body.trim() } }).run();
    },
    categories: user => db.select().from(t.categories).where(eq(t.categories.householdId, user.householdId)).orderBy(asc(t.categories.name)).all(),
    toggleFavorite(id, user) { get(id, user.householdId, user.id); const where = and(eq(t.favorites.userId, user.id), eq(t.favorites.recipeId, id)); if (db.select().from(t.favorites).where(where).get()) db.delete(t.favorites).where(where).run(); else db.insert(t.favorites).values({ userId: user.id, recipeId: id }).run(); },
    remove(id, user) { const recipe = requireAuthor(id, user); db.delete(t.recipes).where(and(eq(t.recipes.id, id), eq(t.recipes.householdId, user.householdId))).run(); return recipe.images; },
  };
}
export { normalized };
