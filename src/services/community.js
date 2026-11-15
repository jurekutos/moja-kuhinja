import * as tables from '../db/schema.js';
import { languages,tr } from '../i18n/index.js';
import { publicVersion, snapshotComplete } from './content-visibility.js';
import { globalCatalogService } from './global-catalog.js';
import { drainFileDeletions } from './file-cleanup.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, eq, desc, sql } from 'drizzle-orm';
import { publications, communityFavorites } from '../db/schema.js';
import { parseRecipe } from '../validators/recipe.js';
const fail = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
const requireEditor = user => { if (!['admin', 'editor'].includes(user.role)) fail(tr("community:sb129a6480479"), 403); };
export function communityService(db, recipeService, imageService, directory) {
  const favorite = (id, userId) => !!db.select().from(communityFavorites).where(and(eq(communityFavorites.publicationId, id), eq(communityFavorites.userId, userId))).get();
  function get(id,user,options={}) {
    const row=db.select().from(publications).where(eq(publications.id,id)).get();
    if(!row)fail(tr('common:unavailable'),404);
    const language=options.language || user.language || 'sl';
    const ownWorkspace=Boolean(user.householdId && row.householdId===user.householdId);
    const review=(options.review || row.status!=='approved') && (user.isModerator || ownWorkspace);
    if(options.language && language!==(user.language || 'sl') && !review)fail(tr('common:unavailable'),404);
    const version=db.select().from(tables.publicationTranslations).where(and(eq(tables.publicationTranslations.publicationId,id),eq(tables.publicationTranslations.language,language))).get();
    if(!version || !review && (version.status!=='approved' || !version.complete)) {
      // Unpublished submissions remain visible to their owners and moderators only.
      if(!options.language && row.status!=='approved' && (user.isModerator || ownWorkspace)) {
        const original=JSON.parse(row.snapshot).language || 'sl';
        if(original!==language)return get(id,user,{language:original,review:true});
      }
      fail(tr('common:unavailable'),404);
    }
    const recipe=JSON.parse(version.snapshot);
    const categories=db.all(sql`select gn.name from publication_categories pc join global_categories gc on gc.id=pc.category_id join global_category_names gn on gn.category_id=gc.id where pc.publication_id=${id} and gn.language=${language} and gc.active=1`).map(c=>c.name);
    return {...row,...{status:version.status,snapshot:version.snapshot,feedback:version.feedback,reviewedAt:version.reviewedAt,reviewedBy:version.reviewedBy},language,complete:version.complete,reviewMode:Boolean(review),categoryIds:db.select().from(tables.publicationCategories).where(eq(tables.publicationCategories.publicationId,id)).all().map(v=>v.categoryId),translationOptions:ownWorkspace&&row.recipeId?recipeService.get(row.recipeId,user.householdId,user.id,false).translations.filter(v=>v.complete&&v.reviewed):[],recipe:{...recipe,categories},favorite:favorite(id,user.id)};
  }
  function list(user,query={},scope='approved') {
    if(scope==='reviews'&&!user.isModerator)fail(tr("community:sbdabedf54319"),403);
    const language=user.language || 'sl';
    const conditions=[scope==='mine'?sql`p.household_id=${user.householdId}`:scope==='reviews'?sql`v.status='pending'`:sql`v.status='approved' and v.complete=1 and v.language=${language}`];
    if(typeof query.q==='string'&&query.q.trim())conditions.push(sql`instr(normalize_sl(json_extract(v.snapshot,'$.title')),normalize_sl(${query.q.trim().slice(0,160)}))>0`);
    if(query.favorite==='1')conditions.push(sql`exists(select 1 from community_favorites where publication_id=p.id and user_id=${user.id})`);
    const where=sql.join(conditions,sql` and `);
    const count=db.get(sql`select count(*) as n from recipe_publications p join publication_translations v on v.publication_id=p.id where ${where}`).n;
    const pages=Math.max(1,Math.ceil(count/24)),page=Math.max(1,Math.min(pages,Number.parseInt(query.page)||1));
    const rows=db.all(sql`select p.id,v.language from recipe_publications p join publication_translations v on v.publication_id=p.id where ${where} order by p.created_at desc,p.id desc,v.language limit 24 offset ${(page-1)*24}`);
    return {items:rows.map(row=>get(row.id,user,{language:row.language,review:scope!=='approved'})),count,pages,page};
  }
  return {
    get, list,
    async submit(recipeId, user, options={}) {
      requireEditor(user);
      const language=languages.includes(options.language)?options.language:user.language || 'sl';
      const recipe = recipeService.get(recipeId, user.householdId, user.id,language);
      if(recipe.language!==language || !recipe.translations.some(v=>v.language===language&&v.complete&&v.reviewed))fail(tr('common:incomplete'));
      const mapped=globalCatalogService(db).mapping(options.categoryIds || []);
      if (recipe.status !== 'published') fail(tr("community:sd2501b1425e1"));
      if (db.select().from(publications).where(and(eq(publications.recipeId, recipeId), sql`exists(select 1 from publication_translations pv where pv.publication_id=${publications.id} and pv.language=${language} and pv.status='pending')`)).get()) fail(tr("community:s526e94640967"));
      const snapshot = { language, sourceRevision:recipe.contentRevision, globalCategoryIds:mapped.map(c=>c.id), title: recipe.title, description: recipe.description, prepMinutes: recipe.prepMinutes, cookMinutes: recipe.cookMinutes, servings: recipe.servings, sourceType: recipe.sourceType, sourceUrl: recipe.sourceUrl, sourceDescription: recipe.sourceDescription, categories: mapped.map(c=>c.names[language]), ingredients: recipe.ingredients.map(({ name, quantity, unit, note, canonicalIngredientId }) => ({ name, quantity, unit, note, canonicalIngredientId:canonicalIngredientId || null })), steps: recipe.steps, author: user.name, images: [] };
      try {
        await fs.mkdir(directory, { recursive: true });
        for (const image of recipe.images) {
          const id = randomUUID(); const copy = { filename: `${id}.webp`, thumbnail: `${id}-small.webp` };
          snapshot.images.push(copy);
          await fs.copyFile(path.join(directory, image.filename), path.join(directory, copy.filename));
          await fs.copyFile(path.join(directory, image.thumbnail), path.join(directory, copy.thumbnail));
        }
        return db.transaction(tx => {
          if (tx.select().from(publications).where(and(eq(publications.recipeId, recipeId), sql`exists(select 1 from publication_translations pv where pv.publication_id=${publications.id} and pv.language=${language} and pv.status='pending')`)).get()) fail(tr("community:s526e94640967"));
          const id=tx.insert(publications).values({ recipeId, householdId: user.householdId, submittedBy: user.id, snapshot: JSON.stringify(snapshot), createdAt: new Date().toISOString(), status: 'pending' }).returning({ id: publications.id }).get().id;
          if(options.intent==='draft')tx.update(tables.publicationTranslations).set({status:'draft'}).where(eq(tables.publicationTranslations.publicationId,id)).run();
          mapped.forEach(c=>tx.insert(tables.publicationCategories).values({publicationId:id,categoryId:c.id}).run());
          return id;
        });
      } catch (error) { await imageService.unlinkRows(snapshot.images); throw error; }
    },
    review(id, user, decision, feedback, language=user.language || 'sl') {
      if (!user.isModerator) fail(tr("community:sbdabedf54319"), 403);
      const row = get(id, user,{language,review:true});
      if (!['approved', 'rejected'].includes(decision)) fail(tr("community:sd12ae18e585d"));
      if (row.status !== 'pending' && !(row.status === 'approved' && decision === 'rejected')) fail(tr("community:s9ec437ca030c"));
      if (typeof feedback !== 'string' || feedback.trim().length > 2000 || decision === 'rejected' && !feedback.trim()) fail(tr("community:s2a181e9cacb1"));
      if(decision==='approved'&&(!row.complete||!snapshotComplete(row.recipe)))fail(tr('common:incomplete'));
      const values={status:decision,feedback:feedback.trim(),reviewedBy:user.id,reviewedAt:new Date().toISOString()};
      db.transaction(tx=>{tx.update(tables.publicationTranslations).set(values).where(and(eq(tables.publicationTranslations.publicationId,id),eq(tables.publicationTranslations.language,language),eq(tables.publicationTranslations.status,row.status))).run();
        const original=JSON.parse(tx.select().from(publications).where(eq(publications.id,id)).get().snapshot).language || 'sl';
        if(language===original)tx.update(publications).set(values).where(eq(publications.id,id)).run();
      });
    },
    async addLanguage(id,user,language,categoryIds=[],intent='submit') {
      requireEditor(user);
      const row=db.select().from(publications).where(eq(publications.id,id)).get();
      if(!row || row.householdId!==user.householdId || !row.recipeId)fail(tr("community:sd96eb424fcc7"),404);
      const original=JSON.parse(row.snapshot);
      const source=recipeService.get(row.recipeId,user.householdId,user.id,false);
      if(original.sourceRevision ? original.sourceRevision!==source.contentRevision : source.updatedAt>row.createdAt)fail(tr('common:translationConflict'),409);
      if(db.select().from(tables.publicationTranslations).where(and(eq(tables.publicationTranslations.publicationId,id),eq(tables.publicationTranslations.language,language))).get())fail(tr("community:sc95d93cca1f6"));
      const existing=db.select().from(tables.publicationCategories).where(eq(tables.publicationCategories.publicationId,id)).all().map(v=>v.categoryId).sort();
      if(JSON.stringify(existing)!==JSON.stringify([...categoryIds].sort()))fail(tr('common:invalidTranslation'));
      const temporaryId=await this.submit(row.recipeId,user,{language,categoryIds,intent});
      try { const result=db.transaction(tx=>{
        const version=tx.select().from(tables.publicationTranslations).where(eq(tables.publicationTranslations.publicationId,temporaryId)).get();
        if(!version)fail(tr('common:incomplete'));
        const snapshot=JSON.parse(version.snapshot);
        if(original.sourceRevision && original.sourceRevision!==snapshot.sourceRevision)fail(tr('common:translationConflict'),409);
        for(const image of snapshot.images)for(const filename of [image.filename,image.thumbnail])tx.insert(tables.fileDeletions).values({filename,createdAt:new Date().toISOString()}).onConflictDoNothing().run();
        snapshot.images=original.images;
        tx.update(tables.publicationTranslations).set({publicationId:id,snapshot:JSON.stringify(snapshot)}).where(eq(tables.publicationTranslations.id,version.id)).run();
        // Categories are shared IDs; require the same explicit mapping for another language.
        const existing=tx.select().from(tables.publicationCategories).where(eq(tables.publicationCategories.publicationId,id)).all().map(v=>v.categoryId).sort();
        const selected=[...categoryIds].sort();if(JSON.stringify(existing)!==JSON.stringify(selected))fail(tr('common:invalidTranslation'));
        tx.delete(publications).where(eq(publications.id,temporaryId)).run();
        return id;
      }); await drainFileDeletions(db,directory);return result; } catch(error){const temporary=db.select().from(publications).where(eq(publications.id,temporaryId)).get();if(temporary){db.delete(publications).where(eq(publications.id,temporaryId)).run();await imageService.unlinkRows(JSON.parse(temporary.snapshot).images);}throw error;}
    },
    submitDraft(id,user,language) {
      requireEditor(user);
      const row=get(id,user,{language,review:true});
      if(!user.householdId || row.householdId!==user.householdId || row.status!=='draft' || !row.complete)fail(tr('common:incomplete'));
      db.transaction(tx=>{
        const pending=tx.get(sql`select 1 from publication_translations v join recipe_publications p on p.id=v.publication_id where p.recipe_id=${row.recipeId} and v.language=${language} and v.status='pending'`);
        if(pending)fail(tr('community:s526e94640967'));
        tx.update(tables.publicationTranslations).set({status:'pending'}).where(and(eq(tables.publicationTranslations.publicationId,id),eq(tables.publicationTranslations.language,language),eq(tables.publicationTranslations.status,'draft'))).run();
      });
    },
    toggleFavorite(id, user) {
      const row = get(id, user); if (row.status !== 'approved') fail(tr("community:s77614589df6e"));
      const where = and(eq(communityFavorites.userId, user.id), eq(communityFavorites.publicationId, id));
      if (favorite(id, user.id)) db.delete(communityFavorites).where(where).run(); else db.insert(communityFavorites).values({ userId: user.id, publicationId: id }).run();
    },
    async copy(id, user) {
      requireEditor(user);
      const publication = get(id, user); if (publication.status !== 'approved') fail(tr("community:sd43827bef8b5"));
      const recipe = publication.recipe;
      const parsed = parseRecipe({ ...recipe, originalLanguage:publication.language, notes: '', status: 'published', categories: recipe.categories.join(', '), ingredientsJson: JSON.stringify(recipe.ingredients.map(i => ({ ...i, quantity: i.quantity ?? '' }))), stepsJson: JSON.stringify(recipe.steps) });
      if (!parsed.success) fail(tr("community:s40ece1ee192f"));
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
