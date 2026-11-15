import { sql } from 'drizzle-orm';
export const publicVersion = (id,language) => sql`select pt.id from publication_translations pt where pt.publication_id=${id} and pt.language=${language} and pt.status='approved' and pt.complete=1`;
export const publicSnapshot = (id,language) => sql`select pt.snapshot from publication_translations pt where pt.publication_id=${id} and pt.language=${language} and pt.status='approved' and pt.complete=1`;
export const privateVersion = (id,language) => sql`select tr.id from recipe_translations tr join recipes r on r.id=tr.recipe_id where tr.recipe_id=${id} and tr.language=${language} and tr.reviewed=1 and tr.revision=r.content_revision and length(trim(tr.title))>0
  and (select count(*) from translated_ingredients ti where ti.translation_id=tr.id and length(trim(ti.name))>0)=(select count(*) from recipe_ingredients i where i.recipe_id=r.id)
  and (select count(*) from translated_steps ts where ts.translation_id=tr.id and length(trim(ts.body))>0)=(select count(*) from recipe_steps s where s.recipe_id=r.id)`;
export function snapshotComplete(snapshot) {
  return Boolean(snapshot && typeof snapshot.title==='string' && snapshot.title.trim() && Array.isArray(snapshot.ingredients) && snapshot.ingredients.length && snapshot.ingredients.every(i=>typeof i.name==='string'&&i.name.trim()) && Array.isArray(snapshot.steps) && snapshot.steps.length && snapshot.steps.every(s=>typeof s==='string'&&s.trim()));
}
