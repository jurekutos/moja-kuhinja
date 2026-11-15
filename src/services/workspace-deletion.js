import { tr } from '../i18n/index.js';
import { eq,and,inArray,ne,sql } from 'drizzle-orm';
import * as t from '../db/schema.js';
import { audit } from './audit.js';
import { drainFileDeletions } from './file-cleanup.js';
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
export function workspaceDeletionService(db,directory) {
  function authorized(user,id) {
    const superAdmin=db.select({flag:t.users.isSuperAdmin}).from(t.users).where(eq(t.users.id,user.id)).get()?.flag;
    const admin=db.select().from(t.members).where(and(eq(t.members.userId,user.id),eq(t.members.householdId,id),eq(t.members.role,'admin'))).get();
    if(!superAdmin && !admin)fail(tr("workspaces:sc13f2af38bbf"),403);
    const workspace=db.select({id:t.households.id,name:t.households.name}).from(t.households).where(eq(t.households.id,id)).get();
    if(!workspace)fail(tr("workspaces:sabe67755447b"),404);
    return workspace;
  }
  return {
    authorized,
    async remove(user,id,confirmation) {
      db.transaction(tx=>{
        const workspace=authorized(user,id);
        if(typeof confirmation!=='string' || confirmation!==workspace.name)fail(tr("workspaces:s26508b7c4ce0"));
        const recipeIds=tx.select({id:t.recipes.id}).from(t.recipes).where(eq(t.recipes.householdId,id));
        const assets=tx.select().from(t.images).where(inArray(t.images.recipeId,recipeIds)).all().flatMap(image=>[image.filename,image.thumbnail]);
        const discarded=tx.select().from(t.publications).where(and(eq(t.publications.householdId,id),sql`not exists(select 1 from publication_translations pt where pt.publication_id=${t.publications.id} and pt.status='approved')`)).all();
        for(const row of discarded) {for(const image of JSON.parse(row.snapshot).images)assets.push(image.filename,image.thumbnail);for(const version of tx.select().from(t.publicationTranslations).where(eq(t.publicationTranslations.publicationId,row.id)).all())for(const image of JSON.parse(version.snapshot).images||[])assets.push(image.filename,image.thumbnail);}
        for(const filename of new Set(assets)) tx.insert(t.fileDeletions).values({filename,createdAt:new Date().toISOString()}).onConflictDoNothing().run();
        tx.delete(t.mealPlanEntries).where(eq(t.mealPlanEntries.householdId,id)).run();
        tx.delete(t.publications).where(and(eq(t.publications.householdId,id),sql`not exists(select 1 from publication_translations pt where pt.publication_id=${t.publications.id} and pt.status='approved')`)).run();
        tx.update(t.publications).set({householdId:null}).where(eq(t.publications.householdId,id)).run();
        tx.delete(t.recipes).where(eq(t.recipes.householdId,id)).run();
        tx.delete(t.ingredients).where(eq(t.ingredients.householdId,id)).run();
        tx.delete(t.categories).where(eq(t.categories.householdId,id)).run();
        audit(tx,user.id,'workspace_deleted',id);
        tx.delete(t.households).where(eq(t.households.id,id)).run();
      });
      return drainFileDeletions(db,directory);
    },
  };
}
