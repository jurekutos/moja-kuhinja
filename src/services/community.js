import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, eq, desc, sql } from 'drizzle-orm';
import { publications, communityFavorites } from '../db/schema.js';
import { parseRecipe } from '../validators/recipe.js';
const fail = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
const requireEditor = user => { if (!['admin', 'editor'].includes(user.role)) fail('Za to dejanje potrebujete vlogo urednika ali skrbnika.', 403); };
export function communityService(db, recipeService, imageService, directory) {
  const favorite = (id, userId) => !!db.select().from(communityFavorites).where(and(eq(communityFavorites.publicationId, id), eq(communityFavorites.userId, userId))).get();
  function get(id, user) {
    const row = db.select().from(publications).where(eq(publications.id, id)).get();
    if (!row || row.status !== 'approved' && !user.isModerator && row.householdId !== user.householdId) fail('Recept ni na voljo.', 404);
    return { ...row, recipe: JSON.parse(row.snapshot), favorite: favorite(id, user.id) };
  }
  function list(user, query = {}, scope = 'approved') {
    const conditions = [scope === 'mine' ? eq(publications.householdId, user.householdId) : eq(publications.status, scope === 'reviews' ? 'pending' : 'approved')];
    if (scope === 'reviews' && !user.isModerator) fail('Dostop ni dovoljen.', 403);
    if (typeof query.q === 'string' && query.q.trim()) conditions.push(sql`instr(normalize_sl(json_extract(${publications.snapshot}, '$.title')), normalize_sl(${query.q.trim().slice(0, 160)})) > 0`);
    if (query.favorite === '1') conditions.push(sql`exists (select 1 from community_favorites f where f.publication_id = ${publications.id} and f.user_id = ${user.id})`);
    const count = db.select({ count: sql`count(*)` }).from(publications).where(and(...conditions)).get().count;
    const pages = Math.max(1, Math.ceil(count / 24));
    const page = Math.max(1, Math.min(pages, Number.parseInt(query.page) || 1));
    const rows = db.select().from(publications).where(and(...conditions)).orderBy(desc(publications.createdAt), desc(publications.id)).limit(24).offset((page - 1) * 24).all();
    return { items: rows.map(row => ({ ...row, recipe: JSON.parse(row.snapshot), favorite: favorite(row.id, user.id) })), count, pages, page };
  }
  return {
    get, list,
    async submit(recipeId, user) {
      requireEditor(user);
      const recipe = recipeService.get(recipeId, user.householdId, user.id);
      if (recipe.status !== 'published') fail('Pred oddajo objavite recept v svojem prostoru.');
      if (db.select().from(publications).where(and(eq(publications.recipeId, recipeId), eq(publications.status, 'pending'))).get()) fail('Ta recept že čaka na pregled.');
      const snapshot = { title: recipe.title, description: recipe.description, prepMinutes: recipe.prepMinutes, cookMinutes: recipe.cookMinutes, servings: recipe.servings, sourceType: recipe.sourceType, sourceUrl: recipe.sourceUrl, sourceDescription: recipe.sourceDescription, categories: recipe.categories, ingredients: recipe.ingredients.map(({ name, quantity, unit, note }) => ({ name, quantity, unit, note })), steps: recipe.steps, author: user.name, images: [] };
      try {
        await fs.mkdir(directory, { recursive: true });
        for (const image of recipe.images) {
          const id = randomUUID(); const copy = { filename: `${id}.webp`, thumbnail: `${id}-small.webp` };
          snapshot.images.push(copy);
          await fs.copyFile(path.join(directory, image.filename), path.join(directory, copy.filename));
          await fs.copyFile(path.join(directory, image.thumbnail), path.join(directory, copy.thumbnail));
        }
        return db.transaction(tx => {
          if (tx.select().from(publications).where(and(eq(publications.recipeId, recipeId), eq(publications.status, 'pending'))).get()) fail('Ta recept že čaka na pregled.');
          return tx.insert(publications).values({ recipeId, householdId: user.householdId, submittedBy: user.id, snapshot: JSON.stringify(snapshot), createdAt: new Date().toISOString(), status: 'pending' }).returning({ id: publications.id }).get().id;
        });
      } catch (error) { await imageService.unlinkRows(snapshot.images); throw error; }
    },
    review(id, user, decision, feedback) {
      if (!user.isModerator) fail('Dostop ni dovoljen.', 403);
      const row = get(id, user);
      if (!['approved', 'rejected'].includes(decision)) fail('Izberite odločitev.');
      if (row.status !== 'pending' && !(row.status === 'approved' && decision === 'rejected')) fail('Ta oddaja je že pregledana.');
      if (typeof feedback !== 'string' || feedback.trim().length > 2000 || decision === 'rejected' && !feedback.trim()) fail('Za zavrnitev ali umik dodajte obrazložitev (največ 2000 znakov).');
      db.update(publications).set({ status: decision, feedback: feedback.trim(), reviewedBy: user.id, reviewedAt: new Date().toISOString() }).where(and(eq(publications.id, id), eq(publications.status, row.status))).run();
    },
    toggleFavorite(id, user) {
      const row = get(id, user); if (row.status !== 'approved') fail('Med priljubljene lahko dodate samo odobrene recepte.');
      const where = and(eq(communityFavorites.userId, user.id), eq(communityFavorites.publicationId, id));
      if (favorite(id, user.id)) db.delete(communityFavorites).where(where).run(); else db.insert(communityFavorites).values({ userId: user.id, publicationId: id }).run();
    },
    async copy(id, user) {
      requireEditor(user);
      const publication = get(id, user); if (publication.status !== 'approved') fail('Kopirate lahko samo odobrene recepte.');
      const recipe = publication.recipe;
      const parsed = parseRecipe({ ...recipe, notes: '', status: 'published', categories: recipe.categories.join(', '), ingredientsJson: JSON.stringify(recipe.ingredients.map(i => ({ ...i, quantity: i.quantity ?? '' }))), stepsJson: JSON.stringify(recipe.steps) });
      if (!parsed.success) fail('Recepta ni mogoče kopirati.');
      const recipeId = recipeService.save(parsed.data, user);
      try {
        const files = [];
        for (const image of recipe.images) { const buffer = await fs.readFile(path.join(directory, image.filename)); files.push({ buffer, size: buffer.length, mimetype: 'image/webp' }); }
        await imageService.add(recipeId, files);
        return recipeId;
      } catch(error) { const rows = recipeService.remove(recipeId, user); await imageService.unlinkRows(rows); throw error; }
    },
  };
}
